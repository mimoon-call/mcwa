// sw.js

// Install event
self.addEventListener('install', () => {
  console.log('Service Worker installing.');
});

// Activate event
self.addEventListener('activate', () => {
  console.log('Service Worker activated.');
});

self.addEventListener('fetch', function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      // Cache hit - return response
      if (response) {
        return response;
      }

      // Return fetch with proper error handling
      return fetch(event.request).catch(function(error) {
        console.log('Fetch failed for:', event.request.url, error);
        // Return a fallback response or let the error propagate
        throw error;
      });
    })
  );
});
