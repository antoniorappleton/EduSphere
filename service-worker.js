
const CACHE_STATIC = "edusphere-static-v2";
const CACHE_DYNAMIC = "edusphere-dynamic-v2";
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.json",
  "/public/img/icon-192.png",
  "/public/img/icon-512.png",
  "/public/img/logo-full.svg",
  "/public/js/supabaseClient.js",
  "/public/js/router.js"
];

// Install: pre-cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![CACHE_STATIC, CACHE_DYNAMIC].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: stale-while-revalidate for HTML/CSS/JS; cache-first for images
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bypass for non-GET or cross-origin (e.g., APIs)
  if (req.method !== "GET" || url.origin !== self.location.origin) {
    event.respondWith(fetch(req).catch(() => offlineFallback()));
    return;
  }

  // Prefer cache-first for images
  if (req.destination === "image" || url.pathname.startsWith("/public/img/")) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req)
          .then((res) => putInDynamic(req, res))
          .catch(() => offlineFallback())
      )
    );
    return;
  }

  // Stale-while-revalidate for pages and assets
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          // Clonar para cache
          const resClone = res.clone();
          putInDynamic(req, resClone);
          return res;
        })
        .catch(() => (cached ? cached : offlineFallback()));
      return cached ? Promise.race([cached, networkFetch]) : networkFetch;
    })
  );
});

function putInDynamic(req, res) {
  // Não cachear respostas inválidas
  if (!res || res.status !== 200 || res.type !== "basic") return Promise.resolve();
  return caches.open(CACHE_DYNAMIC).then((cache) => cache.put(req, res));
}

function offlineFallback() {
  return new Response(
    "<h2>Offline</h2><p>Sem ligação. Tenta novamente mais tarde.</p>",
    { headers: { "Content-Type": "text/html" } }
  );
}
