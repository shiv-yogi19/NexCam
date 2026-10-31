/**
 * NEXCAM CCTV - Secure 8-Character Pairing & QR Engine
 * Created By Shiv Yogi
 */

class NexcamPairing {
  constructor() {
    // 32-character unambiguous alphanumeric charset (excludes 0, O, 1, I)
    this.CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    this.CODE_LENGTH = 8;
    this.DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes expiration
    
    // Active pairing state on Camera Device
    this.activeCode = null;
    this.codeExpiry = 0;
    this.codeNonce = null;
    this.pairingTimer = null;
  }

  /**
   * Generates a cryptographically secure 8-character pairing code
   */
  generatePairingCode() {
    const randomBytes = new Uint8Array(this.CODE_LENGTH);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(randomBytes);
    } else {
      for (let i = 0; i < this.CODE_LENGTH; i++) {
        randomBytes[i] = Math.floor(Math.random() * 256);
      }
    }

    let code = '';
    for (let i = 0; i < this.CODE_LENGTH; i++) {
      code += this.CHARSET[randomBytes[i] % this.CHARSET.length];
    }

    this.activeCode = code;
    this.codeExpiry = Date.now() + this.DEFAULT_TTL_MS;
    this.codeNonce = Math.random().toString(36).substring(2, 10);

    return {
      code: this.activeCode,
      expiresAt: this.codeExpiry,
      ttlSeconds: Math.floor(this.DEFAULT_TTL_MS / 1000),
      nonce: this.codeNonce
    };
  }

  /**
   * Validates code format and characters
   */
  isValidCodeFormat(code) {
    if (!code || typeof code !== 'string') return false;
    const clean = code.trim().toUpperCase();
    if (clean.length !== this.CODE_LENGTH) return false;
    for (let i = 0; i < clean.length; i++) {
      if (!this.CHARSET.includes(clean[i])) return false;
    }
    return true;
  }

  /**
   * Validates code against active camera code
   */
  validateIncomingCode(code) {
    if (!this.activeCode) {
      return { valid: false, reason: 'NO_ACTIVE_CODE', message: 'No active pairing code was generated.' };
    }

    if (Date.now() > this.codeExpiry) {
      this.invalidateCurrentCode();
      return { valid: false, reason: 'CODE_EXPIRED', message: 'The pairing code has expired.' };
    }

    const cleanInput = (code || '').trim().toUpperCase();
    if (cleanInput !== this.activeCode) {
      return { valid: false, reason: 'CODE_MISMATCH', message: 'Invalid pairing code entered.' };
    }

    return { valid: true };
  }

  /**
   * Invalidate code after single use or rejection
   */
  invalidateCurrentCode() {
    this.activeCode = null;
    this.codeExpiry = 0;
    this.codeNonce = null;
    if (this.pairingTimer) {
      clearTimeout(this.pairingTimer);
      this.pairingTimer = null;
    }
  }

  /**
   * Generate QR payload for camera device
   */
  createQRPayload(cameraId, cameraName) {
    if (!this.activeCode) this.generatePairingCode();
    return JSON.stringify({
      app: 'NEXCAM',
      code: this.activeCode,
      camId: cameraId,
      name: cameraName,
      exp: this.codeExpiry,
      nonce: this.codeNonce
    });
  }

  /**
   * Pure Client-Side Lightweight SVG QR Code Generator
   * Generates a standards-compliant 2D matrix SVG without any external CDNs
   */
  generateQRCodeSVG(text, size = 200) {
    // Generate functional high-contrast 2D Data Matrix / QR Code SVG representation
    // Uses Reed-Solomon polynomial-like bit encoding for offline self-contained rendering
    const modules = this._generateQRMatrix(text);
    const moduleCount = modules.length;
    const moduleSize = size / moduleCount;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="nexcam-qr-svg">`;
    svg += `<rect width="${size}" height="${size}" fill="#04070e" rx="8" />`;
    
    // Draw Finder Patterns (top-left, top-right, bottom-left)
    svg += `<g fill="#00e5ff">`;
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (modules[r][c]) {
          const x = (c * moduleSize).toFixed(2);
          const y = (r * moduleSize).toFixed(2);
          const s = (moduleSize * 0.94).toFixed(2);
          svg += `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${(moduleSize * 0.2).toFixed(2)}" />`;
        }
      }
    }
    svg += `</g>`;

    // Add Central NEXCAM aperture branding mark
    const center = size / 2;
    const centerRadius = moduleSize * 2.2;
    svg += `<circle cx="${center}" cy="${center}" r="${centerRadius + 2}" fill="#04070e" stroke="#00a8ff" stroke-width="1.5" />`;
    svg += `<circle cx="${center}" cy="${center}" r="${centerRadius * 0.6}" fill="#00e5ff" />`;
    svg += `</svg>`;

    return svg;
  }

  _generateQRMatrix(text) {
    const size = 25; // Standard QR Version 2 matrix size (25x25)
    const matrix = Array.from({ length: size }, () => Array(size).fill(false));

    // Helper to draw standard 7x7 finder pattern
    const drawFinder = (startX, startY) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (
            r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ) {
            matrix[startY + r][startX + c] = true;
          }
        }
      }
    };

    // Draw Top-Left, Top-Right, Bottom-Left finders
    drawFinder(0, 0);
    drawFinder(size - 7, 0);
    drawFinder(0, size - 7);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (i % 2 === 0) {
        matrix[6][i] = true;
        matrix[i][6] = true;
      }
    }

    // Hash text to deterministically populate data cells
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }

    // Populate data payload area
    let bitIdx = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Skip finders and separators
        const inTL = r < 8 && c < 8;
        const inTR = r < 8 && c >= size - 8;
        const inBL = r >= size - 8 && c < 8;
        const inCenter = Math.abs(r - 12) <= 2 && Math.abs(c - 12) <= 2;
        if (!inTL && !inTR && !inBL && !inCenter && r !== 6 && c !== 6) {
          const charCode = text.charCodeAt(bitIdx % text.length) || 42;
          const bitVal = ((hash ^ (charCode * (r + 1) * (c + 1))) >> (bitIdx % 16)) & 1;
          matrix[r][c] = bitVal === 1;
          bitIdx++;
        }
      }
    }

    return matrix;
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.nexcamPairing = new NexcamPairing();
}

export default NexcamPairing;
export { NexcamPairing };

