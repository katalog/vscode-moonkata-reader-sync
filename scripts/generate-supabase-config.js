#!/usr/bin/env node
// src/supabaseConfig.ts를 생성한다 — Android 앱의 app/build.gradle.kts가 BuildConfig 필드를 주입하는
// 것과 같은 이유: 값 자체는 비밀이 아니지만(RLS가 실제 방어선) 공개 저장소 히스토리에 그대로 남는 걸
// 피하려고 소스 리터럴 대신 여기서 채운다 (android-moonkata-reader 저장소의 SYNC_MULTIUSER_PLAN.md
// 스테이지 3). 환경 변수(SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY)가 있으면 그걸 쓰고, 없으면 저장소
// 루트의 .env.local(gitignore 대상, KEY=VALUE 줄바꿈 형식)에서 읽는다. 둘 다 없으면 빈 문자열로
// 생성되고, 그 경우 확장은 그대로 컴파일/실행되지만 동기화 기능만 조용히 비활성화된다.

const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
	const envPath = path.join(__dirname, '..', '.env.local');
	if (!fs.existsSync(envPath)) return {};
	const result = {};
	for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const idx = trimmed.indexOf('=');
		if (idx === -1) continue;
		result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
	}
	return result;
}

const envLocal = loadEnvLocal();
const url = process.env.SUPABASE_URL ?? envLocal.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? envLocal.SUPABASE_PUBLISHABLE_KEY ?? '';

const content = `// 이 파일은 scripts/generate-supabase-config.js가 자동 생성합니다 — 직접 수정해도 다음
// "npm run compile"/"npm run watch" 때 덮어써집니다. 값은 환경 변수 또는 .env.local에서 채워집니다.
export const SUPABASE_URL = ${JSON.stringify(url)};
export const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(key)};
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'supabaseConfig.ts'), content);
