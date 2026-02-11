const CACHE_NAME = "open-brick-shell-v20260211d";
const APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/styles.css",
  "./src/app.js?v=20260211a",
  "./src/scad-engine.mjs",
  "./src/share-query.mjs",
  "./src/logo.svg",
  "./src/logo-light.svg",
  "./src/logo-wordmark.svg",
  "./src/logo-wordmark-light.svg",
  "./src/github.svg",
  "./scad/classic_brick.scad",
  "./scad/classic_plate.scad",
  "./scad/classic_tile.scad",
  "./scad/mechanical_axle.scad",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL_ASSETS);
    })()
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith("open-brick-shell-v")) {
            return caches.delete(cacheName);
          }
          return Promise.resolve(false);
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (_error) {
          const fallback = await caches.match("./index.html", { ignoreSearch: true });
          if (fallback) {
            return fallback;
          }
          return new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) {
        return cached;
      }

      try {
        const response = await fetch(request);
        if (response.ok && (response.type === "basic" || response.type === "default")) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (_error) {
        const fallback = await caches.match("./index.html", { ignoreSearch: true });
        if (request.destination === "document" && fallback) {
          return fallback;
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })()
  );
});
