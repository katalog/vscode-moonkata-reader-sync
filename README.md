# Moonkata Reader Sync

A VS Code extension that syncs your reading position (cursor location in a `.txt` novel) with the
[Moonkata Reader](https://github.com/katalog/android-moonkata-reader) Android app, via Supabase. It
assumes the two devices' folders are already kept in sync by something like Syncthing — this
extension only syncs *how far you've read*, so you can pick up on either device from wherever you
left off on the other.

Part of the [moonkata-reader-project](https://github.com/katalog/moonkata-reader-project) umbrella —
the PC file-sync companion is a separate repo, [go-moonkata-reader-sync-server](https://github.com/katalog/go-moonkata-reader-sync-server).

## Features

- **Cross-device "continue reading" prompt** — whichever device you open the file on, if the
  *other* device has read further, you get a notification with a jump-to-position action.
- **Low-chatter by design** — your position isn't pushed on every cursor move. It's pushed when you
  stay put for a minute (checkpoint), when the file stops being visible (tab switch/close), or when
  the VS Code window loses focus (alt-tab, minimize, Win+D). Reading further in another tab or app
  doesn't spam the network.
- **UTF-8 mismatch detection** — if a file isn't valid UTF-8 (common with older EUC-KR/CP949 Korean
  text files), you're offered a one-time conversion to UTF-8 so both apps decode it the same way.
- **No setup beyond a shared secret** — the Supabase project URL and key are baked into the
  extension (they're meant to be public-safe; the actual access control is a Row Level Security
  policy gated by a shared secret you enter yourself). Nothing works until you enter that secret
  and successfully run the connection test.

## Usage

1. Run **Moonkata Sync: 공유 시크릿 설정** and paste in the same shared secret configured in the
   Moonkata Reader Android app's settings.
2. Run **Moonkata Sync: 연결 테스트**. On success, the status bar shows `✓ Moonkata Sync` — that's
   the only thing that actually turns the feature on (entering the secret alone does not).
3. Open a `.txt` file inside your synced folder. The first time, you'll be asked to pick the sync
   root folder (the one your Android app also opened as its library) — after that it's remembered.
4. Read normally. If the Android app is further ahead, you'll get a prompt to jump to that position.

## Extension Settings

| Setting | Description | Default |
|---|---|---|
| `moonkataReaderSync.syncRootPath` | Absolute path to the folder shared with the Moonkata Reader app | `""` (prompted on first `.txt` file) |

The shared secret itself isn't a setting — it's stored via VS Code's `SecretStorage` (OS credential
store), entered through the **공유 시크릿 설정** command.

## How it works

Full design notes (why character offsets, why a shared Supabase table, why these specific sync
triggers and not simpler ones) live in the Moonkata Reader repo's plan document:
[android-moonkata-reader/.docs/VSCODE_SYNC_PLAN.md](https://github.com/katalog/android-moonkata-reader/blob/main/.docs/VSCODE_SYNC_PLAN.md).

## Requirements

A Supabase project set up per the plan document above, and the same shared secret configured on
both this extension and the Android app.

## Known Issues

- Files outside the configured sync root are silently ignored.
- `.txt` files inside zip archives aren't supported (the Android app can browse into zips; this
  extension only tracks plain files on disk).

## Installation

Search for **Moonkata Reader Sync** in the VS Code Extensions view, or install it from the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=katalog.moonkata-reader-sync)
(once published).

To build and run it from source instead:

```bash
git clone https://github.com/katalog/vscode-moonkata-reader-sync.git
cd vscode-moonkata-reader-sync
npm install
npm run compile
```

Then open the folder in VS Code and press `F5` to launch an Extension Development Host with the
extension active, or package it yourself with [`vsce`](https://github.com/microsoft/vscode-vsce)
and install the resulting `.vsix` via **Extensions: Install from VSIX...**.

## License

See [LICENSE](LICENSE).
