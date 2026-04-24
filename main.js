const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const NodeMediaServer = require('node-media-server');
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

const RTMP_PORT = 1935;
const HTTP_PORT = 8000;

const STREAMS = [
  { key: 'action5', label: 'DJI Action 5 Pro' },
  { key: 'pocket3', label: 'DJI Pocket 3' },
];

let mainWindow;
let nms;
const recorders = new Map();
const liveStreams = new Set();
const popouts = new Map();

function allWindows() {
  const arr = [];
  if (mainWindow && !mainWindow.isDestroyed()) arr.push(mainWindow);
  for (const w of popouts.values()) if (!w.isDestroyed()) arr.push(w);
  return arr;
}

function broadcast(channel, data) {
  for (const w of allWindows()) w.webContents.send(channel, data);
}

function listLocalIps() {
  const ifaces = os.networkInterfaces();
  const out = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const iface of addrs) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      out.push({ name, address: iface.address });
    }
  }
  const priority = (n) => {
    if (n === 'en0') return 0;
    if (n === 'en1') return 1;
    if (n.startsWith('en')) return 2;
    if (n.startsWith('bridge')) return 90;
    if (n.startsWith('utun') || n.startsWith('vmenet') || n.startsWith('awdl') || n.startsWith('llw')) return 95;
    return 50;
  };
  out.sort((a, b) => priority(a.name) - priority(b.name));
  return out;
}

function getLocalIp() {
  const list = listLocalIps();
  return list[0]?.address || '127.0.0.1';
}

let lastIpsJson = '';
function startIpPolling() {
  setInterval(() => {
    const ips = listLocalIps();
    const json = JSON.stringify(ips);
    if (json !== lastIpsJson) {
      lastIpsJson = json;
      broadcast('ips-changed', { ip: ips[0]?.address || '127.0.0.1', ips });
    }
  }, 5000);
}

function startRtmpServer() {
  nms = new NodeMediaServer({
    rtmp: { port: RTMP_PORT, chunk_size: 60000, gop_cache: true, ping: 30, ping_timeout: 60 },
    http: { port: HTTP_PORT, allow_origin: '*' },
  });
  nms.run();

  nms.on('postPublish', (id, streamPath) => {
    const key = streamPath.split('/').pop();
    liveStreams.add(key);
    broadcast('stream-status', { key, live: true });
  });
  nms.on('donePublish', (id, streamPath) => {
    const key = streamPath.split('/').pop();
    liveStreams.delete(key);
    broadcast('stream-status', { key, live: false });
    stopRecording(key);
  });
}

function recordingsDir() {
  const dir = path.join(app.getPath('videos'), 'LiveStreamOCM');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function startRecording(key) {
  if (!STREAMS.some(s => s.key === key)) return { ok: false, reason: 'unknown stream key' };
  if (recorders.has(key)) return { ok: false, reason: 'already recording' };
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(recordingsDir(), `${key}-${ts}.mp4`);
  const inputUrl = `rtmp://127.0.0.1:${RTMP_PORT}/live/${key}`;
  const proc = spawn(ffmpegPath, [
    '-i', inputUrl,
    '-c', 'copy',
    '-movflags', '+faststart',
    '-y',
    outFile,
  ]);
  proc.on('exit', () => {
    recorders.delete(key);
    broadcast('recording-status', { key, recording: false, file: outFile });
  });
  recorders.set(key, { proc, file: outFile });
  broadcast('recording-status', { key, recording: true, file: outFile });
  return { ok: true, file: outFile };
}

function stopRecording(key) {
  const r = recorders.get(key);
  if (!r) return { ok: false };
  try { r.proc.stdin.write('q'); } catch {}
  setTimeout(() => { if (recorders.has(key)) r.proc.kill('SIGTERM'); }, 1500);
  return { ok: true };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    backgroundColor: '#0f1115',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('get-config', () => ({
  ip: getLocalIp(),
  ips: listLocalIps(),
  rtmpPort: RTMP_PORT,
  httpPort: HTTP_PORT,
  streams: STREAMS,
}));
ipcMain.handle('record-start', (_e, key) => startRecording(key));
ipcMain.handle('record-stop', (_e, key) => stopRecording(key));
ipcMain.handle('open-recordings', () => shell.openPath(recordingsDir()));
ipcMain.handle('get-active-streams', () => Array.from(liveStreams));
ipcMain.handle('pop-out', (_e, key) => {
  const existing = popouts.get(key);
  if (existing && !existing.isDestroyed()) { existing.focus(); return; }
  const stream = STREAMS.find(s => s.key === key);
  const label = stream?.label || key;
  const w = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000',
    title: label,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  w.loadFile(path.join(__dirname, 'renderer', 'popout.html'), { query: { key, label } });
  popouts.set(key, w);
  w.on('closed', () => popouts.delete(key));
});

app.whenReady().then(() => {
  startRtmpServer();
  startIpPolling();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const { proc } of recorders.values()) proc.kill('SIGTERM');
  if (process.platform !== 'darwin') app.quit();
});
