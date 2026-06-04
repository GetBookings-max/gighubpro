const CACHE = 'gighub-v3';
const BASE = '/gighubpro';
const PRECACHE = [BASE + '/', BASE + '/main.js', BASE + '/manifest.json', BASE + '/icon-192.png', BASE + '/icon-512.png'];
const PASSTHROUGH_HOSTS = ['supabase.co', 'googleapis.com', 'gstatic.com', 'jsdelivr.net'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  try {
    const url = new URL(req.url);
    if (PASSTHROUGH_HOSTS.some(h => url.hostname.includes(h))) return;
    if (req.mode === 'navigate') {
      event.respondWith(fetch(req).then(res => {
        if (res.ok) { const c = res.clone(); caches.open(CACHE).then(cache => cache.put(req, c)).catch(() => {}); }
        return res;
      }).catch(() => caches.match(BASE + '/').then(cached => cached || Response.error())));
      return;
    }
    if (url.origin === self.location.origin) {
      event.respondWith(caches.match(req).then(cached => {
        if (cached) { fetch(req).then(res => { if (res.ok) caches.open(CACHE).then(c => c.put(req, res)).catch(() => {}); }).catch(() => {}); return cached; }
        return fetch(req).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(cache => cache.put(req, c)).catch(() => {}); } return res; });
      }));
    }
  } catch (_) {}
});
