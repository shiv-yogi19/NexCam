/**
 * NEXCAM CCTV - Service Worker for Offline PWA Support
 * Created By Shiv Yogi
 */

const CACHE_NAME = 'nexcam-cctv-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/logo.svg',
  './assets/favicon.svg',
  './css/typography.css',
  './css/liquid-glass.css',
  './css/animations.css',
  './css/main.css',
  './css/responsive.css',
  './js/icons.js',
  './js/security.js',
  './js/pairing.js',
  './js/device-monitor.js',
  './js/recording.js',
  './js/layouts.js',
  './js/webrtc.js',
  './js/camera.js',
  './js/display.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass through WebSocket and non-GET requests
  if (event.request.method !== 'GET' || event.request.url.includes('/ws')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cache but refresh in background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
