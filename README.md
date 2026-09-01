# Moonkata Sync (VSCode)

**상태: 계획 단계 — 아직 구현 전.** 이 저장소는 아래 기능을 위한 자리로 먼저 만들어뒀고, 실제 확장
코드는 아직 없습니다.

VSCode에서 `.txt` 소설을 읽을 때의 커서 위치와, 안드로이드 [Moonkata Reader](https://github.com/katalog/Android-Text-Reader)
앱에서 같은 파일을 읽은 위치를 Supabase를 통해 동기화하는 VSCode 확장입니다. Syncthing 등으로 두
기기의 파일 폴더 자체는 이미 동기화되어 있다는 전제 하에, "어디까지 읽었는지"만 별도로 맞춰서, 어느
기기에서 이어 읽든 더 멀리 읽은 위치로 건너뛸 수 있게 하는 것이 목표입니다.

## 설계 문서

전체 설계와 구현 단계(스테이지 1: Supabase 설정 / 스테이지 2: 안드로이드 앱 / 스테이지 3: 이 확장)는
Moonkata Reader 저장소의 계획 문서에 있습니다:

[Android-Text-Reader/.docs/VSCODE_SYNC_PLAN.md](https://github.com/katalog/Android-Text-Reader/blob/main/.docs/VSCODE_SYNC_PLAN.md)

이 저장소는 그 문서의 "스테이지 3"을 구현하는 곳입니다.

## 라이선스

[MIT](LICENSE)
