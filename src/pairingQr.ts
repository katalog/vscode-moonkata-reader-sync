import * as crypto from 'crypto';
import * as vscode from 'vscode';
import * as QRCode from 'qrcode';
import { SyncSecretManager } from './secretManager';

/**
 * QR pairing (see the android-moonkata-reader repo's .docs/SYNC_MULTIUSER_PLAN.md stage 5) — the
 * Android app's quick-settings "Connect via QR" scans this QR to fill in the shared secret
 * automatically.
 *
 * If a secret already exists, it's shown as-is in the QR — generating a new one every time would
 * silently disconnect any other already-paired device (e.g. a phone scanned earlier), so a new one
 * is only ever generated the very first time. So this command is less a "reissue" and more "show the
 * current secret again" — it's safe to run again to pair a second phone too.
 */
export async function showPairingQr(secretManager: SyncSecretManager): Promise<void> {
	let secret = await secretManager.getSharedSecret();
	if (!secret) {
		secret = crypto.randomBytes(24).toString('hex');
		await secretManager.setSecret(secret);
	}

	// Verify here too, so the VS Code status bar shows the correct connection state even before
	// Android scans the QR (the QR itself is still shown even if this fails — the PC could be
	// offline, for instance).
	void secretManager.testConnection();

	const payload = JSON.stringify({ type: 'vscode_sync', secret });
	const svg = await QRCode.toString(payload, { type: 'svg', margin: 1, width: 280 });

	const panel = vscode.window.createWebviewPanel(
		'moonkataSyncPairingQr',
		'Moonkata Sync — Connect via QR',
		vscode.ViewColumn.Active,
		{ enableScripts: false },
	);
	panel.webview.html = buildHtml(svg, secret);
}

function buildHtml(svg: string, secret: string): string {
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
	body {
		font-family: var(--vscode-font-family);
		text-align: center;
		padding: 32px 16px;
		color: var(--vscode-foreground);
	}
	.qr {
		background: white;
		display: inline-block;
		padding: 16px;
		border-radius: 8px;
	}
	code {
		user-select: all;
		word-break: break-all;
		background: var(--vscode-textCodeBlock-background);
		padding: 4px 8px;
		border-radius: 4px;
	}
</style>
</head>
<body>
	<h2>Scan this in the Moonkata Reader app</h2>
	<p>Quick settings sheet → VSCode reading-position sync → "Connect via QR"</p>
	<div class="qr">${svg}</div>
	<p>If you can't use the camera, you can enter this secret manually instead:</p>
	<p><code>${escapeHtml(secret)}</code></p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
