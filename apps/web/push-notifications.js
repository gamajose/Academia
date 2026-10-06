// Gerenciador de Notificações Externas (Celular, Smartwatch e Navegador)
// BlueREC Academia - Integração PWA e Service Worker

(function () {
  const SW_PATH = './sw.js';

  let swRegistration = null;

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      swRegistration = await navigator.serviceWorker.register(SW_PATH, { scope: './' });
      return swRegistration;
    } catch (err) {
      console.warn('Falha ao registrar Service Worker:', err);
      return null;
    }
  }

  // Registra no carregamento
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    registerServiceWorker();
  } else {
    window.addEventListener('DOMContentLoaded', registerServiceWorker);
  }

  const PushNotificationManager = {
    isSupported() {
      return ('serviceWorker' in navigator) && ('Notification' in window);
    },

    getPermission() {
      if (!('Notification' in window)) return 'unsupported';
      return Notification.permission;
    },

    async requestPermission() {
      if (!this.isSupported()) return false;
      try {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      } catch (err) {
        console.warn('Erro ao solicitar permissão de notificações:', err);
        return false;
      }
    },

    async showNotification(title, options = {}) {
      if (!this.isSupported()) return false;
      if (Notification.permission !== 'granted') return false;

      const opts = {
        body: options.body || 'Sua medição mensal está disponível.',
        icon: options.icon || './blue-rec-logo.png',
        badge: options.badge || './blue-rec-logo.png',
        // Padrão de vibração para celular e smartwatch
        vibrate: options.vibrate || [250, 100, 250, 100, 250],
        tag: options.tag || 'bluerec-notification',
        renotify: true,
        data: {
          url: options.url || './student-progress.html?action=new-measurement',
          timestamp: Date.now()
        }
      };

      try {
        if ('serviceWorker' in navigator) {
          const reg = swRegistration || (await navigator.serviceWorker.ready);
          if (reg && reg.showNotification) {
            await reg.showNotification(title, opts);
            return true;
          }
        }
        // Fallback para Notification de topo se SW não responder
        new Notification(title, opts);
        return true;
      } catch (err) {
        console.warn('Erro ao disparar notificação externa:', err);
        return false;
      }
    },

    // Notificação periódica externa: dispara somente quando a medição mensal estiver devida
    // e NO MÁXIMO UMA VEZ por ciclo mensal (sem spam a cada acesso)
    async checkMonthlyMeasurement(assessments = []) {
      if (!this.isSupported() || Notification.permission !== 'granted') return;

      const latest = assessments[0];
      let isDue = false;

      if (!latest) {
        isDue = true;
      } else {
        const lastDate = new Date(`${String(latest.assessment_date).slice(0, 10)}T12:00:00`);
        const days = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
        if (days >= 30) {
          isDue = true;
        }
      }

      if (!isDue) return;

      // Trava de ciclo: no máximo 1 notificação por mês (ex: 2026-10)
      const now = new Date();
      const cycleKey = `bluerec_notified_cycle_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (localStorage.getItem(cycleKey)) {
        return; // Já foi notificado neste ciclo, não repete
      }

      const sent = await this.showNotification('Medição mensal disponível 🏋️', {
        body: 'Chegou o momento da sua medição corporal mensal. Toque para registrar suas medidas e fotos.',
        tag: 'monthly-measurement-reminder',
        url: './student-progress.html?action=new-measurement'
      });

      if (sent) {
        localStorage.setItem(cycleKey, 'true');
      }
    },

    // Permite que o usuário teste a notificação na hora para verificar no celular / smartwatch
    async sendTestNotification() {
      let permitted = this.getPermission() === 'granted';
      if (!permitted) {
        permitted = await this.requestPermission();
      }
      if (!permitted) {
        alert('As notificações estão bloqueadas ou foram negadas no seu navegador. Para testar, permita as notificações nas configurações do site.');
        return false;
      }

      return this.showNotification('Lembrete de medição (Teste) 🏋️', {
        body: 'Notificação funcionando no celular e relógio! Toque aqui para abrir a medição.',
        tag: `test-measurement-${Date.now()}`,
        url: './student-progress.html?action=new-measurement'
      });
    }
  };

  window.PushNotificationManager = PushNotificationManager;
})();
