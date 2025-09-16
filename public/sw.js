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
  // Skip caching for Socket.io requests and other real-time connections
  if (event.request.url.includes('/socket.io/') || 
      event.request.url.includes('/api/') ||
      event.request.method !== 'GET') {
    return;
  }

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
