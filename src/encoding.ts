import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as jschardet from 'jschardet';

/**
 * 엄격한 UTF-8 바이트 시퀀스 검증 — chardet류로 추측하는 게 아니라 디코딩 자체가 깨지는지로
 * 판단한다(§열린 질문 4 결론). 오버롱 인코딩과 서로게이트 범위도 걸러내는 RFC 3629 기준 검증.
 */
export function isValidUtf8(buffer: Buffer): boolean {
	let i = 0;
	const len = buffer.length;
	while (i < len) {
		const byte = buffer[i];
		let extraBytes: number;
		let codePoint: number;
		let minCodePoint: number;

		if (byte <= 0x7f) {
			i += 1;
			continue;
		} else if ((byte & 0xe0) === 0xc0) {
			extraBytes = 1;
			codePoint = byte & 0x1f;
			minCodePoint = 0x80;
		} else if ((byte & 0xf0) === 0xe0) {
			extraBytes = 2;
			codePoint = byte & 0x0f;
			minCodePoint = 0x800;
		} else if ((byte & 0xf8) === 0xf0) {
			extraBytes = 3;
			codePoint = byte & 0x07;
			minCodePoint = 0x10000;
		} else {
			return false;
		}

		if (i + extraBytes >= len) {
			return false;
		}
		for (let k = 1; k <= extraBytes; k++) {
			const next = buffer[i + k];
			if ((next & 0xc0) !== 0x80) {
				return false;
			}
			codePoint = (codePoint << 6) | (next & 0x3f);
		}
		if (codePoint < minCodePoint || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
			return false;
		}
		i += extraBytes + 1;
	}
	return true;
}

function mapToWhatwgEncodingLabel(jschardetLabel: string): string {
	const lower = jschardetLabel.toLowerCase();
	// CP949/MS949/UHC는 EUC-KR의 확장 슈퍼셋 — Android EncodingDetector가 이 셋을 같은 부류로 다루는 것과 대응.
	if (lower === 'cp949' || lower === 'ms949' || lower === 'uhc') {
		return 'euc-kr';
	}
	return lower;
}

/**
 * 파일을 열 때(정확히는 다시 보이게 될 때) 원본 바이트가 유효한 UTF-8인지 검사하고, 아니면 변환을
 * 물어본다(§열린 질문 4 결론). 동의하면 파일 자체를 UTF-8로 덮어써 그 파일의 인코딩 문제를 근본적으로
 * 해소한다 — Syncthing이 이 변경분을 Android 쪽에도 퍼뜨리고, Android의 EncodingDetector도 UTF-8로
 * 정상 인식하게 된다.
 */
export async function checkAndOfferUtf8Conversion(document: vscode.TextDocument): Promise<void> {
	if (document.uri.scheme !== 'file') {
		return;
	}
	let raw: Buffer;
	try {
		raw = await fs.readFile(document.uri.fsPath);
	} catch {
		return;
	}
	if (raw.length === 0 || isValidUtf8(raw)) {
		return;
	}

	const detected = jschardet.detect(raw);
	const label = detected?.encoding;
	if (!label) {
		return;
	}

	const choice = await vscode.window.showWarningMessage(
		`"${document.uri.fsPath.split(/[\\/]/).pop()}" 파일은 UTF-8이 아닌 것 같습니다(${label}). UTF-8로 변환할까요? 원본 인코딩으로는 되돌릴 수 없습니다.`,
		'UTF-8로 변환',
		'무시',
	);
	if (choice !== 'UTF-8로 변환') {
		return;
	}

	try {
		const decoded = new TextDecoder(mapToWhatwgEncodingLabel(label), { fatal: false }).decode(raw);
		await fs.writeFile(document.uri.fsPath, Buffer.from(decoded, 'utf8'));
		vscode.window.showInformationMessage('UTF-8로 변환했습니다.');
		if (vscode.window.activeTextEditor?.document === document) {
			await vscode.commands.executeCommand('workbench.action.files.revert');
		}
	} catch (e) {
		vscode.window.showErrorMessage(`변환 실패: ${e instanceof Error ? e.message : String(e)}`);
	}
}
