import * as vscode from 'vscode';

const CONFIG_SECTION = 'moonkataReaderSync';
const CONFIG_KEY = 'syncRootPath';

/** Flag so that once the user cancels the folder picker, opening another .txt file in the same session doesn't ask again. */
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
		openLabel: 'Select as Sync Root',
		title: 'Select the sync root folder shared with Moonkata Reader',
		defaultUri,
	});
	if (!picked || picked.length === 0) {
		return undefined;
	}
	const chosen = picked[0].fsPath;
	await vscode.workspace.getConfiguration(CONFIG_SECTION).update(CONFIG_KEY, chosen, vscode.ConfigurationTarget.Global);
	return chosen;
}

/** If the setting is empty, prompts with the workspace folder suggested as the default, saves the chosen value, and returns it. */
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
