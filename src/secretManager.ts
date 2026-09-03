import * as vscode from 'vscode';
import { ReadingPositionSyncClient } from './syncClient';

const SHARED_SECRET_KEY = 'moonkataReaderSync.sharedSecret';
const VERIFIED_SECRET_KEY = 'moonkataReaderSync.verifiedSecret';

/**
 * 공유 시크릿 저장/검증 + 상태 표시줄 배지.
 *
 * 동작 게이트는 "시크릿이 채워짐"이 아니라 "연결 테스트에 성공한 시크릿과 지금 저장된 시크릿이
 * 같음"이다(Android 앱의 supabaseSharedSecret/supabaseVerifiedSecret 비교와 같은 구조, §1 참고) —
 * 시크릿만 저장하고 테스트를 안 해봤거나 오타가 났으면 계속 실패할 요청을 조용히 반복하는 대신 기능이
 * 꺼진 채로 남는다.
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

	/** 시크릿이 검증된 상태일 때만 클라이언트를 돌려준다 — 검증 안 됐으면 null(기능 비활성화). */
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

	/** 시크릿을 저장만 하고 상태 표시줄을 갱신한다 — 검증(testConnection)은 호출부가 따로 트리거. */
	async setSecret(value: string): Promise<void> {
		await this.context.secrets.store(SHARED_SECRET_KEY, value);
		await this.refreshStatusBar();
	}

	async promptForSecret(): Promise<void> {
		const value = await vscode.window.showInputBox({
			prompt: 'Moonkata Reader 앱 설정 화면에서 사용 중인 것과 같은 공유 시크릿을 입력하세요.',
			password: true,
			ignoreFocusOut: true,
		});
		if (value === undefined || value.length === 0) {
			return;
		}
		await this.setSecret(value);
		const choice = await vscode.window.showInformationMessage(
			'공유 시크릿을 저장했습니다. 아직 연결 테스트 전이라 동기화는 꺼져 있습니다.',
			'지금 테스트',
		);
		if (choice === '지금 테스트') {
			await this.testConnection();
		}
	}

	async testConnection(): Promise<void> {
		const secret = await this.getSharedSecret();
		if (!secret) {
			const choice = await vscode.window.showWarningMessage('공유 시크릿이 아직 설정되지 않았습니다.', '지금 입력');
			if (choice) {
				await this.promptForSecret();
			}
			return;
		}
		const client = new ReadingPositionSyncClient(secret);
		const success = await client.testConnection();
		if (success) {
			await this.context.secrets.store(VERIFIED_SECRET_KEY, secret);
			vscode.window.showInformationMessage('Moonkata Sync 연결 성공 — 읽기 위치 동기화가 켜졌습니다.');
		} else {
			vscode.window.showErrorMessage('Moonkata Sync 연결 실패 — 시크릿을 확인하세요.');
		}
		await this.refreshStatusBar();
	}

	async refreshStatusBar(): Promise<void> {
		const secret = await this.getSharedSecret();
		const verified = await this.getVerifiedSecret();
		if (secret && secret === verified) {
			this.statusBarItem.text = '$(check) Moonkata Sync';
			this.statusBarItem.tooltip = 'Moonkata Reader와 읽기 위치 동기화 연결됨 — 클릭해서 다시 테스트';
			this.statusBarItem.backgroundColor = undefined;
		} else {
			this.statusBarItem.text = '$(circle-slash) Moonkata Sync';
			this.statusBarItem.tooltip = secret
				? '시크릿이 아직 검증되지 않았습니다 — 클릭해서 연결 테스트'
				: '공유 시크릿이 설정되지 않았습니다 — 클릭해서 연결 테스트';
			this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		}
		this.statusBarItem.show();
	}
}
