# Change Log

All notable changes to the "moonkata-reader-sync" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.1.0]

- 원격 위치가 근소하게(500자 이하) 앞설 때는 이동 팝업을 띄우지 않도록 데드존 추가 — 커서 오프셋과
  페이지 오프셋의 단위 차이로 생기는 오탐 방지.
- 이동 팝업에 목표 위치뿐 아니라 현재 기기의 진행률도 같이 표시.
- 이동 팝업을 modal 다이얼로그로 변경 — 화면 중앙에 뜨며 포커스를 가져가 Enter로 바로 이동 가능.

## [1.0.0]

- Initial implementation: shared-secret connection test, sync root selection, checkpoint +
  window/tab-visibility based position sync, cross-device "continue reading" prompt, UTF-8
  mismatch detection and conversion.
