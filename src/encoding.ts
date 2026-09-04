import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as jschardet from 'jschardet';

/**
 * Strict UTF-8 byte-sequence validation — rather than guessing via something like chardet, this
 * decides based on whether decoding itself actually breaks (see §Open Question 4's conclusion).
 * RFC 3629-compliant validation that also rejects overlong encodings and the surrogate range.
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
	// CP949/MS949/UHC are extended supersets of EUC-KR — matches how the Android app's EncodingDetector treats these three as one family.
	if (lower === 'cp949' || lower === 'ms949' || lower === 'uhc') {
		return 'euc-kr';
	}
	return lower;
}

/**
 * When a file is opened (more precisely, becomes visible again), checks whether the raw bytes are
 * valid UTF-8, and if not, offers to convert it (see §Open Question 4's conclusion). If the user
 * agrees, the file itself is overwritten as UTF-8, fixing that file's encoding problem at the root —
 * Syncthing then propagates this change to the Android side too, where its EncodingDetector will
 * also correctly recognize it as UTF-8.
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
		`"${document.uri.fsPath.split(/[\\/]/).pop()}" doesn't look like UTF-8 (detected: ${label}). Convert it to UTF-8? This can't be undone back to the original encoding.`,
		'Convert to UTF-8',
		'Ignore',
	);
	if (choice !== 'Convert to UTF-8') {
		return;
	}

	try {
		const decoded = new TextDecoder(mapToWhatwgEncodingLabel(label), { fatal: false }).decode(raw);
		await fs.writeFile(document.uri.fsPath, Buffer.from(decoded, 'utf8'));
		vscode.window.showInformationMessage('Converted to UTF-8.');
		if (vscode.window.activeTextEditor?.document === document) {
			await vscode.commands.executeCommand('workbench.action.files.revert');
		}
	} catch (e) {
		vscode.window.showErrorMessage(`Conversion failed: ${e instanceof Error ? e.message : String(e)}`);
	}
}
