import * as vscode from 'vscode';
import { computeRelativePath } from './relativePath';
import { ensureSyncRoot } from './syncRoot';
import { SyncSecretManager } from './secretManager';
import { checkAndOfferUtf8Conversion } from './encoding';

/** 같은 위치에서 이만큼(1분) 안 움직이면 원격에도 체크포인트를 남긴다 — Android 쪽과 동일 값. */
const CHECKPOINT_IDLE_MS = 60_000;

/**
 * 원격이 이만큼(문자 수) 넘게 앞서 있을 때만 "더 읽으셨어요" 팝업을 띄운다 — VSCode 커서 오프셋과
 * 안드로이드 페이지 오프셋은 애초에 가리키는 단위가 달라서(문자 단위 vs 페이지 시작 지점) 실제로는
 * 같은 곳을 읽고 있어도 수백 자 정도 어긋날 수 있다. Android 쪽과 동일 값.
 */
const MIN_OFFSET_DIFF_TO_NOTIFY = 500;

interface DocState {
	relativePath: string;
	lastKnownOffset: number;
	lastRemoteSyncedOffset?: number;
	checkpointTimer?: ReturnType<typeof setTimeout>;
}

/**
 * 읽기 위치 추적 + 원격(Supabase) 동기화 트리거 (.docs/VSCODE_SYNC_PLAN.md §5).
 *
 * 커서가 움직일 때마다 매번 올리면 낭비라, 아래 경로로만 원격에 반영한다 — Android 앱의 체크포인트 +
 * 화면 이탈/복귀 모델과 대칭:
 * 1) 같은 위치에서 CHECKPOINT_IDLE_MS(1분) 이상 머무르면(체크포인트)
 * 2) 이 파일이 편집창에서 안 보이게 되면(onDidChangeVisibleTextEditors) — 탭 전환/닫기
 * 3) VSCode 창이 OS 포커스를 잃으면(onDidChangeWindowState, focused: false) — 알트탭, 최소화, Win+D,
 *    가상 데스크톱 전환 전부 포함. (2)와 (3)을 둘 다 걸어야 하는 이유는 서로 다른 레이어라서다 —
 *    분할 편집 중 포커스만 옮기는 건 (2)로 안 잡히고(파일이 여전히 보임), 창을 최소화하는 건 (3) 없인
 *    안 잡힌다(visibleTextEditors는 안 바뀜).
 *
 * 읽기(비교)는 반대 방향 — 파일이 새로 보이게 되거나(최초로 열 때 포함) 창이 다시 포커스를 얻을 때.
 */
export class PositionTracker {
	private readonly states = new Map<string, DocState>();
	private visiblePaths = new Set<string>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly secretManager: SyncSecretManager,
	) {
		context.subscriptions.push(
			vscode.window.onDidChangeVisibleTextEditors((editors) => void this.onVisibleEditorsChanged(editors)),
			vscode.window.onDidChangeWindowState((state) => void this.onWindowStateChanged(state)),
			vscode.window.onDidChangeTextEditorSelection((e) => void this.trackEditor(e.textEditor)),
		);
	}

	/** 확장 활성화 시 한 번 호출 — 이미 열려 있는 편집기들을 "새로 보이게 됨"으로 취급해 초기 확인을 겸한다. */
	async initialize(): Promise<void> {
		await this.onVisibleEditorsChanged(vscode.window.visibleTextEditors);
	}

	/** 창 포커스 상실/확장 비활성화 시 최선노력으로 즉시 반영. */
	async flushAll(): Promise<void> {
		for (const fsPath of this.visiblePaths) {
			await this.flushNow(fsPath);
		}
	}

	private async relativePathFor(document: vscode.TextDocument): Promise<string | null> {
		if (document.uri.scheme !== 'file') {
			return null;
		}
		if (!document.uri.fsPath.toLowerCase().endsWith('.txt')) {
			return null;
		}
		const root = await ensureSyncRoot();
		if (!root) {
			return null;
		}
		return computeRelativePath(root, document.uri.fsPath);
	}

	private async onVisibleEditorsChanged(editors: readonly vscode.TextEditor[]): Promise<void> {
		const relevant: Array<{ editor: vscode.TextEditor; relativePath: string }> = [];
		for (const editor of editors) {
			const relativePath = await this.relativePathFor(editor.document);
			if (relativePath) {
				relevant.push({ editor, relativePath });
			}
		}
		const newPaths = new Set(relevant.map((r) => r.editor.document.uri.fsPath));

		// 안 보이게 된 파일 — 체크포인트를 기다리지 않고 즉시 원격 반영
		for (const fsPath of this.visiblePaths) {
			if (!newPaths.has(fsPath)) {
				await this.flushNow(fsPath);
			}
		}

		// 새로 보이게 된 파일(최초로 여는 경우 포함) — 인코딩 점검 후 원격 확인
		for (const { editor, relativePath } of relevant) {
			const fsPath = editor.document.uri.fsPath;
			if (!this.visiblePaths.has(fsPath)) {
				await checkAndOfferUtf8Conversion(editor.document);
				this.track(fsPath, relativePath, editor.document.offsetAt(editor.selection.active));
				await this.checkRemote(editor.document, fsPath);
			}
		}

		this.visiblePaths = newPaths;
	}

	private async onWindowStateChanged(state: vscode.WindowState): Promise<void> {
		for (const fsPath of this.visiblePaths) {
			if (!state.focused) {
				await this.flushNow(fsPath);
				continue;
			}
			const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === fsPath);
			if (editor) {
				await this.checkRemote(editor.document, fsPath);
			}
		}
	}

	private async trackEditor(editor: vscode.TextEditor): Promise<void> {
		const relativePath = await this.relativePathFor(editor.document);
		if (!relativePath) {
			return;
		}
		const fsPath = editor.document.uri.fsPath;
		this.track(fsPath, relativePath, editor.document.offsetAt(editor.selection.active));
	}

	private track(fsPath: string, relativePath: string, offset: number): void {
		const state = this.states.get(fsPath) ?? { relativePath, lastKnownOffset: offset };
		state.relativePath = relativePath;
		state.lastKnownOffset = offset;
		this.states.set(fsPath, state);
		this.resetCheckpoint(fsPath);
	}

	private resetCheckpoint(fsPath: string): void {
		const state = this.states.get(fsPath);
		if (!state) {
			return;
		}
		if (state.checkpointTimer) {
			clearTimeout(state.checkpointTimer);
		}
		state.checkpointTimer = setTimeout(() => void this.flushNow(fsPath), CHECKPOINT_IDLE_MS);
	}

	private async flushNow(fsPath: string): Promise<void> {
		const state = this.states.get(fsPath);
		if (!state) {
			return;
		}
		if (state.checkpointTimer) {
			clearTimeout(state.checkpointTimer);
			state.checkpointTimer = undefined;
		}
		if (state.lastRemoteSyncedOffset === state.lastKnownOffset) {
			return;
		}
		const client = await this.secretManager.getVerifiedClient();
		if (!client) {
			return;
		}
		state.lastRemoteSyncedOffset = state.lastKnownOffset;
		await client.upsert(state.relativePath, state.lastKnownOffset, 'UTF-8');
	}

	private async checkRemote(document: vscode.TextDocument, fsPath: string): Promise<void> {
		const state = this.states.get(fsPath);
		if (!state) {
			return;
		}
		const client = await this.secretManager.getVerifiedClient();
		if (!client) {
			return;
		}
		const remote = await client.fetchPosition(state.relativePath);
		if (!remote || remote.charOffset - state.lastKnownOffset <= MIN_OFFSET_DIFF_TO_NOTIFY) {
			return;
		}
		await this.notifyFurtherPosition(document, remote.charOffset);
	}

	private async notifyFurtherPosition(document: vscode.TextDocument, offset: number): Promise<void> {
		const total = document.getText().length;
		const percent = total > 0 ? ((offset / total) * 100).toFixed(1) : '0.0';
		const choice = await vscode.window.showInformationMessage(
			`다른 기기에서 더 읽으셨어요 — ${percent}% 지점까지 읽으셨네요. 그 위치로 이동할까요?`,
			'이동',
		);
		if (choice === '이동') {
			await this.jumpTo(document, offset);
		}
	}

	private async jumpTo(document: vscode.TextDocument, offset: number): Promise<void> {
		const editor = await vscode.window.showTextDocument(document);
		const position = document.positionAt(offset);
		editor.selection = new vscode.Selection(position, position);
		editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
		this.track(document.uri.fsPath, this.states.get(document.uri.fsPath)?.relativePath ?? '', offset);
	}
}
