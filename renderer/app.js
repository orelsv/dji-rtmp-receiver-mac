const grid = document.getElementById('grid');
const tpl = document.getElementById('tile-tpl');
const ipSelect = document.getElementById('ip-select');

const tiles = new Map();
let config;
let currentIp;

function updateUrls() {
  for (const [key, t] of tiles) {
    const url = `rtmp://${currentIp}:${config.rtmpPort}/live/${key}`;
    t.urlEl.textContent = url;
    t.url = url;
  }
}

function buildTile({ key, label }) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.key = key;
  node.querySelector('.tile-name').textContent = label;

  const urlEl = node.querySelector('.url');
  node.querySelector('.copy-url').addEventListener('click', () => {
    const t = tiles.get(key);
    if (t?.url) navigator.clipboard.writeText(t.url);
  });

  const wrap = node.querySelector('.video-wrap');
  const video = node.querySelector('video');
  const recBtn = node.querySelector('.record');
  const fsBtn = node.querySelector('.fullscreen');
  const popBtn = node.querySelector('.popout');
  const dot = node.querySelector('.status-dot');

  wrap.addEventListener('dblclick', () => toggleFullscreen(wrap));
  fsBtn.addEventListener('click', () => toggleFullscreen(wrap));
  popBtn.addEventListener('click', () => window.api.popOut(key));
  recBtn.addEventListener('click', async () => {
    if (recBtn.classList.contains('active')) {
      await window.api.stopRecording(key);
    } else {
      await window.api.startRecording(key);
    }
  });

  grid.appendChild(node);
  tiles.set(key, { node, wrap, video, recBtn, dot, urlEl, url: '', player: null });
}

function toggleFullscreen(el) {
  if (document.fullscreenElement) document.exitFullscreen();
  else el.requestFullscreen();
}

function showError(key, msg) {
  const t = tiles.get(key);
  if (!t) return;
  const overlay = t.node.querySelector('.error-overlay');
  overlay.textContent = msg;
  overlay.hidden = false;
  console.error(`[${key}]`, msg);
}
function clearError(key) {
  const t = tiles.get(key);
  if (!t) return;
  t.node.querySelector('.error-overlay').hidden = true;
}

function attachPlayer(key) {
  const t = tiles.get(key);
  if (!t || t.player) return;
  const flvUrl = `http://localhost:${config.httpPort}/live/${key}.flv`;
  clearError(key);

  if (!window.mpegts) { showError(key, 'mpegts.js not loaded (check internet / CSP)'); return; }
  if (!mpegts.isSupported()) { showError(key, 'mpegts.js: MSE not supported in this Electron'); return; }

  const player = mpegts.createPlayer(
    { type: 'flv', url: flvUrl, isLive: true, hasAudio: true, hasVideo: true },
    {
      enableWorker: false,
      enableStashBuffer: false,
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 1.2,
      liveBufferLatencyMinRemain: 0.3,
    }
  );

  player.on(mpegts.Events.ERROR, (type, detail, info) => {
    showError(key, `mpegts ${type}: ${detail}\n${JSON.stringify(info, null, 2)}`);
  });
  player.on(mpegts.Events.MEDIA_INFO, (info) => {
    console.log(`[${key}] media info:`, info);
  });
  t.video.addEventListener('error', () => {
    const err = t.video.error;
    showError(key, `video error code=${err?.code} message=${err?.message || 'n/a'}`);
  });

  player.attachMediaElement(t.video);
  player.load();
  player.play().catch((e) => showError(key, `play() rejected: ${e.message}`));
  t.player = player;
  t.wrap.classList.add('live');
  t.dot.classList.add('live');
}

function detachPlayer(key) {
  const t = tiles.get(key);
  if (!t || !t.player) return;
  try { t.player.pause(); t.player.unload(); t.player.detachMediaElement(); t.player.destroy(); } catch {}
  t.player = null;
  t.wrap.classList.remove('live');
  t.dot.classList.remove('live');
}

function populateIps(ips, preferred) {
  const prev = currentIp;
  ipSelect.innerHTML = '';
  for (const { name, address } of ips) {
    const opt = document.createElement('option');
    opt.value = address;
    opt.textContent = `${address}  (${name})`;
    ipSelect.appendChild(opt);
  }
  const keep = ips.find(i => i.address === prev)?.address;
  currentIp = keep || preferred || ips[0]?.address || '127.0.0.1';
  ipSelect.value = currentIp;
  updateUrls();
}

async function init() {
  config = await window.api.getConfig();
  currentIp = config.ip;

  ipSelect.addEventListener('change', () => {
    currentIp = ipSelect.value;
    updateUrls();
  });
  window.api.onIpsChanged(({ ip, ips }) => populateIps(ips, ip));

  document.getElementById('copy-ip').addEventListener('click', () => navigator.clipboard.writeText(currentIp));
  document.getElementById('open-recordings').addEventListener('click', () => window.api.openRecordings());
  for (const s of config.streams) buildTile(s);
  populateIps(config.ips, config.ip);

  const active = await window.api.getActiveStreams();
  for (const key of active) attachPlayer(key);

  window.api.onStreamStatus(({ key, live }) => {
    if (live) setTimeout(() => attachPlayer(key), 500);
    else detachPlayer(key);
  });
  window.api.onRecordingStatus(({ key, recording }) => {
    const t = tiles.get(key);
    if (!t) return;
    t.recBtn.classList.toggle('active', recording);
    t.recBtn.textContent = recording ? '⏹ Stop' : '⏺ Rec';
  });
}

init();
