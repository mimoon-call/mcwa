// sw.js

// Install event
self.addEventListener('install', () => {
  console.log('Service Worker installing.');
});

// Activate event
self.addEventListener('activate', () => {
  console.log('Service Worker activated.');
});

self.addEventListener('install', () => {
  console.log('Service Worker installing.');
});

self.addEventListener('fetch', function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      // Cache hit - return response
      if (response) {
        return response;
      }

      return fetch(event.request);
    })
  );
});
