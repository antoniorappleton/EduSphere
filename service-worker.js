// service-worker.js

const CACHE_STATIC = "edusphere-static-v3";
const CACHE_DYNAMIC = "edusphere-dynamic-v3";

const ASSETS = [
  "./", // raiz do projeto
  "./index.html",
  "./login.html",
  "./aluno.html",
  "./explicador.html",
  "./styles.css",
  "./manifest.json",

  // ícones PWA
  "./public/img/icon-192.png",
  "./public/img/icon-512.png",

  // logo usado dentro da app
  "./public/img/imagens/logo-icon.svg",

  // JS principal
  "./public/js/supabaseClient.js",
  "./public/js/router.js",
];


// INSTALL – pré-cache estático
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ACTIVATE – limpar caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_STATIC && key !== CACHE_DYNAMIC)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// FETCH – cache-first com fallback à rede e cache dinâmica
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Apenas GET
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cacheRes) => {
      if (cacheRes) return cacheRes;

      return fetch(req)
        .then((networkRes) => {
          // cache dinâmica só para respostas “boas”
          if (
            networkRes &&
            networkRes.status === 200 &&
            networkRes.type === "basic"
          ) {
            const resClone = networkRes.clone();
            caches.open(CACHE_DYNAMIC).then((cache) => {
              cache.put(req, resClone);
            });
          }
          return networkRes;
        })
        .catch(() => {
          // fallback simples para pedidos de páginas HTML
          if (req.headers.get("accept")?.includes("text/html")) {
            return new Response(
              "<h2>Offline</h2><p>Sem ligação. Tenta novamente mais tarde.</p>",
              { headers: { "Content-Type": "text/html" } }
            );
          }
        });
    })
  );
});
