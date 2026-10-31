/**
 * NEXCAM CCTV - Genuine Device Telemetry & Performance Monitor
 * Created By Shiv Yogi
 */

class NexcamDeviceMonitor {
  constructor() {
    this.battery = null;
    this.network = null;
    this.isBatterySupported = false;
    this.isNetworkSupported = false;

    this.initNativeAPIs();
  }

  async initNativeAPIs() {
    // Battery Status API (Honest detection)
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      try {
        this.battery = await navigator.getBattery();
        this.isBatterySupported = true;
      } catch (e) {
        this.isBatterySupported = false;
      }
    } else {
      this.isBatterySupported = false;
    }

    // Network Information API (Honest detection)
    if (typeof navigator !== 'undefined' && ('connection' in navigator || 'mozConnection' in navigator || 'webkitConnection' in navigator)) {
      this.network = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      this.isNetworkSupported = true;
    } else {
      this.isNetworkSupported = false;
    }
  }

  getBatteryInfo() {
    if (!this.isBatterySupported || !this.battery) {
      return {
        supported: false,
        level: 'Unavailable',
        levelPercent: null,
        charging: 'Unavailable',
        displayText: 'Battery: Unavailable'
      };
    }

    const levelPercent = Math.round(this.battery.level * 100);
    const charging = this.battery.charging;
    return {
      supported: true,
      level: `${levelPercent}%`,
      levelPercent,
      charging: charging ? 'Charging' : 'Discharging',
      displayText: `${levelPercent}% ${charging ? '⚡' : ''}`
    };
  }

  getNetworkInfo() {
    if (!this.isNetworkSupported || !this.network) {
      return {
        supported: false,
        effectiveType: 'Unavailable',
        downlink: 'Unavailable',
        rtt: 'Unavailable',
        displayText: 'Network: Unavailable'
      };
    }

    const effectiveType = (this.network.effectiveType || 'Standard').toUpperCase();
    const downlink = this.network.downlink ? `${this.network.downlink} Mbps` : 'Unavailable';
    const rtt = this.network.rtt ? `${this.network.rtt} ms` : 'Unavailable';

    return {
      supported: true,
      effectiveType,
      downlink,
      rtt,
      displayText: `${effectiveType} (${downlink})`
    };
  }

  /**
   * Genuine WebRTC Stats Measurement (FPS, Resolution, RTT, Jitter)
   */
  async getPeerConnectionStats(peerConnection) {
    if (!peerConnection || peerConnection.connectionState === 'closed') {
      return {
        fps: 0,
        resolution: 'Unavailable',
        latencyMs: 0,
        packetLoss: 0,
        bytesReceived: 0,
        status: 'Disconnected'
      };
    }

    try {
      const stats = await peerConnection.getStats();
      let fps = 0;
      let width = 0;
      let height = 0;
      let latencyMs = 0;
      let packetLoss = 0;
      let bytesReceived = 0;

      stats.forEach(report => {
        // Video track receiver stats
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          fps = report.framesPerSecond ? Math.round(report.framesPerSecond) : (report.framesDecoded || 0);
          bytesReceived = report.bytesReceived || 0;
          if (report.packetsLost && report.packetsReceived) {
            packetLoss = Math.round((report.packetsLost / (report.packetsLost + report.packetsReceived)) * 100);
          }
        }
        // Video track sender stats (for Camera Device)
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          fps = report.framesPerSecond ? Math.round(report.framesPerSecond) : 0;
        }
        // Resolution from track or video frame
        if (report.type === 'track' && report.kind === 'video') {
          width = report.frameWidth || width;
          height = report.frameHeight || height;
        }
        // Latency from candidate-pair RTT
        if (report.type === 'candidate-pair' && report.currentRoundTripTime) {
          latencyMs = Math.round(report.currentRoundTripTime * 1000);
        }
      });

      return {
        fps,
        resolution: (width && height) ? `${width}×${height}` : 'Active Stream',
        latencyMs,
        packetLoss,
        bytesReceived,
        status: peerConnection.connectionState
      };
    } catch (e) {
      return {
        fps: 0,
        resolution: 'Unavailable',
        latencyMs: 0,
        packetLoss: 0,
        bytesReceived: 0,
        status: peerConnection.connectionState
      };
    }
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.nexcamDeviceMonitor = new NexcamDeviceMonitor();
}

export default NexcamDeviceMonitor;
export { NexcamDeviceMonitor };

