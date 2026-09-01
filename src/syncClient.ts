import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabaseConfig';

export interface RemoteReadingPosition {
	charOffset: number;
	source: string;
	encoding: string | null;
}

const CONNECTION_TEST_PATH = '__connection_test__';

/**
 * Supabase PostgREST 직접 호출 — .docs/VSCODE_SYNC_PLAN.md §1/§5.
 * 실패(네트워크 끊김, 시크릿 오류, 파싱 실패 등)는 전부 조용히 null/false로 처리한다 — best-effort
 * 기능이라 이 클라이언트의 어떤 예외도 에디터 핵심 흐름을 막으면 안 된다.
 */
export class ReadingPositionSyncClient {
	constructor(private readonly sharedSecret: string) { }

	private get restBase(): string {
		return `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/reading_positions`;
	}

	private headers(extra?: Record<string, string>): Record<string, string> {
		// 신규 Supabase 키 체계(publishable/secret)는 apikey 헤더에만 넣는다 — Authorization: Bearer에
		// 같이 넣으면 JWT로 파싱을 시도하다 거부된다(§1 참고).
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
			// best-effort — 실패해도 에디터 동작에 영향 없음
		}
	}

	/**
	 * "연결 테스트" 커맨드용 — 고정된 더미 경로로 upsert를 시도해 시크릿이 RLS를 통과하는지 확인한다.
	 * 단순 조회로는 검증이 안 된다 — RLS가 막은 SELECT는 에러가 아니라 빈 배열을 돌려주므로 "행이
	 * 없어서 비었나 시크릿이 틀려서 비었나"를 구분할 수 없다. upsert(INSERT)는 RLS를 어기면 PostgREST가
	 * 401/403으로 명확히 거부하므로 이 차이로 성공/실패를 판별한다.
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
