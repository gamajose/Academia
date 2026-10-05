(() => {
  const params = new URLSearchParams(window.location.search);
  const defaultHost = window.location.hostname || 'localhost';
  const apiBase = (params.get('api') || localStorage.getItem('apiBaseUrl') || `http://${defaultHost}:3004`).replace(/\/$/, '');
  const gymSlug = params.get('gym') || '';
  const catalogUrl = `${apiBase}/api/public/catalog${gymSlug ? `?gym_slug=${encodeURIComponent(gymSlug)}` : ''}`;

  const samplePlans = [
    { id: 'sample-essential', name: 'Essencial', price_cents: 8990, description: '<p>Para começar com uma rotina simples e consistente.</p>', benefits: '<ul><li>Musculação</li><li>Treino organizado</li><li>Acompanhamento da equipe</li></ul>' },
    { id: 'sample-performance', name: 'Performance', price_cents: 12990, description: '<p>Mais acompanhamento para acelerar sua evolução.</p>', benefits: '<ul><li>Musculação</li><li>Avaliação periódica</li><li>Revisão de treino</li></ul>', is_featured: true },
    { id: 'sample-premium', name: 'Premium', price_cents: 17990, description: '<p>Experiência completa para quem busca acompanhamento contínuo.</p>', benefits: '<ul><li>Todos os benefícios</li><li>Aulas incluídas</li><li>Atendimento prioritário</li></ul>' }
  ];

  const sampleClasses = [
    { name: 'Funcional', level: 'Todos os níveis', duration_minutes: 50, room: 'Sala de aulas', description: 'Treino dinâmico para força, resistência e condicionamento.' },
    { name: 'Mobilidade', level: 'Livre', duration_minutes: 40, room: 'Espaço funcional', description: 'Movimento, alongamento e melhora da amplitude.' },
    { name: 'Treino orientado', level: 'Personalizado', duration_minutes: 60, room: 'Musculação', description: 'Acompanhamento próximo para executar melhor o treino.' }
  ];

  const money = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));

  function safeUrl(raw, image = false) {
    try {
      const url = new URL(String(raw || ''), window.location.href);
      const protocols = image ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:'];
      return protocols.includes(url.protocol) ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function sanitizeRichHtml(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    const allowedTags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'A', 'IMG', 'SPAN', 'DIV', 'FONT']);

    function clean(parent) {
      for (const child of [...parent.childNodes]) {
        if (child.nodeType === Node.COMMENT_NODE) {
          child.remove();
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        if (!allowedTags.has(child.tagName)) {
          child.replaceWith(document.createTextNode(child.textContent || ''));
          continue;
        }

        const href = child.getAttribute('href');
        const src = child.getAttribute('src');
        const color = child.getAttribute('color');
        const size = child.getAttribute('size');
        for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);

        if (child.tagName === 'A') {
          const url = safeUrl(href);
          if (url) {
            child.setAttribute('href', url);
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }
        }
        if (child.tagName === 'IMG') {
          const url = safeUrl(src, true);
          if (!url) {
            child.remove();
            continue;
          }
          child.setAttribute('src', url);
          child.setAttribute('alt', 'Imagem do plano');
          child.setAttribute('loading', 'lazy');
        }
        if (child.tagName === 'FONT') {
          if (/^#[0-9a-f]{3,8}$/i.test(color || '')) child.style.color = color;
          if (/^[1-7]$/.test(size || '')) {
            child.style.fontSize = ({ 1: '.78rem', 2: '.9rem', 3: '1rem', 4: '1.15rem', 5: '1.3rem', 6: '1.55rem', 7: '1.8rem' })[size];
          }
        }
        clean(child);
      }
    }

    clean(template.content);
    return template.innerHTML;
  }

  function planCard(plan, index) {
    const featured = plan.is_featured || index === 1;
    const realId = plan.id && !String(plan.id).startsWith('sample-');
    const serviceContent = Array.isArray(plan.services_included) && plan.services_included.length
      ? `<ul>${plan.services_included.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : sanitizeRichHtml(plan.benefits || '<ul><li>Acesso à academia</li><li>Treino organizado</li><li>Acompanhamento da equipe</li></ul>');
    return `
      <article class="plan-card ${featured ? 'recommended' : ''}">
        <span class="plan-label">${featured ? 'Mais escolhido' : 'Plano mensal'}</span>
        <h3>${escapeHtml(plan.name)}</h3>
        <div class="plan-rich plan-description">${sanitizeRichHtml(plan.description || '<p>Plano completo para sua rotina de treinos.</p>')}</div>
        <div class="plan-price">${money(plan.price_cents)}</div>
        <div class="plan-rich plan-benefits">${serviceContent}</div>
        ${plan.rules ? `<details class="plan-rules"><summary>Regras do plano</summary><div class="plan-rich">${sanitizeRichHtml(plan.rules)}</div></details>` : ''}
        <a class="cta ${featured ? '' : 'ghost'}" href="./matricula-publica.html${realId ? `?plan=${encodeURIComponent(plan.id)}` : ''}">Escolher este plano</a>
      </article>`;
  }

  function classCard(item) {
    return `<article class="experience-card"><div class="experience-content"><span class="feature-number">${escapeHtml(item.level || 'Livre')}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description || 'Modalidade disponível para os alunos.')}</p><small>${escapeHtml(item.duration_minutes || 50)} min · ${escapeHtml(item.room || 'Sala a definir')}</small></div></article>`;
  }

  function renderCatalog(data) {
    const plansNode = document.getElementById('plans');
    const classesNode = document.getElementById('classes');
    const select = document.getElementById('plan-select');
    const plans = (data?.plans || []).filter((plan) => Number(plan.price_cents || 0) > 0);
    const visiblePlans = plans.length ? plans : samplePlans;
    const classes = data?.classes?.length ? data.classes : sampleClasses;
    if (data?.gym?.name) document.getElementById('gym-name').textContent = `${data.gym.name}: escolha seu plano`;
    plansNode.innerHTML = visiblePlans.map(planCard).join('');
    classesNode.innerHTML = classes.map(classCard).join('');
    select.querySelectorAll('option:not(:first-child)').forEach((option) => option.remove());
    if (plans.length) select.insertAdjacentHTML('beforeend', plans.map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.name)} — ${money(plan.price_cents)}</option>`).join(''));
  }

  function applySettings(settings) {
    if (!settings || typeof settings !== 'object') return;
    if (settings.button_color) {
      document.documentElement.style.setProperty('--wolf', settings.button_color);
    }
    if (settings.instagram_url) {
      document.querySelectorAll('.nav-instagram, #header-instagram-link, a[href*="instagram.com"]').forEach((el) => {
        el.href = settings.instagram_url;
      });
    }
    if (settings.plans_hero_image) {
      const heroEl = document.querySelector('.public-plans-hero');
      if (heroEl) {
        heroEl.style.backgroundImage = `linear-gradient(135deg, rgba(61, 17, 17, 0.8), rgba(13, 92, 167, 0.9)), url('${settings.plans_hero_image}')`;
        heroEl.style.backgroundSize = 'cover';
        heroEl.style.backgroundPosition = 'center';
      }
    }
    if (settings.plans_hero_title) {
      const titleEl = document.querySelector('.public-plans-hero h1, #gym-name');
      if (titleEl) titleEl.textContent = settings.plans_hero_title;
    }
    if (settings.plans_hero_subtitle) {
      const subEl = document.querySelector('.public-plans-hero p:not(.eyebrow-light)');
      if (subEl) subEl.textContent = settings.plans_hero_subtitle;
    }
  }

  async function loadCatalog() {
    renderCatalog({ plans: samplePlans, classes: sampleClasses });
    try {
      const response = await fetch(catalogUrl, { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os planos.');
      renderCatalog(data);
      if (data.gym?.site_settings) {
        applySettings(data.gym.site_settings);
      } else {
        fetch(`${apiBase}/api/public/site-config`).then((r) => r.json()).then((d) => applySettings(d?.gym?.site_settings)).catch(() => {});
      }
    } catch (_) {
      renderCatalog({ plans: samplePlans, classes: sampleClasses });
      fetch(`${apiBase}/api/public/site-config`).then((r) => r.json()).then((d) => applySettings(d?.gym?.site_settings)).catch(() => {});
    }
  }

  document.getElementById('lead-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.getElementById('lead-message');
    const values = Object.fromEntries(new FormData(form).entries());
    if (gymSlug) values.gym_slug = gymSlug;
    message.className = 'notice';
    message.textContent = 'Enviando...';
    message.style.display = 'block';
    try {
      const response = await fetch(`${apiBase}/api/public/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar seus dados.');
      message.className = 'notice ok';
      message.textContent = 'Escolha seu plano para abrir o pagamento online e concluir sua matrícula.';
      form.reset();
    } catch (error) {
      message.className = 'notice error';
      message.textContent = error.message;
    }
  });

  loadCatalog();
})();
