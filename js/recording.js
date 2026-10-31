/**
 * NEXCAM CCTV - User-Initiated Recording & Snapshot Engine
 * Created By Shiv Yogi
 */

class NexcamRecordingManager {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.recordingStartTime = 0;
    this.activeStream = null;

    // Callbacks
    this.onStateChangeCallback = null;
  }

  setStateCallback(cb) {
    this.onStateChangeCallback = cb;
  }

  _notifyState(isRecording) {
    this.isRecording = isRecording;
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(isRecording);
    }

    // Toggle real REC indicator on the display device UI
    const recBadge = document.getElementById('display-rec-indicator');
    if (recBadge) {
      if (isRecording) {
        recBadge.classList.add('recording-active');
      } else {
        recBadge.classList.remove('recording-active');
      }
    }
  }

  /**
   * Determine best supported video MIME type
   */
  getSupportedMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;

    const candidateTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4'
    ];

    for (const type of candidateTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  /**
   * Start User-Initiated Recording
   */
  startRecording(mediaStream) {
    if (this.isRecording) {
      throw new Error('Recording is already in progress.');
    }

    if (!mediaStream || mediaStream.getVideoTracks().length === 0) {
      throw new Error('No active video stream available to record.');
    }

    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder API is not supported in this browser.');
    }

    this.activeStream = mediaStream;
    this.recordedChunks = [];

    const mimeType = this.getSupportedMimeType();
    const options = mimeType ? { mimeType } : {};

    try {
      this.mediaRecorder = new MediaRecorder(mediaStream, options);
    } catch (e) {
      // Fallback without mimeType specification
      this.mediaRecorder = new MediaRecorder(mediaStream);
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this._saveRecordingBlob();
      this._notifyState(false);
    };

    this.mediaRecorder.onerror = (err) => {
      console.error('MediaRecorder error:', err);
      this._notifyState(false);
    };

    // Request data in 1-second chunks for smooth handling
    this.mediaRecorder.start(1000);
    this.recordingStartTime = Date.now();
    this._notifyState(true);

    return {
      started: true,
      mimeType: this.mediaRecorder.mimeType
    };
  }

  /**
   * Stop Recording and trigger file download
   */
  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      return false;
    }

    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    return true;
  }

  _saveRecordingBlob() {
    if (this.recordedChunks.length === 0) return;

    const mimeType = (this.mediaRecorder && this.mediaRecorder.mimeType) || 'video/webm';
    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(this.recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `NEXCAM_ShivYogi_Rec_${timestamp}.${extension}`;

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  }

  /**
   * High-Resolution Live Snapshot Capture
   */
  captureSnapshot(videoElement, cameraName = 'Camera') {
    if (!videoElement || videoElement.videoWidth === 0) {
      throw new Error('Video stream is not currently ready for snapshot.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');

    // Draw high-resolution frame
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    // Overlay Subtle Professional CCTV Timestamp HUD
    const now = new Date();
    const timeStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString() + ` [${cameraName.toUpperCase()}]`;
    ctx.font = '16px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(16, canvas.height - 44, ctx.measureText(timeStr).width + 24, 28);
    ctx.fillStyle = '#00e5ff';
    ctx.fillText(timeStr, 28, canvas.height - 25);

    // Export image blob
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `NEXCAM_Snapshot_${cameraName}_${timestamp}.png`;

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1500);
    }, 'image/png');

    return true;
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.nexcamRecording = new NexcamRecordingManager();
}

export default NexcamRecordingManager;
export { NexcamRecordingManager };

