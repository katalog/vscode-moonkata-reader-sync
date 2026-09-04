import * as vscode from 'vscode';
import { ReadingPositionSyncClient } from './syncClient';

const SHARED_SECRET_KEY = 'moonkataReaderSync.sharedSecret';
const VERIFIED_SECRET_KEY = 'moonkataReaderSync.verifiedSecret';

/**
 * Stores/verifies the shared secret + the status bar badge.
 *
 * The gate is not "a secret is filled in" but "the secret that last passed a connection test
 * matches what's currently stored" (the same structure as the Android app's
 * supabaseSharedSecret/supabaseVerifiedSecret comparison, see §1) — rather than silently repeating
 * requests that keep failing because the secret was only saved but never tested, or has a typo, the
 * feature stays off.
 */
export class SyncSecretManager {
	private readonly statusBarItem: vscode.StatusBarItem;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.statusBarItem.command = 'moonkata-reader-sync.testConnection';
		context.subscriptions.push(this.statusBarItem);
	}

	async getSharedSecret(): Promise<string | undefined> {
		return this.context.secrets.get(SHARED_SECRET_KEY);
	}

	private async getVerifiedSecret(): Promise<string | undefined> {
		return this.context.secrets.get(VERIFIED_SECRET_KEY);
	}

	/** Only returns a client once the secret is verified — null (feature disabled) otherwise. */
	async getVerifiedClient(): Promise<ReadingPositionSyncClient | null> {
		const secret = await this.getSharedSecret();
		if (!secret) {
			return null;
		}
		const verified = await this.getVerifiedSecret();
		if (secret !== verified) {
			return null;
		}
		return new ReadingPositionSyncClient(secret);
	}

	/** Only stores the secret and refreshes the status bar — verification (testConnection) is triggered separately by the caller. */
	async setSecret(value: string): Promise<void> {
		await this.context.secrets.store(SHARED_SECRET_KEY, value);
		await this.refreshStatusBar();
	}

	/**
	 * Completely clears the stored secret — "Moonkata Sync: Disconnect". `context.secrets` is an
	 * OS-level secure store that survives even reinstalling the extension, so an old pairing can
	 * linger. Used when you want a clean slate before pairing fresh via QR (e.g. testing from
	 * scratch on a new device) — running "Connect via QR" afterward has no existing secret to reuse,
	 * so it generates a genuinely new one.
	 */
	async forgetSecret(): Promise<void> {
		await this.context.secrets.delete(SHARED_SECRET_KEY);
		await this.context.secrets.delete(VERIFIED_SECRET_KEY);
		await this.refreshStatusBar();
		vscode.window.showInformationMessage('Cleared the stored secret — sync is now off.');
	}

	async promptForSecret(): Promise<void> {
		const value = await vscode.window.showInputBox({
			prompt: 'Enter the same shared secret you\'re using in the Moonkata Reader app\'s settings screen.',
			password: true,
			ignoreFocusOut: true,
		});
		if (value === undefined || value.length === 0) {
			return;
		}
		await this.setSecret(value);
		const choice = await vscode.window.showInformationMessage(
			'Shared secret saved. Sync is still off until you test the connection.',
			'Test now',
		);
		if (choice === 'Test now') {
			await this.testConnection();
		}
	}

	async testConnection(): Promise<void> {
		const secret = await this.getSharedSecret();
		if (!secret) {
			const choice = await vscode.window.showWarningMessage('No shared secret has been set yet.', 'Enter now');
			if (choice) {
				await this.promptForSecret();
			}
			return;
		}
		const client = new ReadingPositionSyncClient(secret);
		const success = await client.testConnection();
		if (success) {
			await this.context.secrets.store(VERIFIED_SECRET_KEY, secret);
			vscode.window.showInformationMessage('Moonkata Sync connected — reading-position sync is on.');
		} else {
			vscode.window.showErrorMessage('Moonkata Sync connection failed — check your secret.');
		}
		await this.refreshStatusBar();
	}

	async refreshStatusBar(): Promise<void> {
		const secret = await this.getSharedSecret();
		const verified = await this.getVerifiedSecret();
		if (secret && secret === verified) {
			this.statusBarItem.text = '$(check) Moonkata Sync';
			this.statusBarItem.tooltip = 'Connected to Moonkata Reader for reading-position sync — click to test again';
			this.statusBarItem.backgroundColor = undefined;
		} else {
			this.statusBarItem.text = '$(circle-slash) Moonkata Sync';
			this.statusBarItem.tooltip = secret
				? 'Secret not verified yet — click to test the connection'
				: 'No shared secret set — click to test the connection';
			this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		}
		this.statusBarItem.show();
	}
}
