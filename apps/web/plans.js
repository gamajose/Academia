(() => {
  const params = new URLSearchParams(window.location.search);
  const defaultHost = window.location.hostname || 'localhost';
  const apiBase = (params.get('api') || localStorage.getItem('apiBaseUrl') || `http://${defaultHost}:3004`).replace(/\/$/, '');
  const gymSlug = params.get('gym') || '';
  const catalogUrl = `${apiBase}/api/public/catalog${gymSlug ? `?gym_slug=${encodeURIComponent(gymSlug)}` : ''}`;

  const samplePlans = [
    { id: 'sample-essential', name: 'Essencial', price_cents: 8990, duration_days: 30, description: 'Para começar com uma rotina simples e consistente.', services_included: ['Musculação', 'Treino organizado', 'Acompanhamento da equipe'] },
    { id: 'sample-performance', name: 'Performance', price_cents: 12990, duration_days: 30, description: 'Mais acompanhamento para acelerar sua evolução.', services_included: ['Musculação', 'Avaliação periódica', 'Revisão de treino'], is_featured: true },
    { id: 'sample-premium', name: 'Premium', price_cents: 17990, duration_days: 30, description: 'Experiência completa para quem busca acompanhamento contínuo.', services_included: ['Todos os benefícios', 'Aulas incluídas', 'Atendimento prioritário'] }
  ];

  const sampleClasses = [
    { name: 'Funcional', level: 'Todos os níveis', duration_minutes: 50, capacity: 16, room: 'Sala de aulas', description: 'Treino dinâmico para força, resistência e condicionamento.' },
    { name: 'Mobilidade', level: 'Livre', duration_minutes: 40, capacity: 14, room: 'Espaço funcional', description: 'Movimento, alongamento e melhora da amplitude.' },
    { name: 'Treino orientado', level: 'Personalizado', duration_minutes: 60, capacity: 8, room: 'Musculação', description: 'Acompanhamento próximo para executar melhor o treino.' }
  ];

  const money = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));

  function planCard(plan, index) {
    const services = Array.isArray(plan.services_included) && plan.services_included.length
      ? plan.services_included
      : ['Acesso à academia', 'Treino organizado', 'Acompanhamento da equipe'];
    const featured = plan.is_featured || index === 1;
    const realId = plan.id && !String(plan.id).startsWith('sample-');
    return `
      <article class="plan-card ${featured ? 'recommended' : ''}">
        <span class="plan-label">${featured ? 'Mais escolhido' : 'Plano mensal'}</span>
        <h3>${escapeHtml(plan.name)}</h3>
        <p>${escapeHtml(plan.description || 'Plano completo para sua rotina de treinos.')}</p>
        <div class="plan-price">${money(plan.price_cents)}</div>
        <ul>${services.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        <a class="cta ${featured ? '' : 'ghost'}" href="#matricula" data-plan="${realId ? escapeHtml(plan.id) : ''}">Escolher este plano</a>
      </article>`;
  }

  function classCard(item) {
    return `
      <article class="experience-card">
        <div class="experience-content">
          <span class="feature-number">${escapeHtml(item.level || 'Livre')}</span>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.description || 'Modalidade disponível para os alunos.')}</p>
          <small>${escapeHtml(item.duration_minutes || 50)} min · ${escapeHtml(item.room || 'Sala a definir')}</small>
        </div>
      </article>`;
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
    if (plans.length) {
      select.insertAdjacentHTML('beforeend', plans.map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.name)} — ${money(plan.price_cents)}</option>`).join(''));
    }
    document.querySelectorAll('[data-plan]').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.plan) select.value = button.dataset.plan;
    }));
  }

  async function loadCatalog() {
    renderCatalog({ plans: samplePlans, classes: sampleClasses });
    try {
      const response = await fetch(catalogUrl, { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os planos.');
      renderCatalog(data);
    } catch (_) {
      renderCatalog({ plans: samplePlans, classes: sampleClasses });
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
      const response = await fetch(`${apiBase}/api/public/leads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar seus dados.');
      message.className = 'notice ok';
      message.textContent = 'Recebemos seu interesse. A equipe entrará em contato para concluir sua matrícula.';
      form.reset();
    } catch (error) {
      message.className = 'notice error';
      message.textContent = error.message;
    }
  });

  loadCatalog();
})();
