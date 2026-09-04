import * as vscode from 'vscode';
import { computeRelativePath } from './relativePath';
import { ensureSyncRoot } from './syncRoot';
import { SyncSecretManager } from './secretManager';
import { checkAndOfferUtf8Conversion } from './encoding';

/**
 * A checkpoint is also pushed to the remote if the cursor stays at the same spot for at least this
 * long (5 minutes) — same value as the Android side. This used to be 1 minute; anticipating more
 * users, the immediate-on-screen-exit path was left as-is and only this interval was widened, to cut
 * down on remote write frequency (see the android-moonkata-reader repo's SYNC_MULTIUSER_PLAN.md
 * stage 2).
 */
const CHECKPOINT_IDLE_MS = 300_000;

/**
 * The "you've read further" popup only shows once the remote is at least this many characters
 * ahead — VS Code's cursor offset and the Android app's page offset point to different units to
 * begin with (character position vs. page-start position), so even reading the exact same spot can
 * legitimately differ by a few hundred characters. Same value as the Android side.
 */
const MIN_OFFSET_DIFF_TO_NOTIFY = 500;

/**
 * Minimum interval between remote lookups (checkRemote) — switching tabs or window focus repeatedly
 * within a short time could otherwise trigger a lookup every time, so no new lookup fires within
 * this long after the last one. Same value as the Android side (SYNC_MULTIUSER_PLAN.md stage 2).
 */
const REMOTE_FETCH_COOLDOWN_MS = 30_000;

interface DocState {
	relativePath: string;
	lastKnownOffset: number;
	lastRemoteSyncedOffset?: number;
	lastRemoteFetchAt?: number;
	checkpointTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Reading-position tracking + remote (Supabase) sync trigger (.docs/VSCODE_SYNC_PLAN.md §5).
 *
 * Pushing on every cursor move would be wasteful, so the remote only gets updated through these
 * paths — mirroring the Android app's checkpoint + screen-exit/return model:
 * 1) Staying at the same position for at least CHECKPOINT_IDLE_MS (5 min) — a checkpoint
 * 2) This file stops being visible in an editor pane (onDidChangeVisibleTextEditors) — switching or closing a tab
 * 3) The VS Code window loses OS focus (onDidChangeWindowState, focused: false) — covers alt-tab,
 *    minimize, Win+D, switching virtual desktops, etc. Both (2) and (3) are needed because they're
 *    different layers — moving focus alone during a split-editor session isn't caught by (2) (the
 *    file is still visible), and minimizing the window isn't caught without (3) (visibleTextEditors
 *    doesn't change).
 *
 * Reading (comparing) goes the opposite direction — when a file newly becomes visible (including the
 * first time it's opened) or the window regains focus.
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

	/** Called once when the extension activates — treats already-open editors as "newly visible" too, doubling as the initial check. */
	async initialize(): Promise<void> {
		await this.onVisibleEditorsChanged(vscode.window.visibleTextEditors);
	}

	/** Best-effort immediate flush on window-focus loss / extension deactivation. */
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

		// Files that stopped being visible — push to the remote immediately, without waiting for a checkpoint
		for (const fsPath of this.visiblePaths) {
			if (!newPaths.has(fsPath)) {
				await this.flushNow(fsPath);
			}
		}

		// Files that newly became visible (including the first time opened) — check encoding, then check the remote
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
		const now = Date.now();
		if (state.lastRemoteFetchAt !== undefined && now - state.lastRemoteFetchAt < REMOTE_FETCH_COOLDOWN_MS) {
			return;
		}
		const client = await this.secretManager.getVerifiedClient();
		if (!client) {
			return;
		}
		state.lastRemoteFetchAt = now;
		const remote = await client.fetchPosition(state.relativePath);
		if (!remote || remote.charOffset - state.lastKnownOffset <= MIN_OFFSET_DIFF_TO_NOTIFY) {
			return;
		}
		await this.notifyFurtherPosition(document, state.lastKnownOffset, remote.charOffset);
	}

	private async notifyFurtherPosition(document: vscode.TextDocument, currentOffset: number, remoteOffset: number): Promise<void> {
		const total = document.getText().length;
		const currentPercent = total > 0 ? ((currentOffset / total) * 100).toFixed(1) : '0.0';
		const remotePercent = total > 0 ? ((remoteOffset / total) * 100).toFixed(1) : '0.0';
		// Shown as a modal because the default (toast) notification appears unfocused in the bottom
		// right, so Enter can't confirm it — it has to be clicked with the mouse. A modal appears
		// centered and takes focus immediately, so Enter acts as the default action ('Jump'), and Esc
		// cancels it too.
		const choice = await vscode.window.showInformationMessage(
			`You're at ${currentPercent}% — another device has reached ${remotePercent}%. Jump to that position?`,
			{ modal: true },
			'Jump',
		);
		if (choice === 'Jump') {
			await this.jumpTo(document, remoteOffset);
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
