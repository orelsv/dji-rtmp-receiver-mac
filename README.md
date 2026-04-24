# Live Stream OCM

A local RTMP receiver for macOS that brings your DJI Action 5 Pro and DJI Pocket 3 livestreams onto your MacBook over Wi-Fi — side-by-side preview, pop-out windows for a second display or projector, and optional per-camera MP4 recording.

> Built because OBS can only **send** RTMP. There was no simple consumer app to **receive** it on a Mac.

## Features

- Dual-camera preview in one window (stream keys `action5`, `pocket3`)
- Pop-out window per camera — drag to a second display / projector and enter macOS-native fullscreen
- In-popout dropdown to switch cameras on the fly during a live presentation (no close/reopen)
- Per-camera MP4 recording via bundled `ffmpeg`
- Auto-detect IP changes when switching Wi-Fi networks
- Network interface selector (prioritises `en0` Wi-Fi over macOS Internet Sharing `bridge100`)

## Requirements

- macOS 10.15+ (Catalina or newer)
- DJI camera that supports RTMP livestreaming via DJI Mimo (Action 5 Pro, Pocket 3, others with RTMP support)
- Camera and MacBook on the same Wi-Fi network

## Install (from `.dmg`)

1. Open the `.dmg` and drag **Live Stream OCM** to `Applications`
2. Because the app is self-signed (ad-hoc), macOS will refuse to open it on first launch. Clear quarantine:

   ```bash
   sudo xattr -cr "/Applications/Live Stream OCM.app"
   ```

3. Launch from Applications. When macOS Firewall asks to allow network connections — click **Allow**

## Build from source

```bash
git clone https://github.com/orelsv/dji-rtmp-receiver-mac.git
cd dji-rtmp-receiver-mac
npm install
npm start                  # dev run
npm run build              # produces dist/*.dmg for the host architecture
npm run build:universal    # universal binary for Intel + Apple Silicon
```

## How to stream

1. Open the app — note the IP shown at the top of the window (e.g. `192.168.178.146`)
2. In **DJI Mimo** on your phone: `LIVESTREAM → RTMP`
   - **URL:** `rtmp://<mac-ip>:1935/live`
   - **Stream Key:** `action5` for DJI Action 5 Pro, `pocket3` for DJI Pocket 3
3. Start Livestream in Mimo — the tile in the app turns green with live video (~1 s latency)
4. Click **⧉ Pop out** to open a camera in a separate window; drag that window to a projector and go fullscreen

## Architecture

```
DJI Camera (Wi-Fi) ──RTMP──▶ node-media-server (:1935)
                                    │
                                    │ HTTP-FLV (:8000)
                                    ▼
                             Electron Renderer
                                    │
                                    ├─ mpegts.js   (~1 s live playback)
                                    └─ ffmpeg      (optional MP4 recording)
```

| Component           | Purpose                                |
|---------------------|----------------------------------------|
| `node-media-server` | RTMP ingest + HTTP-FLV transmux        |
| `mpegts.js`         | Low-latency FLV playback in the window |
| `ffmpeg-static`     | Bundled recorder binary                |
| `electron-builder`  | Packaging to `.dmg`                    |

## Security notes

This app runs a small local server. Before taking it to a coffee shop or conference Wi-Fi, be aware:

- **RTMP `:1935` and HTTP-FLV `:8000` bind to all interfaces.** Anyone on the same LAN can `GET http://<your-mac>:8000/live/action5.flv` and view your stream. On a trusted home network this is fine; on a public network it is not.
- **No authentication on the RTMP publish endpoint.** Anyone on the LAN who knows the server exists could push a stream to it. Unknown stream keys are ignored by the UI, but you're paying the bandwidth cost.
- **CSP allows `'unsafe-eval'`** for `mpegts.js` compatibility. Mitigations: script source is restricted to `'self'` and `cdn.jsdelivr.net`; `contextIsolation: true`, `nodeIntegration: false`, preload via `contextBridge`.
- **`mpegts.js` is loaded from `cdn.jsdelivr.net`** rather than vendored locally (supply-chain consideration for future iterations).
- **Dependencies have known advisories** — `electron <= 39.8.4` (ASAR Integrity Bypass), and the `electron-builder` tree depends on an older `@tootallnate/once`. These are listed here intentionally; `npm audit fix --force` would introduce breaking changes. Planned for a v0.2 pass.

If any of the above matters for your use case: bind the servers to `127.0.0.1`, require a shared secret, run in an isolated VLAN, or rebuild with a newer Electron.

## Roadmap

- [ ] Vendor `mpegts.js` locally (drop CDN dependency)
- [ ] Upgrade Electron to the current stable
- [ ] App icon
- [ ] Auto-record on stream start (optional setting)
- [ ] Dynamic stream list (instead of hard-coded `action5` / `pocket3`)
- [ ] NDI output for downstream OBS integration
- [ ] Code signing with an Apple Developer ID + notarization

## License

MIT — see [LICENSE](LICENSE).

---

Built by **Bogdan Orel | OrelTech**
