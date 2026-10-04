(function () {
  const host = window.location.hostname || 'localhost';
  const apiBase = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
  const token = localStorage.getItem('academiaToken') || '';

  // Elements
  const clockEl = document.getElementById('totem-clock');
  const dateEl = document.getElementById('totem-date');
  const inputEl = document.getElementById('totem-input');
  const idleView = document.getElementById('totem-idle-view');
  const successView = document.getElementById('totem-success-view');
  const deniedView = document.getElementById('totem-denied-view');
  const disabledView = document.getElementById('totem-disabled-view');
  const fullscreenBtn = document.getElementById('totem-fullscreen-btn');

  let resetTimer = null;
  let processing = false;

  // Sound Engine via Web Audio API
  function playBeep(freq1, freq2, duration = 0.25, isWarning = false) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = isWarning ? 'sawtooth' : 'sine';
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(freq1, now);
      if (freq2) osc.frequency.setValueAtTime(freq2, now + duration / 2);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.start(now);
      osc.stop(now + duration);
    } catch (_) {}
  }

  function playApprovedSound() {
    playBeep(659.25, 880, 0.35, false);
  }

  function playDeniedSound() {
    playBeep(260, 196, 0.45, true);
  }

  // Clock & Date updater
  function updateClock() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    }
  }

  setInterval(updateClock, 1000);
  updateClock();

  // Fullscreen support
  fullscreenBtn?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (fullscreenBtn) {
      fullscreenBtn.innerHTML = document.fullscreenElement
        ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg> <span>Janela</span>'
        : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg> <span>Tela cheia</span>';
    }
  });

  // State Switchers
  function showIdle() {
    clearTimeout(resetTimer);
    processing = false;
    successView.classList.add('hidden');
    deniedView.classList.add('hidden');
    idleView.classList.remove('hidden');
    if (inputEl) {
      inputEl.value = '';
      inputEl.focus();
    }
  }

  function showApproved(member) {
    clearTimeout(resetTimer);
    idleView.classList.add('hidden');
    deniedView.classList.add('hidden');
    successView.classList.remove('hidden');

    const nameEl = document.getElementById('totem-approved-name');
    const planEl = document.getElementById('totem-approved-plan');
    const avatarEl = document.getElementById('totem-approved-avatar');
    const progressFill = document.getElementById('totem-success-progress');

    if (nameEl) nameEl.textContent = member.name || 'Aluno(a)';
    if (planEl) planEl.textContent = member.plan_name ? `Plano ${member.plan_name}` : 'Acesso Liberado';

    if (avatarEl) {
      avatarEl.replaceChildren();
      if (member.photo_url) {
        const img = document.createElement('img');
        img.src = member.photo_url;
        img.alt = member.name;
        avatarEl.appendChild(img);
      } else {
        avatarEl.textContent = (member.name || 'A').trim().charAt(0).toUpperCase();
      }
    }

    if (progressFill) {
      progressFill.style.transition = 'none';
      progressFill.style.width = '100%';
      setTimeout(() => {
        progressFill.style.transition = 'width 3.5s linear';
        progressFill.style.width = '0%';
      }, 50);
    }

    playApprovedSound();
    resetTimer = setTimeout(showIdle, 3500);
  }

  function showDenied(reason, member) {
    clearTimeout(resetTimer);
    idleView.classList.add('hidden');
    successView.classList.add('hidden');
    deniedView.classList.remove('hidden');

    const nameEl = document.getElementById('totem-denied-name');
    const reasonEl = document.getElementById('totem-denied-reason');
    const progressFill = document.getElementById('totem-denied-progress');

    if (nameEl) nameEl.textContent = member?.name ? `Olá, ${member.name}` : 'Acesso não autorizado';
    if (reasonEl) reasonEl.textContent = reason || 'Matrícula vencida ou pendência financeira.';

    if (progressFill) {
      progressFill.style.transition = 'none';
      progressFill.style.width = '100%';
      setTimeout(() => {
        progressFill.style.transition = 'width 4s linear';
        progressFill.style.width = '0%';
      }, 50);
    }

    playDeniedSound();
    resetTimer = setTimeout(showIdle, 4000);
  }

  // Check-in Execution
  async function submitCheckin(queryValue) {
    const val = (queryValue || inputEl?.value || '').trim();
    if (!val || processing) return;

    processing = true;
    inputEl.disabled = true;

    try {
      const response = await fetch(`${apiBase}/api/checkins/quick`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: val,
          source: 'totem_kiosk'
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.checkin) {
        showApproved(data.member);
      } else if (response.status === 400 && data.error === 'aluno_inativo') {
        showDenied(data.message || 'Matrícula inativa. Procure a recepção.', data.member);
      } else if (response.status === 404) {
        showDenied('Cadastro não encontrado com esta identificação. Dirija-se à recepção.');
      } else {
        showDenied(data.message || data.error || 'Acesso não liberado. Procure a recepção.');
      }
    } catch (err) {
      showDenied('Falha de conexão com a catraca. Tente novamente ou chame a recepção.');
    } finally {
      if (inputEl) inputEl.disabled = false;
    }
  }

  // Keypad Actions
  document.querySelectorAll('.totem-key[data-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (key === 'clear') {
        if (inputEl) inputEl.value = '';
      } else if (key === 'confirm') {
        submitCheckin();
      } else {
        if (inputEl && inputEl.value.length < 14) {
          inputEl.value += key;
        }
      }
      inputEl?.focus();
    });
  });

  // Keep scanner and keyboard input focused
  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCheckin();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('button, a, input')) {
      inputEl?.focus();
    }
  });

  // Load Branding
  async function loadGymBranding() {
    const savedLogo = localStorage.getItem('gymLogoUrl');
    const savedName = localStorage.getItem('gymName');
    const logoImg = document.getElementById('totem-logo');
    const gymNameEl = document.getElementById('totem-gym-name');

    if (savedLogo && logoImg) logoImg.src = savedLogo;
    if (savedName && gymNameEl) gymNameEl.textContent = savedName;

    try {
      const res = await fetch(`${apiBase}/api/gym/profile`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const gym = await res.json();
        if (gym.logo_url && logoImg) logoImg.src = gym.logo_url;
        if (gym.name && gymNameEl) gymNameEl.textContent = gym.name;
      }
    } catch (_) {}
  }

  // Module check
  async function checkModule() {
    if (window.AcademiaModules) {
      const modules = await window.AcademiaModules.load(token);
      if (modules.totem === false) {
        idleView?.classList.add('hidden');
        successView?.classList.add('hidden');
        deniedView?.classList.add('hidden');
        disabledView?.classList.remove('hidden');
        return false;
      }
    }
    return true;
  }

  // Initialization
  async function init() {
    loadGymBranding();
    const enabled = await checkModule();
    if (enabled) {
      showIdle();
    }
  }

  init();
})();
