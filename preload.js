// Novaturient preload: safe bridge between the game page and the shell.
// The game page (index.html, unmodified) looks for
// window.NovaturientElectron.music.getTrackUrl({title, format, fileName})
// and plays the returned URL in an <audio> element. We answer with a
// nova-music:// URL served from the local assets/music folder by main.js.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('NovaturientElectron', {
  appName: 'Novaturient',
  music: {
    getTrackUrl: async (track) => {
      const fileName = (track && track.fileName) || (track && track.title) || '';
      if (!fileName) return null;
      return 'nova-music://music/' + encodeURIComponent(fileName);
    }
  }
});
