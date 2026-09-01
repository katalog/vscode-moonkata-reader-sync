/**
 * Moonkata Reader 읽기 위치 동기화용 Supabase 프로젝트 좌표.
 *
 * URL과 publishable key는 고정값으로 여기 박아둔다 — Supabase의 신규 키 체계에서 publishable key는
 * 애초에 클라이언트 번들에 노출되는 걸 전제로 설계된 값이라(실제 방어선은 RLS) 소스에 그대로 커밋해도
 * 안전하다. 진짜 지켜야 하는 공유 시크릿만 사용자가 커맨드로 직접 입력한다(secretStorage.ts 참고).
 *
 * Android 앱의 data/sync/SupabaseConfig.kt와 반드시 같은 값을 가리켜야 한다.
 */
export const SUPABASE_URL = 'https://eodwuclpxlccteyqxnyi.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_f-enSHyNFJEii33q5oqhXQ_ViNgkWlh';
