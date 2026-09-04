import * as assert from 'assert';
import * as path from 'path';
import { computeRelativePath, normalizeRelativePath } from '../relativePath';
import { isValidUtf8 } from '../encoding';

suite('relativePath', () => {
	test('normalizes in the order: unify separators → NFC → lowercase', () => {
		const nfd = 'novels\\가각.TXT'.normalize('NFD');
		assert.strictEqual(normalizeRelativePath(nfd), 'novels/가각.txt');
	});

	test('a file inside the sync root returns a normalized relative path', () => {
		const root = path.join('S:', 'sync');
		const file = path.join(root, 'novels', 'a.txt');
		assert.strictEqual(computeRelativePath(root, file), 'novels/a.txt');
	});

	test('a file outside the sync root returns null', () => {
		const root = path.join('S:', 'sync');
		const file = path.join('S:', 'other', 'a.txt');
		assert.strictEqual(computeRelativePath(root, file), null);
	});
});

suite('isValidUtf8', () => {
	test('plain ASCII/UTF-8 text is valid', () => {
		assert.strictEqual(isValidUtf8(Buffer.from('hello 안녕', 'utf8')), true);
	});

	test('Korean bytes encoded as EUC-KR are not valid UTF-8', () => {
		// "가" (EUC-KR: B0 A1) — an invalid continuation-byte sequence as UTF-8
		const eucKrGa = Buffer.from([0xb0, 0xa1]);
		assert.strictEqual(isValidUtf8(eucKrGa), false);
	});

	test('a truncated multi-byte sequence is not valid', () => {
		const truncated = Buffer.from([0xea, 0xb0]); // only the first 2 bytes of "가"
		assert.strictEqual(isValidUtf8(truncated), false);
	});
});
