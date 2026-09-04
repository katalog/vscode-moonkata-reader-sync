import * as path from 'path';

/**
 * The key-normalization rule used to match the two devices (.docs/VSCODE_SYNC_PLAN.md §3) — unify
 * separators, then NFC-normalize, then lowercase, in that order. Must be applied in exactly this
 * same order as the Android app's data/sync/RelativePath.kt or the two sides won't match.
 */
export function normalizeRelativePath(rawPath: string): string {
	return rawPath.replace(/\\/g, '/').normalize('NFC').toLowerCase();
}

/**
 * Computes and normalizes the path relative to the sync root. Returns null if the file is outside
 * the root (including on a different drive) — meaning it's not a sync target, and the caller should
 * silently skip this feature for it.
 */
export function computeRelativePath(syncRootAbsolutePath: string, fileAbsolutePath: string): string | null {
	const rel = path.relative(syncRootAbsolutePath, fileAbsolutePath);
	if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
		return null;
	}
	return normalizeRelativePath(rel);
}
