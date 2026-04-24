const params = new URLSearchParams(location.search);
let currentKey = params.get('key');

const streamSelect = document.getElementById('stream-select');
const wrap = document.querySelector('.video-wrap');
const video = document.querySelector('video');
const dot = document.querySelector('.status-dot');
const overlay = document.querySelector('.error-overlay');

let player = null;
let httpPort = 8000;

function showError(msg) {
  overlay.textContent = msg;
  overlay.hidden = false;
  console.error(`[${currentKey}]`, msg);
}
function clearError() { overlay.hidden = true; }

function attachPlayer() {
  if (player) return;
  clearError();
  if (!window.mpegts) { showError('mpegts.js not loaded'); return; }
  if (!mpegts.isSupported()) { showError('MSE not supported'); return; }

  const flvUrl = `http://localhost:${httpPort}/live/${currentKey}.flv`;
  player = mpegts.createPlayer(
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
    showError(`mpegts ${type}: ${detail}\n${JSON.stringify(info, null, 2)}`);
  });
  player.attachMediaElement(video);
  player.load();
  player.play().catch((e) => showError(`play() rejected: ${e.message}`));
  wrap.classList.add('live');
  dot.classList.add('live');
}

function detachPlayer() {
  if (!player) return;
  try { player.pause(); player.unload(); player.detachMediaElement(); player.destroy(); } catch {}
  player = null;
  wrap.classList.remove('live');
  dot.classList.remove('live');
}

async function switchTo(key) {
  detachPlayer();
  clearError();
  currentKey = key;
  document.title = streamSelect.options[streamSelect.selectedIndex]?.text || key;
  const active = await window.api.getActiveStreams();
  if (active.includes(currentKey)) attachPlayer();
}

wrap.addEventListener('dblclick', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
});

async function init() {
  const config = await window.api.getConfig();
  httpPort = config.httpPort;

  for (const s of config.streams) {
    const opt = document.createElement('option');
    opt.value = s.key;
    opt.textContent = s.label;
    if (s.key === currentKey) opt.selected = true;
    streamSelect.appendChild(opt);
  }
  if (!config.streams.find(s => s.key === currentKey)) {
    currentKey = config.streams[0]?.key;
    streamSelect.value = currentKey;
  }
  document.title = streamSelect.options[streamSelect.selectedIndex]?.text || currentKey;

  streamSelect.addEventListener('change', () => switchTo(streamSelect.value));

  const active = await window.api.getActiveStreams();
  if (active.includes(currentKey)) attachPlayer();

  window.api.onStreamStatus(({ key, live }) => {
    if (key !== currentKey) return;
    if (live) setTimeout(attachPlayer, 500);
    else detachPlayer();
  });
}

init();
