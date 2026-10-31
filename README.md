# NEXCAM CCTV
### Premium Multi-Device CCTV Monitoring Platform
**Created By Shiv Yogi**

---

## 1. Project Overview
**NEXCAM CCTV** is a high-performance, mobile-first, multi-device live CCTV monitoring application engineered by **Shiv Yogi**. It transforms any modern smartphone, tablet, or PC into an authorized camera device or multi-feed display monitor using WebRTC, Web Crypto, and a Pure-Black Liquid Glass visual design.

NEXCAM requires **no bulky dependencies or client-side build tools**. The static frontend runs on GitHub Pages or local HTTP servers, while signaling is coordinated via Cloudflare Workers or the included zero-dependency native Node.js signaling server.

---

## 2. Key Features

- **Dual Primary Device Modes:**
  - **Camera Device:** Live camera streaming, Front/Back camera switching, Physical Microphone toggling, Camera Lock, 8-character pairing code & pure SVG QR generation, connected display management, and Emergency Stop.
  - **Display Device:** Multi-camera management, live feeds, remote camera switching, local audio playback control, snapshots, user-initiated recording, and genuine telemetry display.
- **Ultra-Dark Black Screen Battery-Saving Mode (Section 15):**
  - Covers the screen with pure black (`#000000`) and suppresses decorative CSS animations to reduce CPU/GPU draw and battery consumption on OLED displays while camera streaming and signaling continue active.
  - Automatic inactivity timer or manual activation; tap anywhere to reveal HUD controls.
- **Eight Multi-Camera Layouts (L1 - L8):**
  - **L1:** Single Focus (1 large feed)
  - **L2:** Dual View (2 feeds side-by-side)
  - **L3:** Quad Grid (2 × 2 grid)
  - **L4:** Six View (3 × 2 grid)
  - **L5:** Nine Grid (3 × 3 grid)
  - **L6:** Focus + Three (1 large main feed + 3 side thumbnails)
  - **L7:** Focus + Five (1 large main feed + 5 side thumbnails)
  - **L8:** Adaptive Wall (dynamic masonry/grid based on camera count)
- **Three Mobile Layouts:** M1 Minimal Control, M2 Glass Dashboard, M3 Immersive Monitor.
- **Three Desktop Layouts:** D1 Professional Sidebar, D2 Cinema Monitor, D3 Command Center.
- **Secure 8-Character Alphanumeric Pairing:**
  - Random values generated via Web Crypto API excluding ambiguous characters (`0`, `O`, `1`, `I`).
  - Single-use, short-lived 5-minute TTL, rate-limited against brute force (5 attempts per 5 minutes).
  - Explicit Camera Owner approval prompt showing Display device metadata before connection.
- **Camera Lock Enforcement (Section 13):**
  - Camera device can lock camera orientation locally. Remote requests from displays are rejected by the underlying authorization logic with `CAMERA_LOCKED_ERROR`.
- **Display Lower-Right Creator Branding & Real REC Indicator (Section 23):**
  - Displays `Created By Shiv Yogi` with a pulsating red `● REC` indicator **only** when recording is actively executing.
- **15-Second Periodic Security Monitoring (Section 18):**
  - Audits session tokens, heartbeats, and blocked devices every 15 seconds.
- **Honest Device Telemetry (Zero Fake Metrics):**
  - Reads real battery and network information where supported by browser APIs; measures real WebRTC decoded FPS, resolution, latency RTT, and packet loss.

---

## 3. Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Signaling_Layer ["Signaling & Session Coordination"]
        CF["Cloudflare Worker / Node server.js"]
    end

    subgraph Camera_Device ["Camera Device (Broadcaster)"]
        CamCapture["MediaDevices (Camera & Mic)"]
        CamLock["Camera Lock & Security Validator"]
        CamPC["RTCPeerConnection (Sender)"]
        BlackScreen["Ultra-Dark Black Screen Surface"]
    end

    subgraph Display_Device ["Display Device (Monitor)"]
        DispPC["RTCPeerConnection (Receiver)"]
        MultiGrid["Multi-Camera Layout Engine (L1 - L8)"]
        Recorder["MediaRecorder & Snapshot Engine"]
        Watermark["Created By Shiv Yogi ● REC Badge"]
    end

    CamCapture --> CamLock --> CamPC
    CamPC <-->|"1. Pairing & SDP Negotiation (WSS)"| CF
    DispPC <-->|"1. Pairing & SDP Negotiation (WSS)"| CF
    CamPC ==="2. Encrypted Live Media (DTLS-SRTP WebRTC)"===> DispPC
    CamPC <--->|"3. Control Channel (RTCDataChannel)"| DispPC
    DispPC --> MultiGrid
    DispPC --> Recorder --> Watermark
```

---

## 4. Technology Stack & Project Structure

```
NEXCAM/
├── index.html              # Main application entry point
├── manifest.json           # PWA Web App Manifest
├── service-worker.js       # Offline PWA service worker
├── server.js               # Zero-dependency local Node.js server (HTTP + RFC 6455 WS)
├── package.json            # Node project configuration
├── README.md               # Complete platform documentation
├── TEST_REPORT.md          # Verification test report
├── assets/
│   ├── logo.svg            # Custom camera lens & security shield logo
│   └── favicon.svg         # SVG favicon
├── css/
│   ├── typography.css      # Typography system & font presets
│   ├── liquid-glass.css    # Pure-black glassmorphism system
│   ├── animations.css      # Intro splash & micro-interactions
│   ├── main.css            # Core UI layout & component styles
│   └── responsive.css      # 14 layouts (8 multi, 3 mobile, 3 desktop)
├── js/
│   ├── app.js              # Application orchestrator & intro animation
│   ├── camera.js           # Camera controller & black screen manager
│   ├── display.js          # Display controller & multi-camera manager
│   ├── pairing.js          # 8-char pairing & pure SVG QR generator
│   ├── webrtc.js           # PeerConnection & signaling coordinator
│   ├── security.js         # Session validator, blocklist & 15s monitor
│   ├── device-monitor.js   # Battery, network, and WebRTC stats monitor
│   ├── layouts.js          # 14 layout switcher & focus tracking
│   ├── recording.js        # MediaRecorder, snapshots & REC indicator
│   └── icons.js            # Standalone vector SVG icon library
├── worker/
│   ├── signaling.js        # Cloudflare Worker WebSocket relay
│   ├── pairing.js          # Cloudflare Worker pairing coordinator
│   ├── sessions.js         # Cloudflare Worker session store
│   └── wrangler.toml       # Cloudflare Wrangler deployment configuration
└── tests/
    ├── pairing.test.js     # Pairing & QR unit tests
    ├── security.test.js    # Security & rate-limiting unit tests
    ├── layouts.test.js     # Layouts unit tests
    └── runner.js           # Automated test suite runner
```

---

## 5. Local Development Setup

NEXCAM includes a zero-dependency server using Node.js native `node:http` and `node:crypto`.

1. Ensure Node.js (v18+) is installed.
2. In the project directory, run:
   ```bash
   node server.js
   ```
3. Open your browser:
   - **Local Web Interface:** `http://localhost:8080`
   - **Signaling Endpoint:** `ws://localhost:8080/ws`
   - **Health Status:** `http://localhost:8080/health`

### Running the Automated Tests
```bash
node tests/runner.js
```

---

## 6. Deployment Instructions

### A. Deploy Frontend to GitHub Pages
1. Push the contents of the `NEXCAM` folder to a GitHub repository.
2. In GitHub repository settings, go to **Settings → Pages**.
3. Under **Branch**, select `main` (or `master`) and directory `/ (root)`. Click **Save**.
4. Your static frontend will be live at `https://<username>.github.io/<repo-name>/`.

### B. Deploy Signaling to Cloudflare Workers
1. Install Cloudflare Wrangler (if not already installed):
   ```bash
   pnpm add -D wrangler
   ```
2. Navigate to the `worker/` directory:
   ```bash
   cd worker
   ```
3. Authenticate and deploy:
   ```bash
   npx wrangler deploy
   ```
4. Copy your assigned Cloudflare Worker URL (e.g. `https://nexcam-cctv-signaling.<subdomain>.workers.dev`).
5. Open NEXCAM in your browser, click **Settings (Gear icon)**, and set the **Signaling Server URL** to:
   ```
   wss://nexcam-cctv-signaling.<subdomain>.workers.dev/ws
   ```

---

## 7. STUN & TURN Configuration
- By default, NEXCAM uses Google's public STUN servers:
  - `stun:stun.l.google.com:19302`
  - `stun:stun1.l.google.com:19302`
- STUN is sufficient for direct peer-to-peer streaming when devices are on the same local network or behind standard non-symmetric NATs.
- For connections behind strict enterprise firewalls or symmetric carrier CGNATs, configure custom TURN credentials in **Settings → TURN Configuration**.

---

## 8. Operating System & Browser Limitations

1. **Ultra-Dark Black Screen vs Screen Lock:**
   A pure black website surface maintains camera feed operation on mobile browsers without screen burn-in on OLED screens. However, pressing the phone's physical power button to lock the phone will cause mobile operating systems (Android/iOS) to suspend web browser execution. Keep the phone awake with Black Screen Mode active.
2. **Device Hardware IMEI:**
   Web security sandboxes deliberately prevent access to physical phone IMEI or MAC addresses. NEXCAM utilizes cryptographically generated persistent device UUIDs.
3. **Codec & MediaRecorder Support:**
   Video recording leverages WebM with VP9/VP8 on Android/Chrome/Firefox, and MP4/H.264 on Safari/iOS.

---

## 9. Security Model

- **Media Encryption:** End-to-end encryption across peers via standard WebRTC DTLS-SRTP.
- **Signaling Protection:** Secure WebSockets (WSS) and HTTPS.
- **Single-Use Pairing Codes:** Invalidate immediately upon successful handshake or explicit rejection.
- **Brute-Force Rate Limiting:** 5 failed attempts within 5 minutes triggers lockout.
- **Continuous Audit:** 15-second background audit verifying heartbeat liveness and revoked sessions.

---

**NEXCAM CCTV**  
*Created By Shiv Yogi*
