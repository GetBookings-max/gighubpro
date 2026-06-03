// GigHub Service Worker
// Strategy:
//   - Navigation (HTML): network-first → offline fallback to cached shell
//   - Static assets (JS, CSS, fonts): cache-first → update in background
//   - External APIs (Supabase, Google Fonts CDN, jsDelivr): never intercepted
// Security: never caches authenticated responses; auth always goes to network.

const CACHE = 'gighub-v1';

// Core shell — cached on install for offline fallback
const PRECACHE = ['/', '/main.js', '/manifest.json'];

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
      // addAll is all-or-nothing; failures here are non-fatal (SW still activates)
      cache.addAll(PRECACHE).catch(() => {})
    )
  );
  // Activate immediately — don't wait for old SW to be released
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
  // Take control of all clients immediately
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Only handle http(s)
  if (!req.url.startsWith('http')) return;

  try {
    const url = new URL(req.url);

    // Pass through external API hosts — let the browser handle them unmodified
    if (PASSTHROUGH_HOSTS.some(h => url.hostname.includes(h))) return;

    // ── Navigation (HTML page loads): network-first ──────────────────────────
    // Always fetch fresh HTML so auth state, lock screen and CSP stay current.
    // Fall back to cached shell only when truly offline.
    if (req.mode === 'navigate') {
      event.respondWith(
        fetch(req)
          .then(res => {
            // Cache successful responses for offline fallback
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
            }
            return res;
          })
          .catch(() =>
            // Offline: serve the cached shell (lock screen still works locally)
            caches.match('/').then(cached => cached || Response.error())
          )
      );
      return;
    }

    // ── Static assets (same origin only): cache-first ───────────────────────
    // Covers main.js, manifest.json, icons, and any other local static files.
    if (url.origin === self.location.origin) {
      event.respondWith(
        caches.match(req).then(cached => {
          if (cached) {
            // Serve from cache; revalidate in background (stale-while-revalidate)
            fetch(req)
              .then(res => {
                if (res.ok) {
                  caches.open(CACHE).then(c => c.put(req, res)).catch(() => {});
                }
              })
              .catch(() => {});
            return cached;
          }
          // Not in cache — fetch and store
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

    // Everything else (cross-origin non-API): let browser handle normally
  } catch (_) {
    // Malformed URL or unexpected error — do not intercept
  }
});
