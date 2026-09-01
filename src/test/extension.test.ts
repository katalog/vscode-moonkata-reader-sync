import * as assert from 'assert';
import * as path from 'path';
import { computeRelativePath, normalizeRelativePath } from '../relativePath';
import { isValidUtf8 } from '../encoding';

suite('relativePath', () => {
	test('구분자 통일 → NFC → 소문자화 순으로 정규화한다', () => {
		const nfd = 'novels\\가각.TXT'.normalize('NFD');
		assert.strictEqual(normalizeRelativePath(nfd), 'novels/가각.txt');
	});

	test('동기화 루트 안의 파일은 정규화된 상대경로를 돌려준다', () => {
		const root = path.join('S:', 'sync');
		const file = path.join(root, 'novels', 'a.txt');
		assert.strictEqual(computeRelativePath(root, file), 'novels/a.txt');
	});

	test('동기화 루트 바깥 파일은 null', () => {
		const root = path.join('S:', 'sync');
		const file = path.join('S:', 'other', 'a.txt');
		assert.strictEqual(computeRelativePath(root, file), null);
	});
});

suite('isValidUtf8', () => {
	test('순수 ASCII/UTF-8 텍스트는 유효하다', () => {
		assert.strictEqual(isValidUtf8(Buffer.from('hello 안녕', 'utf8')), true);
	});

	test('EUC-KR로 인코딩된 한글 바이트는 유효한 UTF-8이 아니다', () => {
		// "가" (EUC-KR: B0 A1) — UTF-8로는 잘못된 연속 바이트 시퀀스
		const eucKrGa = Buffer.from([0xb0, 0xa1]);
		assert.strictEqual(isValidUtf8(eucKrGa), false);
	});

	test('잘린 멀티바이트 시퀀스는 유효하지 않다', () => {
		const truncated = Buffer.from([0xea, 0xb0]); // "가"의 앞 2바이트만
		assert.strictEqual(isValidUtf8(truncated), false);
	});
});
