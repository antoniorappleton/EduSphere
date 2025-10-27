const CACHE = "edusphere-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./img/logo-icon.svg",
  "./img/logo-full.svg",
  "./js/supabaseClient.js",
  "./js/router.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
  );
});
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches
      .match(e.request)
      .then(
        (resp) =>
          resp ||
          fetch(e.request).catch(
            () =>
              new Response("<h1>Offline</h1>", {
                headers: { "Content-Type": "text/html" },
              })
          )
      )
  );
});
