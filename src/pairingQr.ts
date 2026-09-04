import * as crypto from 'crypto';
import * as vscode from 'vscode';
import * as QRCode from 'qrcode';
import { SyncSecretManager } from './secretManager';

/**
 * QR 페어링(android-moonkata-reader 저장소의 .docs/SYNC_MULTIUSER_PLAN.md 스테이지 5) — Android 앱
 * 퀵설정의 "QR로 연결"이 이 QR을 스캔해 공유 시크릿을 자동으로 채운다.
 *
 * 이미 시크릿이 있으면 그대로 QR로 보여준다 — 매번 새로 만들면 이미 페어링된 다른 기기(예전에 스캔한
 * 폰)가 조용히 끊어지므로, 완전히 처음일 때만 새로 생성한다. 그래서 이 커맨드는 "재발급"이 아니라
 * "지금 시크릿을 다시 보여주기"에 가깝다 — 두 번째 폰을 추가로 페어링할 때도 안전하게 다시 실행할 수
 * 있다.
 */
export async function showPairingQr(secretManager: SyncSecretManager): Promise<void> {
	let secret = await secretManager.getSharedSecret();
	if (!secret) {
		secret = crypto.randomBytes(24).toString('hex');
		await secretManager.setSecret(secret);
	}

	// Android가 QR을 스캔하기 전에도 VSCode 쪽 상태 표시줄이 정확한 연결 상태를 보여주도록, 여기서도
	// 한 번 검증해둔다(실패해도 QR 자체는 그대로 보여준다 — 오프라인일 수도 있으니).
	void secretManager.testConnection();

	const payload = JSON.stringify({ type: 'vscode_sync', secret });
	const svg = await QRCode.toString(payload, { type: 'svg', margin: 1, width: 280 });

	const panel = vscode.window.createWebviewPanel(
		'moonkataSyncPairingQr',
		'Moonkata Sync — QR로 연결',
		vscode.ViewColumn.Active,
		{ enableScripts: false },
	);
	panel.webview.html = buildHtml(svg, secret);
}

function buildHtml(svg: string, secret: string): string {
	return /* html */ `<!DOCTYPE html>
<html lang="ko">
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
	<h2>Moonkata Reader 앱에서 스캔하세요</h2>
	<p>퀵설정 시트 → VSCode 읽기 위치 동기화 → "QR로 연결"</p>
	<div class="qr">${svg}</div>
	<p>카메라를 쓸 수 없다면 이 시크릿을 대신 직접 입력해도 됩니다:</p>
	<p><code>${escapeHtml(secret)}</code></p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
