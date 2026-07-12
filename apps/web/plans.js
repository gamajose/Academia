(() => {
  const params = new URLSearchParams(window.location.search);
  const apiBase = (params.get('api') || window.location.origin).replace(/\/$/, '');
  const gymSlug = params.get('gym') || '';
  const catalogUrl = `${apiBase}/api/public/catalog${gymSlug ? `?gym_slug=${encodeURIComponent(gymSlug)}` : ''}`;

  const money = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));

  function planCard(plan) {
    const services = Array.isArray(plan.services_included) ? plan.services_included : [];
    const rules = plan.access_rules && typeof plan.access_rules === 'object' ? plan.access_rules : {};
    return `
      <article class="card ${plan.is_featured ? 'featured' : ''}">
        ${plan.is_featured ? '<span class="tag">MAIS ESCOLHIDO</span>' : ''}
        <h3>${escapeHtml(plan.name)}</h3>
        <p class="muted">${escapeHtml(plan.description || 'Plano completo para sua rotina de treinos.')}</p>
        <div class="price">${money(plan.price_cents)}</div>
        <p>${escapeHtml(plan.billing_period || 'monthly')} · ${escapeHtml(plan.duration_days)} dias</p>
        <ul>
          ${services.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          ${rules.hours ? `<li>Horários: ${escapeHtml(rules.hours)}</li>` : ''}
          ${Array.isArray(rules.units) && rules.units.length ? `<li>Unidades: ${rules.units.map(escapeHtml).join(', ')}</li>` : ''}
          ${plan.trial_days ? `<li>${escapeHtml(plan.trial_days)} dias de teste</li>` : ''}
          ${plan.auto_renew ? '<li>Renovação automática disponível</li>' : ''}
        </ul>
        ${Number(plan.enrollment_fee_cents || 0) > 0 ? `<p class="muted">Taxa de matrícula: ${money(plan.enrollment_fee_cents)}</p>` : ''}
        <a class="button" href="#matricula" data-plan="${escapeHtml(plan.id)}">Escolher este plano</a>
      </article>`;
  }

  function classCard(item) {
    return `
      <article class="card">
        <span class="tag">${escapeHtml(item.level || 'Livre')}</span>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description || 'Modalidade disponível para os alunos.')}</p>
        <p class="muted">Duração: ${escapeHtml(item.duration_minutes)} min · Capacidade: ${escapeHtml(item.capacity)} · Sala: ${escapeHtml(item.room || 'A definir')}</p>
      </article>`;
  }

  async function loadCatalog() {
    const plansNode = document.getElementById('plans');
    const classesNode = document.getElementById('classes');
    const select = document.getElementById('plan-select');
    try {
      const response = await fetch(catalogUrl, { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os planos.');
      document.getElementById('gym-name').textContent = `${data.gym.name}: escolha seu plano`;
      plansNode.innerHTML = data.plans.length ? data.plans.map(planCard).join('') : '<div class="card">Nenhum plano disponível no momento.</div>';
      classesNode.innerHTML = data.classes.length ? data.classes.map(classCard).join('') : '<div class="card">A programação de aulas será publicada em breve.</div>';
      select.insertAdjacentHTML('beforeend', data.plans.map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.name)} — ${money(plan.price_cents)}</option>`).join(''));
      document.querySelectorAll('[data-plan]').forEach((button) => button.addEventListener('click', () => { select.value = button.dataset.plan || ''; }));
    } catch (error) {
      plansNode.innerHTML = `<div class="card">${escapeHtml(error.message)}</div>`;
      classesNode.innerHTML = '<div class="card">Não foi possível carregar as modalidades.</div>';
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
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
