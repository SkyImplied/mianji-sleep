"use strict";

var CACHE_PREFIX = "mianji-sleep-shell-";
var CACHE_NAME = CACHE_PREFIX + "v12";
var APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=12",
  "./cloud-config.js?v=1",
  "./app.js?v=11",
  "./manifest.webmanifest?v=1",
  "./icons/apple-touch-icon.png?v=1",
  "./icons/icon-192.png?v=1",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.map(function (name) {
          if (name.indexOf(CACHE_PREFIX) === 0 && name !== CACHE_NAME) {
            return caches.delete(name);
          }
          return Promise.resolve(false);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var isAppEntry = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
          if (response.ok && isAppEntry) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put("./index.html", copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match("./index.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      });
    })
  );
});
