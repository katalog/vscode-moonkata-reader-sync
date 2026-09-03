import * as vscode from 'vscode';
import { SyncSecretManager } from './secretManager';
import { PositionTracker } from './positionTracker';
import { promptForSyncRoot } from './syncRoot';
import { showPairingQr } from './pairingQr';

let tracker: PositionTracker | undefined;

export function activate(context: vscode.ExtensionContext) {
	const secretManager = new SyncSecretManager(context);
	tracker = new PositionTracker(context, secretManager);

	context.subscriptions.push(
		vscode.commands.registerCommand('moonkata-reader-sync.setSharedSecret', () => secretManager.promptForSecret()),
		vscode.commands.registerCommand('moonkata-reader-sync.testConnection', () => secretManager.testConnection()),
		vscode.commands.registerCommand('moonkata-reader-sync.setSyncRoot', async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
			const chosen = await promptForSyncRoot(workspaceFolder);
			if (chosen) {
				vscode.window.showInformationMessage(`동기화 루트를 설정했습니다: ${chosen}`);
			}
		}),
		vscode.commands.registerCommand('moonkata-reader-sync.showPairingQr', () => showPairingQr(secretManager)),
	);

	void secretManager.refreshStatusBar();
	void tracker.initialize();
}

export async function deactivate(): Promise<void> {
	await tracker?.flushAll();
}
