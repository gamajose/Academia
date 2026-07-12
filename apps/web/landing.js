const host = window.location.hostname || 'localhost';
const API = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
const box = document.getElementById('landing-plans');

const samplePlans = [
  { id: 'sample-essential', name: 'Essencial', price_cents: 8990, duration_days: 30, description: 'Para quem quer começar com uma rotina simples e consistente.', benefits: ['Musculação', 'Treino organizado', 'Acompanhamento da equipe'] },
  { id: 'sample-performance', name: 'Performance', price_cents: 12990, duration_days: 30, description: 'Mais acompanhamento para acelerar a evolução.', benefits: ['Musculação', 'Avaliação periódica', 'Treino com revisões'], recommended: true },
  { id: 'sample-premium', name: 'Premium', price_cents: 17990, duration_days: 30, description: 'Experiência completa para quem busca acompanhamento contínuo.', benefits: ['Todos os benefícios', 'Aulas incluídas', 'Acompanhamento prioritário'] }
];

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

function benefitItems(plan) {
  if (Array.isArray(plan.benefits)) return plan.benefits;
  const raw = String(plan.benefits || '');
  const plain = raw.replace(/<[^>]+>/g, '\n');
  const parsed = plain.split(/\n|;/).map((item) => item.trim()).filter(Boolean);
  return parsed.length ? parsed.slice(0, 4) : ['Acesso à academia', 'Treino organizado', 'Acompanhamento da equipe'];
}

function renderPlans(plans) {
  const valid = plans.filter((plan) => Number(plan.price_cents || 0) > 0);
  const source = valid.length ? valid.slice(0, 3) : samplePlans;
  box.innerHTML = source.map((plan, index) => {
    const benefits = benefitItems(plan);
    const recommended = plan.recommended || index === 1;
    const href = plan.id && !String(plan.id).startsWith('sample-')
      ? `./matricula-publica.html?plan=${encodeURIComponent(plan.id)}`
      : './plans.html';
    return `
      <article class="plan-card ${recommended ? 'recommended' : ''}">
        ${recommended ? '<span class="plan-label">Mais escolhido</span>' : '<span class="plan-label">Plano mensal</span>'}
        <h3>${escapeHtml(plan.name)}</h3>
        <p>${escapeHtml(plan.description || 'Plano pensado para sua rotina de treino.')}</p>
        <div class="plan-price">${money(plan.price_cents)}</div>
        <ul>${benefits.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        <a class="cta ${recommended ? '' : 'ghost'}" href="${href}">${valid.length ? 'Escolher plano' : 'Ver detalhes'}</a>
      </article>`;
  }).join('');
}

async function loadPlans() {
  renderPlans(samplePlans);
  try {
    const response = await fetch(`${API}/api/public/plans`, { headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'planos_indisponiveis');
    renderPlans(data.data || []);
  } catch (_) {
    renderPlans(samplePlans);
  }
}

loadPlans();
