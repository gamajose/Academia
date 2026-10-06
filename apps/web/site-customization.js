(function () {
  const host = window.location.hostname || 'localhost';
  const API = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
  const token = localStorage.getItem('academiaToken') || '';

  const statusEl = document.getElementById('customization-status');
  const btnTop = document.getElementById('btn-save-top');
  const btnBottom = document.getElementById('btn-save-bottom');

  const fields = {
    home_hero_image: {
      input: document.getElementById('inp-home-hero'),
      preview: document.getElementById('preview-home-hero'),
      file: document.getElementById('file-home-hero')
    },
    home_structure_image: {
      input: document.getElementById('inp-home-structure'),
      preview: document.getElementById('preview-home-structure'),
      file: document.getElementById('file-home-structure')
    },
    home_coaching_image: {
      input: document.getElementById('inp-home-coaching'),
      preview: document.getElementById('preview-home-coaching'),
      file: document.getElementById('file-home-coaching')
    },
    plans_hero_image: {
      input: document.getElementById('inp-plans-hero'),
      preview: document.getElementById('preview-plans-hero'),
      file: document.getElementById('file-plans-hero')
    },
    button_color: {
      picker: document.getElementById('picker-button-color'),
      input: document.getElementById('inp-button-color'),
      preview: document.getElementById('preview-button-cta')
    },
    instagram_url: {
      input: document.getElementById('inp-instagram-url')
    },
    google_client_id: {
      input: document.getElementById('inp-google-client-id')
    },
    home_hero_title: { input: document.getElementById('inp-home-hero-title') },
    home_hero_subtitle: { input: document.getElementById('inp-home-hero-subtitle') },
    home_structure_title: { input: document.getElementById('inp-home-structure-title') },
    home_structure_desc: { input: document.getElementById('inp-home-structure-desc') },
    home_coaching_title: { input: document.getElementById('inp-home-coaching-title') },
    home_coaching_desc: { input: document.getElementById('inp-home-coaching-desc') },
    plans_hero_title: { input: document.getElementById('inp-plans-hero-title') },
    plans_hero_subtitle: { input: document.getElementById('inp-plans-hero-subtitle') }
  };

  function setStatus(msg, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#ef4444' : '#1478d4';
  }

  function updateColor(color) {
    if (!color) return;
    if (fields.button_color.picker) fields.button_color.picker.value = color;
    if (fields.button_color.input) fields.button_color.input.value = color;
    if (fields.button_color.preview) fields.button_color.preview.style.backgroundColor = color;
  }

  // Bind color picker
  fields.button_color.picker?.addEventListener('input', (e) => {
    updateColor(e.target.value);
  });
  fields.button_color.input?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      updateColor(val);
    }
  });

  // Bind image upload & preview events
  ['home_hero_image', 'home_structure_image', 'home_coaching_image', 'plans_hero_image'].forEach((key) => {
    const item = fields[key];
    if (!item) return;

    item.input?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val && item.preview) item.preview.src = val;
    });

    const triggerBtn = document.querySelector(`[data-target="${item.file?.id}"]`);
    triggerBtn?.addEventListener('click', () => item.file?.click());

    item.file?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        if (item.preview) item.preview.src = evt.target.result;
      };
      reader.readAsDataURL(file);

      setStatus('Enviando imagem...');
      try {
        const formData = new FormData();
        formData.append('file', file, file.name);

        const uploadRes = await fetch(`${API}/api/editor/images`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) throw new Error(uploadData.error || 'Erro no envio da imagem');

        if (uploadData.location) {
          if (item.input) item.input.value = uploadData.location;
          if (item.preview) item.preview.src = uploadData.location;
          setStatus('Imagem enviada! Não se esqueça de salvar as alterações.');
        }
      } catch (err) {
        setStatus(`Erro no envio: ${err.message}`, true);
      }
    });
  });

  // Tab Switching Logic
  const tabs = [
    { key: 'hero', btnId: 'tab-btn-hero', panelId: 'panel-hero' },
    { key: 'structure', btnId: 'tab-btn-structure', panelId: 'panel-structure' },
    { key: 'coaching', btnId: 'tab-btn-coaching', panelId: 'panel-coaching' },
    { key: 'plans', btnId: 'tab-btn-plans', panelId: 'panel-plans' },
    { key: 'style', btnId: 'tab-btn-style', panelId: 'panel-style' }
  ];

  function switchTab(key) {
    tabs.forEach((tab) => {
      const btn = document.getElementById(tab.btnId);
      const panel = document.getElementById(tab.panelId);
      const isActive = tab.key === key;
      if (btn) {
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
      }
      if (panel) {
        panel.classList.toggle('hidden', !isActive);
      }
    });
  }

  tabs.forEach((tab) => {
    document.getElementById(tab.btnId)?.addEventListener('click', () => switchTab(tab.key));
  });

  function handleInitialHash() {
    const hash = window.location.hash.toLowerCase().replace('#', '');
    const map = {
      hero: 'hero',
      principal: 'hero',
      estrutura: 'structure',
      structure: 'structure',
      acompanhamento: 'coaching',
      coaching: 'coaching',
      planos: 'plans',
      plans: 'plans',
      estetica: 'style',
      integracoes: 'style',
      style: 'style'
    };
    if (map[hash]) {
      switchTab(map[hash]);
    }
  }

  async function loadSettings() {
    try {
      const res = await fetch(`${API}/api/gym/site-settings`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      });
      if (!res.ok) return;
      const data = await res.json();
      const s = data.site_settings || {};

      if (s.home_hero_image && fields.home_hero_image.input) {
        fields.home_hero_image.input.value = s.home_hero_image;
        fields.home_hero_image.preview.src = s.home_hero_image;
      }
      if (s.home_structure_image && fields.home_structure_image.input) {
        fields.home_structure_image.input.value = s.home_structure_image;
        fields.home_structure_image.preview.src = s.home_structure_image;
      }
      if (s.home_coaching_image && fields.home_coaching_image.input) {
        fields.home_coaching_image.input.value = s.home_coaching_image;
        fields.home_coaching_image.preview.src = s.home_coaching_image;
      }
      if (s.plans_hero_image && fields.plans_hero_image.input) {
        fields.plans_hero_image.input.value = s.plans_hero_image;
        fields.plans_hero_image.preview.src = s.plans_hero_image;
      }
      if (s.button_color) {
        updateColor(s.button_color);
      } else {
        updateColor('#1478d4');
      }
      if (s.instagram_url && fields.instagram_url.input) {
        fields.instagram_url.input.value = s.instagram_url;
      }
      if (s.google_client_id && fields.google_client_id.input) {
        fields.google_client_id.input.value = s.google_client_id;
      }
      [
        'home_hero_title', 'home_hero_subtitle',
        'home_structure_title', 'home_structure_desc',
        'home_coaching_title', 'home_coaching_desc',
        'plans_hero_title', 'plans_hero_subtitle'
      ].forEach((k) => {
        if (s[k] && fields[k]?.input) {
          fields[k].input.value = s[k];
        }
      });
    } catch (_) {}
  }

  async function saveSettings() {
    [btnTop, btnBottom].forEach((btn) => {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Salvando...';
      }
    });
    setStatus('Salvando alterações...');

    const payload = {
      site_settings: {
        home_hero_image: fields.home_hero_image.input?.value.trim() || undefined,
        home_structure_image: fields.home_structure_image.input?.value.trim() || undefined,
        home_coaching_image: fields.home_coaching_image.input?.value.trim() || undefined,
        plans_hero_image: fields.plans_hero_image.input?.value.trim() || undefined,
        button_color: fields.button_color.input?.value.trim() || undefined,
        instagram_url: fields.instagram_url.input?.value.trim() || undefined,
        google_client_id: fields.google_client_id.input?.value.trim() || undefined,
        home_hero_title: fields.home_hero_title.input?.value.trim() || undefined,
        home_hero_subtitle: fields.home_hero_subtitle.input?.value.trim() || undefined,
        home_structure_title: fields.home_structure_title.input?.value.trim() || undefined,
        home_structure_desc: fields.home_structure_desc.input?.value.trim() || undefined,
        home_coaching_title: fields.home_coaching_title.input?.value.trim() || undefined,
        home_coaching_desc: fields.home_coaching_desc.input?.value.trim() || undefined,
        plans_hero_title: fields.plans_hero_title.input?.value.trim() || undefined,
        plans_hero_subtitle: fields.plans_hero_subtitle.input?.value.trim() || undefined
      }
    };

    try {
      const res = await fetch(`${API}/api/gym/site-settings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');

      setStatus('Alterações salvas com sucesso!');
      setTimeout(() => setStatus(''), 4000);
    } catch (err) {
      setStatus(`Erro: ${err.message}`, true);
    } finally {
      [btnTop, btnBottom].forEach((btn) => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Salvar alterações';
        }
      });
    }
  }

  btnTop?.addEventListener('click', saveSettings);
  btnBottom?.addEventListener('click', saveSettings);
  document.getElementById('customization-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettings();
  });

  handleInitialHash();
  loadSettings();
})();
