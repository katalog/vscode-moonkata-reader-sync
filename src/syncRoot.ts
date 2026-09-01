import * as vscode from 'vscode';

const CONFIG_SECTION = 'moonkataReaderSync';
const CONFIG_KEY = 'syncRootPath';

/** 사용자가 폴더 선택창을 취소했을 때, 같은 세션에서 .txt 파일 열 때마다 다시 물어보지 않기 위한 플래그. */
let declinedThisSession = false;

export function getSyncRoot(): string | undefined {
	const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY);
	return value && value.trim().length > 0 ? value : undefined;
}

export async function promptForSyncRoot(defaultUri?: vscode.Uri): Promise<string | undefined> {
	const picked = await vscode.window.showOpenDialog({
		canSelectFolders: true,
		canSelectFiles: false,
		canSelectMany: false,
		openLabel: '동기화 루트로 선택',
		title: 'Moonkata Reader와 공유하는 동기화 루트 폴더를 선택하세요',
		defaultUri,
	});
	if (!picked || picked.length === 0) {
		return undefined;
	}
	const chosen = picked[0].fsPath;
	await vscode.workspace.getConfiguration(CONFIG_SECTION).update(CONFIG_KEY, chosen, vscode.ConfigurationTarget.Global);
	return chosen;
}

/** 설정이 비어있으면 워크스페이스 폴더를 기본값으로 제안하며 물어보고, 선택한 값을 저장 후 반환한다. */
export async function ensureSyncRoot(): Promise<string | undefined> {
	const existing = getSyncRoot();
	if (existing) {
		return existing;
	}
	if (declinedThisSession) {
		return undefined;
	}
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
	const chosen = await promptForSyncRoot(workspaceFolder);
	if (!chosen) {
		declinedThisSession = true;
	}
	return chosen;
}
