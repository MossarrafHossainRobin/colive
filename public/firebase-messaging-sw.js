importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

const configParams = new URL(self.location.href).searchParams;

firebase.initializeApp({
  apiKey: configParams.get('apiKey'),
  authDomain: configParams.get('authDomain'),
  projectId: configParams.get('projectId'),
  storageBucket: configParams.get('storageBucket'),
  messagingSenderId: configParams.get('messagingSenderId'),
  appId: configParams.get('appId'),
});

const messaging = firebase.messaging();

// Track shown notifications to prevent duplicates
const shownNotifications = new Set();
const DUPLICATE_WINDOW = 10000; // 10 seconds

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', payload);
  
  const data = payload.data || {};
  const notification = payload.notification || {};
  
  const title = data.title || notification.title || 'NestHub';
  const body = data.body || notification.body || 'You have a new update';
  const url = data.url || '/dashboard';
  const timestamp = data.timestamp || Date.now().toString();
  const conversationId = data.conversationId || '';
  const icon = data.icon || '/icon-192x192.png';
  
  // Create unique key to prevent duplicates
  const uniqueKey = `${title}-${body}-${timestamp}`;
  
  // Check if this notification was already shown
  if (shownNotifications.has(uniqueKey)) {
    console.log('[SW] ⚠️ Duplicate notification blocked:', uniqueKey.substring(0, 50));
    return;
  }
  
  // Mark as shown
  shownNotifications.add(uniqueKey);
  
  // Clean up old entries
  setTimeout(() => {
    shownNotifications.delete(uniqueKey);
  }, DUPLICATE_WINDOW);

  // Show notification ONCE
  const options = {
    body: body,
    icon: icon,
    badge: '/icon-192x192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: `nesthub-${data.type || 'general'}-${timestamp}`,
    renotify: true,
    requireInteraction: false,
    timestamp: Number(timestamp),
    data: { url: url, conversationId: conversationId },
  };

  self.registration.showNotification(title, options);
  console.log('[SW] ✅ Notification shown:', title);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();
  
  const url = event.notification.data?.url || '/dashboard';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('navigate' in client) {
          return client.navigate(url).then(() => client.focus());
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
