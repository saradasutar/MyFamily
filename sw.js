"use strict";

const CACHE_NAME = "myfamily-shell-v1059-family-tree";
const SHELL_ASSETS = [
  "./",
  "./styles.css?v=1.0.59",
  "./config.js?v=1.0.59",
  "./app.js?v=1.0.59",
  "./family-unity-v1058-32.png",
  "./family-unity-v1058-180.png",
  "./family-unity-v1058-192.png",
  "./family-unity-v1058-512.png",
  "./family-unity-v1058.webmanifest"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(SHELL_ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          if (key.indexOf("myfamily-shell-") === 0 && key !== CACHE_NAME) return caches.delete(key);
          return Promise.resolve(false);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(function () { return caches.match("./"); }));
    return;
  }

  if (["style", "script", "image", "manifest"].indexOf(request.destination) < 0) return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      const refreshed = fetch(request).then(function (response) {
        if (response && response.ok) {
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, response.clone()); });
        }
        return response;
      }).catch(function () { return cached; });

      return cached || refreshed;
    })
  );
});
