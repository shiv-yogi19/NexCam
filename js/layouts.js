/**
 * NEXCAM CCTV - 14 Multi-Camera, Mobile & Desktop Layout Engine
 * Created By Shiv Yogi
 */

class NexcamLayoutManager {
  constructor() {
    this.STORAGE_KEY_MULTI = 'nexcam_multi_cam_layout';
    this.STORAGE_KEY_MOBILE = 'nexcam_mobile_layout';
    this.STORAGE_KEY_DESKTOP = 'nexcam_desktop_layout';

    // Layout options
    this.MULTI_LAYOUTS = [
      { id: 'l1', name: 'L1: Single Focus', class: 'layout-l1-single-focus' },
      { id: 'l2', name: 'L2: Dual View', class: 'layout-l2-dual-view' },
      { id: 'l3', name: 'L3: Quad Grid', class: 'layout-l3-quad-grid' },
      { id: 'l4', name: 'L4: Six View', class: 'layout-l4-six-view' },
      { id: 'l5', name: 'L5: Nine Grid', class: 'layout-l5-nine-grid' },
      { id: 'l6', name: 'L6: Focus + Three', class: 'layout-l6-focus-three' },
      { id: 'l7', name: 'L7: Focus + Five', class: 'layout-l7-focus-five' },
      { id: 'l8', name: 'L8: Adaptive Wall', class: 'layout-l8-adaptive-wall' }
    ];

    this.MOBILE_LAYOUTS = [
      { id: 'm1', name: 'M1: Minimal Control', class: 'mobile-layout-m1' },
      { id: 'm2', name: 'M2: Glass Dashboard', class: 'mobile-layout-m2' },
      { id: 'm3', name: 'M3: Immersive Monitor', class: 'mobile-layout-m3' }
    ];

    this.DESKTOP_LAYOUTS = [
      { id: 'd1', name: 'D1: Professional Sidebar', class: 'desktop-layout-d1' },
      { id: 'd2', name: 'D2: Cinema Monitor', class: 'desktop-layout-d2' },
      { id: 'd3', name: 'D3: Command Center', class: 'desktop-layout-d3' }
    ];

    this.currentMultiLayout = localStorage.getItem(this.STORAGE_KEY_MULTI) || 'l1';
    this.currentMobileLayout = localStorage.getItem(this.STORAGE_KEY_MOBILE) || 'm2';
    this.currentDesktopLayout = localStorage.getItem(this.STORAGE_KEY_DESKTOP) || 'd1';

    this.focusedCameraId = null;
  }

  init() {
    this.applyMobileLayout(this.currentMobileLayout);
    this.applyDesktopLayout(this.currentDesktopLayout);
  }

  setFocusedCamera(camId) {
    this.focusedCameraId = camId;
    this.refreshGridFocusClasses();
  }

  applyMultiCameraLayout(layoutId) {
    const layout = this.MULTI_LAYOUTS.find(l => l.id === layoutId) || this.MULTI_LAYOUTS[0];
    this.currentMultiLayout = layout.id;
    localStorage.setItem(this.STORAGE_KEY_MULTI, layout.id);

    const container = document.getElementById('multi-camera-grid');
    if (container) {
      this.MULTI_LAYOUTS.forEach(l => container.classList.remove(l.class));
      container.classList.add(layout.class);
      this.refreshGridFocusClasses();
    }

    window.dispatchEvent(new CustomEvent('nexcam-layout-changed', { detail: { layoutId: layout.id } }));
  }

  refreshGridFocusClasses() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('multi-camera-grid');
    if (!container) return;

    const cards = Array.from(container.children);
    if (cards.length === 0) return;

    cards.forEach((card, index) => {
      const cardCamId = card.getAttribute('data-cam-id');
      const isFocused = this.focusedCameraId ? (cardCamId === this.focusedCameraId) : (index === 0);

      if (isFocused) {
        card.classList.add('active-focus', 'primary-focus', 'focused');
      } else {
        card.classList.remove('active-focus', 'primary-focus', 'focused');
      }
    });
  }

  applyMobileLayout(layoutId) {
    const layout = this.MOBILE_LAYOUTS.find(l => l.id === layoutId) || this.MOBILE_LAYOUTS[1];
    this.currentMobileLayout = layout.id;
    localStorage.setItem(this.STORAGE_KEY_MOBILE, layout.id);

    this.MOBILE_LAYOUTS.forEach(l => document.body.classList.remove(l.class));
    document.body.classList.add(layout.class);
  }

  applyDesktopLayout(layoutId) {
    const layout = this.DESKTOP_LAYOUTS.find(l => l.id === layoutId) || this.DESKTOP_LAYOUTS[0];
    this.currentDesktopLayout = layout.id;
    localStorage.setItem(this.STORAGE_KEY_DESKTOP, layout.id);

    this.DESKTOP_LAYOUTS.forEach(l => document.body.classList.remove(l.class));
    document.body.classList.add(layout.class);
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.nexcamLayout = new NexcamLayoutManager();
}

export default NexcamLayoutManager;
export { NexcamLayoutManager };

