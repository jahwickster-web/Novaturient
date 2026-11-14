# Novaturient

Novaturient (Nova for short) — the Conravia life simulator, as a Windows
desktop app. The game itself is a single self-contained `index.html`
(v0.17: Novaturient title, Training Dummy, local saves, save reminder,
m3d soundtrack player, achievements, keyboard shortcuts).

## Run / build

```sh
npm install
npm start          # run locally
npm run build      # Windows only, win32 x64, NSIS installer + dir folder
```

The primary release asset is the installer `dist/Novaturient Setup
0.17.0.exe` — one-click, per-user install (no admin), desktop + Start
menu shortcuts, black butterfly icon. `dist/win-unpacked/` is kept as a
folder-with-.exe backup. The app is unsigned, so Windows SmartScreen
will flag it on first launch (More info → Run anyway).

Building the NSIS installer on Linux needs Wine with 32-bit support
(`wine32`): electron-builder runs its bundled NSIS `makensis` under
Wine. That is the preferred route, but this VM cannot install `wine32`
— apt multiarch resolution breaks because the system's `libzstd1`
is a custom `+hatch1` build with no matching i386 package.

Fallback used for v0.17 (and what `installer.nsi` is): build the
installer by hand with electron-builder's bundled Linux makensis
(`~/.cache/electron-builder/nsis-3.0.4.1/.../linux/makensis`, NSISDIR
pointed at its folder). Two gotchas, both found the hard way:

1. makensis creates an anonymous temp file in `/tmp` (O_TMPFILE) and
   mmaps it for the installer data. `/tmp` here is a 512 MB tmpfs,
   and the installer data is ~1.1 GB, so makensis dies with SIGBUS
   once the temp file passes 512 MB. Mount a bigger tmpfs on `/tmp`
   in the SAME shell as the build
   (`mount -t tmpfs -o size=4G tmpfs /tmp`) — mounts do not persist
   across shells here.
2. The track `I'M STILL ALONE.wav` (curly apostrophe U+2019) makes
   native makensis crash when it enumerates its directory. The build
   uses `staging/` — hard links of `dist/win-unpacked` where that
   file is stored as `IM STILL ALONE.wav` — and the installer renames
   it back to the real name at install time. Rebuild staging after
   any new dir build: `rm -rf staging && mkdir staging &&
   cp -al dist/win-unpacked/. staging/ && mv "staging/.../I'M STILL
   ALONE.wav" "staging/.../IM STILL ALONE.wav"`.

```sh
mount -t tmpfs -o size=4G tmpfs /tmp
export NSISDIR=~/.cache/electron-builder/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n
$NSISDIR/linux/makensis installer.nsi   # -> dist/Novaturient Setup 0.17.0.exe
```

`dist/latest.yml` (generated next to the installer) is what
electron-updater reads from the GitHub Release to find the installer;
regenerate its sha512/size if the installer is rebuilt.

## Soundtrack

The 48 m3d tracks (Angel's own music, 24 WAV + 24 M4A) ship as local files
in `assets/music/` and are **not** embedded in the HTML. The game page
calls `window.NovaturientElectron.music.getTrackUrl()` (see `preload.js`)
and main.js serves them over `nova-music://music/<fileName>`.
The 4 MP4 videos in the m3d folder are not soundtrack tracks and are not
included.

The handler answers Chromium's `<audio>` Range requests with 206
Content-Range responses — without that, the audio element fails with
MEDIA_ERR_SRC_NOT_SUPPORTED even though `fetch()` works. Verified live:
schoolyardpunk.m4a loads (127.9s), PORTRAIT.wav loads (179.3s),
ERENYX.m4a loads (174.6s).

## Auto-updater

`electron-updater` is configured in `package.json` (`build.publish`,
provider `github`, owner `jahwickster-web`, repo `Novaturient`).
On launch main.js also checks the public GitHub Releases feed for
`jahwickster-web/Novaturient` and shows a notice offering to open the
release page when a newer tag exists.

The v0.17 release carries the NSIS installer, so `electron-updater`
can download it and install on restart (`quitAndInstall`) — the
installer is the real self-update path. The manual GitHub check stays
as a fallback notice.

## Saves

Local only, no cloud saves. Saves live in `%APPDATA%\Novaturient` on
Windows, plus the game's in-app local save slots with export/import.
