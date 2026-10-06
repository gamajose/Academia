// Service Worker para BlueREC Academia
// Permite notificações externas nativas no celular, tela de bloqueio e smartwatch

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Abertura direta ao tocar na notificação externa do celular ou relógio inteligente
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './student-progress.html?action=new-measurement';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se houver aba aberta, foca e redireciona para a medição
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Se não houver janela aberta, abre direto na tela de medição
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Suporte a mensagens do Push API externo
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (_) {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'Medição mensal disponível 🏋️';
  const options = {
    body: payload.body || 'Sua medição mensal está disponível. Toque para registrar peso e medidas.',
    icon: payload.icon || './blue-rec-logo.png',
    badge: payload.badge || './blue-rec-logo.png',
    vibrate: [250, 100, 250, 100, 250],
    tag: payload.tag || 'monthly-measurement',
    renotify: true,
    data: {
      url: payload.url || './student-progress.html?action=new-measurement'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
