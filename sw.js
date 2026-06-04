// GigHub Service Worker
// Strategy:
//   - Navigation (HTML): network-first → offline fallback to cached shell
//   - Static assets (JS, CSS, fonts): cache-first → update in background
//   - External APIs (Supabase, Google Fonts CDN, jsDelivr): never intercepted
// Security: never caches authenticated responses; auth always goes to network.

const CACHE = 'gighub-v3';
const BASE = '/gighubpro';

// Core shell — cached on install for offline fallback
const PRECACHE = [
  BASE + '/',
  BASE + '/main.js',
  BASE + '/manifest.json',
  BASE + '/icon-192.png',
  BASE + '/icon-512.png',
];

// Hosts that must ALWAYS go straight to the network (no SW interception)
const PASSTHROUGH_HOSTS = [
  'supabase.co',
  'googleapis.com',
  'gstatic.com',
  'jsdelivr.net',
];

// ── Install ─────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(PRECACHE).catch(() => {})
    )
  );
  self.skipWaiting();
});

// ── Activate ────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;

  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http')) return;

  try {
    const url = new URL(req.url);

    if (PASSTHROUGH_HOSTS.some(h => url.hostname.includes(h))) return;

    if (req.mode === 'navigate') {
      event.respondWith(
        fetch(req)
          .then(res => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
            }
            return res;
          })
          .catch(() =>
            caches.match(BASE + '/').then(cached => cached || Response.error())
          )
      );
      return;
    }

    if (url.origin === self.location.origin) {
      event.respondWith(
        caches.match(req).then(cached => {
          if (cached) {
            fetch(req).then(res => {
              if (res.ok) caches.open(CACHE).then(c => c.put(req, res)).catch(() => {});
            }).catch(() => {});
            return cached;
          }
          return fetch(req).then(res => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
            }
            return res;
          });
        })
      );
      return;
    }
  } catch (_) {}
});
