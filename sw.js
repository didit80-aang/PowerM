// =============================================
// SERVICE WORKER - Sistem Monitoring Daya v5.2
// =============================================

const CACHE_NAME = 'powermon-v5.2';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// =============================================
// INSTALL EVENT
// =============================================
self.addEventListener('install', event => {
  console.log('[SW] 🔧 Installing Service Worker v5.2...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 📦 Caching app shell...');
        return cache.addAll(urlsToCache).catch(error => {
          console.warn('[SW] ⚠️ Beberapa file gagal di-cache:', error);
          // Lanjutkan meskipun beberapa file gagal
          return Promise.resolve();
        });
      })
      .then(() => {
        console.log('[SW] ✅ Install selesai, skip waiting...');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] ❌ Install gagal:', error);
      })
  );
});

// =============================================
// ACTIVATE EVENT
// =============================================
self.addEventListener('activate', event => {
  console.log('[SW] 🚀 Activating Service Worker...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] 🗑️ Menghapus cache lama:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => {
      console.log('[SW] ✅ Activation selesai');
      return self.clients.claim();
    })
  );
});

// =============================================
// FETCH EVENT - Network First Strategy
// =============================================
self.addEventListener('fetch', event => {
  // Hanya handle GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip untuk URL eksternal (CDN, MQTT broker, dll)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    // Untuk CDN, coba cache tapi jangan block
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }
  
  // Network first strategy untuk file lokal
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache response yang sukses
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone).catch(err => {
              console.warn('[SW] ⚠️ Gagal cache:', err);
            });
          });
        }
        return response;
      })
      .catch(() => {
        // Offline fallback: ambil dari cache
        console.log('[SW] 📡 Offline, menggunakan cache untuk:', event.request.url);
        return caches.match(event.request).then(response => {
          if (response) {
            return response;
          }
          
          // Jika tidak ada di cache, return halaman offline
          if (event.request.mode === 'navigate') {
            return new Response(
              '<html><body style="text-align:center;padding:50px;font-family:sans-serif;">' +
              '<h1>📡 Offline</h1>' +
              '<p>Tidak ada koneksi internet dan halaman tidak tersedia di cache.</p>' +
              '<button onclick="location.reload()">🔄 Coba Lagi</button>' +
              '</body></html>',
              {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'text/html' }
              }
            );
          }
          
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// =============================================
// MESSAGE EVENT - Handle messages from main thread
// =============================================
self.addEventListener('message', event => {
  console.log('[SW] 📨 Pesan diterima:', event.data);
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] 🗑️ Membersihkan semua cache...');
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cache => {
            console.log('[SW] Menghapus:', cache);
            return caches.delete(cache);
          })
        );
      })
      .then(() => {
        console.log('[SW] ✅ Semua cache dibersihkan');
        // Kirim response ke client
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ result: 'Cache cleared' });
        }
      })
    );
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] ⏩ Skip waiting, aktivasi segera...');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CHECK_STATUS') {
    console.log('[SW] ✅ Status check: Active');
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ 
        status: 'active',
        cacheName: CACHE_NAME,
        timestamp: Date.now()
      });
    }
  }
});

// =============================================
// PERIODIC SYNC (untuk data monitoring)
// =============================================
self.addEventListener('periodicsync', event => {
  if (event.tag === 'sync-monitoring') {
    console.log('[SW] 🔄 Periodic sync triggered');
    event.waitUntil(
      // Notifikasi client untuk sync data
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'PERIODIC_SYNC' });
        });
      })
    );
  }
});

// =============================================
// PUSH NOTIFICATION (untuk notifikasi fault)
// =============================================
self.addEventListener('push', event => {
  console.log('[SW] 📬 Push notification diterima');
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { 
        title: 'Power Monitor', 
        body: event.data.text() 
      };
    }
  }
  
  const options = {
    body: data.body || 'Ada pembaruan dari sistem monitoring',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'default',
    data: data,
    actions: [
      {
        action: 'open',
        title: '🔍 Buka Dashboard'
      },
      {
        action: 'close',
        title: '❌ Tutup'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || '⚡ Sistem Monitoring Daya',
      options
    )
  );
});

// =============================================
// NOTIFICATION CLICK
// =============================================
self.addEventListener('notificationclick', event => {
  console.log('[SW] 📱 Notification diklik');
  event.notification.close();
  
  if (event.action === 'close') return;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      // Jika dashboard sudah terbuka, fokus ke tab tersebut
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          return client.focus();
        }
      }
      // Jika belum, buka tab baru
      if (self.clients.openWindow) {
        return self.clients.openWindow('./');
      }
    })
  );
});

// =============================================
// LOGGING
// =============================================
console.log('[SW] ⚡ Service Worker v5.2 loaded');
console.log('[SW] 📦 Cache:', CACHE_NAME);
console.log('[SW] 🌐 Scope:', self.registration.scope);