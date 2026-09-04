# Change Log

All notable changes to the "moonkata-reader-sync" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.1.0]

- Added a dead zone so the jump popup doesn't fire when the remote position is only slightly ahead
  (500 characters or less) — avoids false positives from the unit mismatch between cursor offset and
  page offset.
- The jump popup now shows the current device's progress alongside the target position, not just the
  target.
- Changed the jump popup to a modal dialog — it appears centered and takes focus, so Enter jumps
  immediately.

## [1.0.0]

- Initial implementation: shared-secret connection test, sync root selection, checkpoint +
  window/tab-visibility based position sync, cross-device "continue reading" prompt, UTF-8
  mismatch detection and conversion.
