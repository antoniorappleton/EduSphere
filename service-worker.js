// service-worker.js

const CACHE_NAME = "edusphere-v10"; // Incrementar para forçar atualização
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./aluno.html",
  "./explicador.html",
  "./styles.css",
  "./css/nav.css",
  "./manifest.json",
  "./public/js/db.js",
  "./public/js/sync-engine.js",
  "./public/js/supabaseClient.js",
  "./public/js/explicador-service.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js",
  "https://unpkg.com/dexie@latest/dist/dexie.js",
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0",
  "./public/img/imagens/logo-icon192.png",
  "./public/img/imagens/logo-icon512.png"
];

// INSTALL: Pre-cache assets estáticos
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ACTIVATE: Limpar caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// FETCH: Stale-While-Revalidate para assets, Network-Only para API
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Ignorar pedidos que não sejam HTTP/HTTPS (ex: chrome-extension), 
  // pedidos não-GET e pedidos à API (Supabase).
  if (
    !url.protocol.startsWith("http") ||
    event.request.method !== "GET" ||
    url.host.includes("supabase.co")
  ) {
    return;
  }

  // 2. Estratégia Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // Fallback if network fails and no cache
          return cachedResponse || new Response("Offline", { status: 503 });
        });
        return cachedResponse || fetchPromise;
      });
    })
  );
});

// SYNC: Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-outbox') {
    event.waitUntil(triggerSyncInClients());
  }
});

async function triggerSyncInClients() {
  const allClients = await clients.matchAll({ type: 'window' });
  for (const client of allClients) {
    client.postMessage({ type: 'SYNC_NOW' });
  }
}
