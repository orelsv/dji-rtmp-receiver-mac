const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getActiveStreams: () => ipcRenderer.invoke('get-active-streams'),
  popOut: (key) => ipcRenderer.invoke('pop-out', key),
  startRecording: (key) => ipcRenderer.invoke('record-start', key),
  stopRecording: (key) => ipcRenderer.invoke('record-stop', key),
  openRecordings: () => ipcRenderer.invoke('open-recordings'),
  onStreamStatus: (cb) => ipcRenderer.on('stream-status', (_, data) => cb(data)),
  onRecordingStatus: (cb) => ipcRenderer.on('recording-status', (_, data) => cb(data)),
  onIpsChanged: (cb) => ipcRenderer.on('ips-changed', (_, data) => cb(data)),
});
