const { app, BrowserWindow, Menu, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// The nova-music:// scheme must be registered as privileged BEFORE app
// ready, or fetch() from the page cannot use it (it fails with
// "Failed to fetch"). standard + secure + supportFetchAPI makes it behave
// like https for fetch/audio purposes.
protocol.registerSchemesAsPrivileged([
  { scheme: 'nova-music', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

let mainWindow = null;
let updateNoticeShown = false;

function musicDir() {
  // Packaged build: extraResources land in process.resourcesPath/assets/music
  // Dev / unpacked: assets/music next to main.js
  const packaged = path.join(process.resourcesPath, 'assets', 'music');
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, 'assets', 'music');
}

function mimeFor(fileName) {
  if (/\.wav$/i.test(fileName)) return 'audio/wav';
  if (/\.m4a$/i.test(fileName)) return 'audio/mp4';
  if (/\.mp3$/i.test(fileName)) return 'audio/mpeg';
  if (/\.ogg$/i.test(fileName)) return 'audio/ogg';
  if (/\.flac$/i.test(fileName)) return 'audio/flac';
  return 'application/octet-stream';
}

function registerMusicProtocol() {
  // nova-music://music/<fileName> -> local file in assets/music
  // The game page calls window.NovaturientElectron.music.getTrackUrl()
  // (see preload.js), which returns one of these URLs. No file is embedded
  // in the HTML; the 48 m3d tracks ship as local files.
  //
  // Chromium's <audio> element issues Range requests and needs a 206
  // response with Content-Range / Content-Length / Accept-Ranges, or it
  // fails with MEDIA_ERR_SRC_NOT_SUPPORTED. Verified live: with range
  // support, schoolyardpunk.m4a loads (127.9s) and PORTRAIT.wav loads
  // (179.3s); without it, both error out.
  protocol.handle('nova-music', async (request) => {
    try {
      const url = new URL(request.url);
      const fileName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      // Safety: no directory traversal, only a plain file name.
      if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
        return new Response('Not found', { status: 404 });
      }
      const filePath = path.join(musicDir(), fileName);
      if (!fs.existsSync(filePath)) return new Response('Not found', { status: 404 });
      const data = await fs.promises.readFile(filePath);
      const type = mimeFor(fileName);
      const range = request.headers.get('range');
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        if (m) {
          const start = m[1] ? parseInt(m[1], 10) : 0;
          const end = m[2] ? Math.min(parseInt(m[2], 10), data.length - 1) : data.length - 1;
          const slice = data.subarray(start, end + 1);
          return new Response(slice, {
            status: 206,
            headers: {
              'Content-Type': type,
              'Content-Length': String(slice.length),
              'Accept-Ranges': 'bytes',
              'Content-Range': `bytes ${start}-${end}/${data.length}`
            }
          });
        }
      }
      return new Response(data, {
        headers: {
          'Content-Type': type,
          'Content-Length': String(data.length),
          'Accept-Ranges': 'bytes'
        }
      });
    } catch (e) {
      return new Response('Error', { status: 500 });
    }
  });
}

async function checkForUpdateManually() {
  // Honest auto-update for a dir (portable-folder) build:
  // electron-updater can only install a proper installer asset (NSIS).
  // This build ships as a folder with an .exe, so on launch we check the
  // public GitHub Releases feed for jahwickster-web/Novaturient and, if a
  // newer vX.Y.Z tag exists, show a notice offering to open the release.
  // electron-updater is also configured below and will take over once a
  // release with an installer asset exists.
  try {
    const res = await fetch('https://api.github.com/repos/jahwickster-web/Novaturient/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Novaturient' }
    });
    if (!res.ok) return;
    const rel = await res.json();
    const tag = String(rel.tag_name || '').replace(/^v/, '');
    const current = app.getVersion();
    if (!tag || tag === current) return;
    // Simple semver comparison.
    const newer = tag.split('.').map(Number);
    const cur = current.split('.').map(Number);
    let isNewer = false;
    for (let i = 0; i < 3; i++) {
      if ((newer[i] || 0) > (cur[i] || 0)) { isNewer = true; break; }
      if ((newer[i] || 0) < (cur[i] || 0)) break;
    }
    if (!isNewer || updateNoticeShown || !mainWindow) return;
    updateNoticeShown = true;
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Novaturient update available',
      message: `Novaturient v${tag} is available (you have v${current}).`,
      detail: 'This build is a folder with an .exe, so updates are downloaded from GitHub Releases. Your saves stay in your local save files.',
      buttons: ['Download update', 'Later'],
      defaultId: 0,
      cancelId: 1
    });
    if (choice.response === 0 && rel.html_url) await shell.openExternal(rel.html_url);
  } catch (e) {
    // Offline / no releases yet: stay silent, the game still works.
  }
}

function setupAutoUpdater() {
  // electron-updater, GitHub provider (see package.json build.publish).
  // Works fully once a release carries an installer asset; until then the
  // manual GitHub check above is what actually notifies the player.
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', () => {
      if (mainWindow) mainWindow.webContents.send('nova-update-available');
    });
    autoUpdater.on('update-downloaded', async () => {
      if (!mainWindow) return;
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update ready',
        message: 'A Novaturient update has downloaded and is ready to install.',
        buttons: ['Restart and install', 'Later'],
        defaultId: 0,
        cancelId: 1
      });
      if (choice.response === 0) autoUpdater.quitAndInstall(false, true);
    });
    autoUpdater.on('error', () => {});
    // Only check when packaged (not in dev), and don't let a failed check
    // break launch.
    if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {});
  } catch (e) {
    // electron-updater not installed / unavailable: manual check covers it.
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'Novaturient',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow = win;

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));

  win.on('closed', () => { mainWindow = null; });

  // Update checks shortly after launch, so they never block the game.
  setTimeout(() => {
    setupAutoUpdater();
    checkForUpdateManually();
  }, 5000);
}

app.whenReady().then(() => {
  registerMusicProtocol();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
