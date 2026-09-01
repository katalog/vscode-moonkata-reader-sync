import * as path from 'path';

/**
 * 두 기기를 매칭하는 키 정규화 규칙(.docs/VSCODE_SYNC_PLAN.md §3) — 구분자 통일 → NFC 정규화 →
 * 소문자화 순서. Android 앱의 data/sync/RelativePath.kt와 반드시 같은 순서로 적용해야 매칭이 맞는다.
 */
export function normalizeRelativePath(rawPath: string): string {
	return rawPath.replace(/\\/g, '/').normalize('NFC').toLowerCase();
}

/**
 * 동기화 루트 기준 상대경로를 계산해서 정규화한다. 파일이 루트 바깥이면(다른 드라이브 포함) null —
 * 동기화 대상이 아니라는 뜻이고, 호출하는 쪽에서 이 기능을 조용히 건너뛰어야 한다.
 */
export function computeRelativePath(syncRootAbsolutePath: string, fileAbsolutePath: string): string | null {
	const rel = path.relative(syncRootAbsolutePath, fileAbsolutePath);
	if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
		return null;
	}
	return normalizeRelativePath(rel);
}
