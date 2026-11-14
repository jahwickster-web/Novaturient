# Novaturient

Novaturient (Nova for short) — the Conravia life simulator, as a Windows
desktop app. The game itself is a single self-contained `index.html`
(v0.17: Novaturient title, Training Dummy, local saves, save reminder,
m3d soundtrack player, achievements, keyboard shortcuts).

## Run / build

```sh
npm install
npm start          # run locally
npm run build      # Windows only, win32 x64, dir target -> dist/win-unpacked/
```

The built folder contains `Novaturient.exe` — a folder with an .exe, no
installer. The app is unsigned, so Windows SmartScreen will flag it on
first launch (More info → Run anyway).

## Soundtrack

The 48 m3d tracks (Angel's own music, 24 WAV + 24 M4A) ship as local files
in `assets/music/` and are **not** embedded in the HTML. The game page
calls `window.NovaturientElectron.music.getTrackUrl()` (see `preload.js`)
and main.js serves them over `nova-music://music/<fileName>`.
The 4 MP4 videos in the m3d folder are not soundtrack tracks and are not
included.

## Auto-updater

`electron-updater` is configured in `package.json` (`build.publish`,
provider `github`, owner `jahwickster-web`, repo `Novaturient`).
On launch main.js also checks the public GitHub Releases feed for
`jahwickster-web/Novaturient` and shows a notice offering to open the
release page when a newer tag exists.

Honest limit: this build ships as a folder (`dir` target), not an
installer. electron-updater can only install a proper installer asset
(NSIS), so a dir-only release will notify the player and open the
release page instead of silently self-installing. Once a release carries
an installer asset, `quitAndInstall` takes over.

## Saves

Local only, no cloud saves. Saves live in `%APPDATA%\Novaturient` on
Windows, plus the game's in-app local save slots with export/import.
