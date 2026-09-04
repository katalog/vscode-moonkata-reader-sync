import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabaseConfig';

export interface RemoteReadingPosition {
	charOffset: number;
	source: string;
	encoding: string | null;
}

const CONNECTION_TEST_PATH = '__connection_test__';

/**
 * Calls Supabase PostgREST directly — .docs/VSCODE_SYNC_PLAN.md §1/§5.
 * Any failure (network down, wrong secret, parse error, etc.) is handled by silently returning
 * null/false — this is a best-effort feature, so no exception from this client should ever block
 * the editor's core flow.
 */
export class ReadingPositionSyncClient {
	constructor(private readonly sharedSecret: string) { }

	private get restBase(): string {
		return `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/reading_positions`;
	}

	private headers(extra?: Record<string, string>): Record<string, string> {
		// The new Supabase key scheme (publishable/secret) only goes in the apikey header — putting
		// it in Authorization: Bearer too gets it rejected as an attempted JWT parse (see §1).
		return {
			apikey: SUPABASE_PUBLISHABLE_KEY,
			'x-moonkata-secret': this.sharedSecret,
			...extra,
		};
	}

	async fetchPosition(relativePath: string): Promise<RemoteReadingPosition | null> {
		try {
			const url = `${this.restBase}?select=char_offset,source,encoding&relative_path=eq.${encodeURIComponent(relativePath)}`;
			const res = await fetch(url, { headers: this.headers() });
			if (!res.ok) {
				return null;
			}
			const rows = (await res.json()) as Array<{ char_offset: number; source: string; encoding: string | null }>;
			if (rows.length === 0) {
				return null;
			}
			const row = rows[0];
			return { charOffset: row.char_offset, source: row.source, encoding: row.encoding };
		} catch {
			return null;
		}
	}

	async upsert(relativePath: string, charOffset: number, encoding: string | null): Promise<void> {
		try {
			await fetch(this.restBase, {
				method: 'POST',
				headers: this.headers({
					'Content-Type': 'application/json',
					Prefer: 'resolution=merge-duplicates',
				}),
				body: JSON.stringify({
					relative_path: relativePath,
					char_offset: charOffset,
					source: 'vscode',
					encoding,
				}),
			});
		} catch {
			// best-effort — a failure here has no effect on editor behavior
		}
	}

	/**
	 * For the "test connection" command — attempts an upsert against a fixed dummy path to check
	 * whether the secret passes RLS. A plain read can't verify this — a SELECT blocked by RLS
	 * returns an empty array rather than an error, so there'd be no way to tell "empty because
	 * there's no row" apart from "empty because the secret is wrong." An upsert (INSERT) that
	 * violates RLS gets a clear 401/403 rejection from PostgREST, so that distinction is what
	 * determines success/failure here.
	 */
	async testConnection(): Promise<boolean> {
		try {
			const res = await fetch(this.restBase, {
				method: 'POST',
				headers: this.headers({
					'Content-Type': 'application/json',
					Prefer: 'resolution=merge-duplicates',
				}),
				body: JSON.stringify({
					relative_path: CONNECTION_TEST_PATH,
					char_offset: 0,
					source: 'vscode',
					encoding: null,
				}),
			});
			return res.ok;
		} catch {
			return false;
		}
	}
}
