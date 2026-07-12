const host = window.location.hostname || 'localhost';
const API = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
const TOKEN = localStorage.getItem('academiaToken') || '';
const $ = (id) => document.getElementById(id);
let rows = [];

async function req(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

const money = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function numberFromCurrency(value) {
  const normalized = String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currencyInput(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function button(text, action, className = 'mini-button') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  element.onclick = action;
  return element;
}

function plainText(html) {
  const node = document.createElement('div');
  node.innerHTML = html || '';
  return node.textContent.trim();
}

function render() {
  const list = $('plans-page-list');
  list.innerHTML = '';
  for (const plan of rows) {
    const li = document.createElement('li');
    li.className = 'entity-card';
    const main = document.createElement('div');
    main.className = 'entity-main';
    main.innerHTML = `
      <strong>${plan.name}</strong>
      <span>${money(plan.price_cents)} · ${plan.duration_days} dia(s)</span>
      <span>${plainText(plan.description || '').slice(0, 110) || 'Sem descrição'} · <span class="badge ${plan.is_active ? 'ok' : 'bad'}">${plan.is_active ? 'Ativo' : 'Inativo'}</span></span>`;
    const actions = document.createElement('div');
    actions.className = 'entity-actions';
    actions.appendChild(button('Editar', () => openPlan(plan), 'mini-button secondary'));
    actions.appendChild(button(plan.is_active ? 'Desativar' : 'Ativar', () => toggle(plan), 'mini-button'));
    li.append(main, actions);
    list.appendChild(li);
  }
  if (!list.children.length) {
    const item = document.createElement('li');
    item.className = 'empty-state';
    item.textContent = 'Nenhum plano encontrado.';
    list.appendChild(item);
  }
}

function setupEditor(toolbar) {
  const editor = $(toolbar.dataset.editor);
  const controls = [
    ['B', 'bold', 'Negrito'], ['I', 'italic', 'Itálico'], ['U', 'underline', 'Sublinhado'],
    ['• Lista', 'insertUnorderedList', 'Lista'], ['1. Lista', 'insertOrderedList', 'Lista numerada'],
    ['Link', 'createLink', 'Inserir link'], ['Imagem', 'insertImage', 'Inserir imagem'],
    ['Limpar', 'removeFormat', 'Remover formatação']
  ];
  for (const [label, command, title] of controls) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    control.title = title;
    control.addEventListener('click', () => {
      editor.focus();
      let value = null;
      if (command === 'createLink') value = prompt('Cole o endereço do link:');
      if (command === 'insertImage') value = prompt('Cole o endereço da imagem:');
      if ((command === 'createLink' || command === 'insertImage') && !value) return;
      document.execCommand(command, false, value);
    });
    toolbar.appendChild(control);
  }
  const color = document.createElement('input');
  color.type = 'color';
  color.title = 'Cor do texto';
  color.value = '#171717';
  color.addEventListener('input', () => { editor.focus(); document.execCommand('foreColor', false, color.value); });
  toolbar.appendChild(color);
  const size = document.createElement('select');
  size.title = 'Tamanho da fonte';
  size.innerHTML = '<option value="">Fonte</option><option value="2">Pequena</option><option value="3">Normal</option><option value="5">Grande</option>';
  size.addEventListener('change', () => {
    if (!size.value) return;
    editor.focus();
    document.execCommand('fontSize', false, size.value);
    size.value = '';
  });
  toolbar.appendChild(size);
}

function durationToUi(days) {
  const value = Number(days || 30);
  if (value % 30 === 0) return { value: Math.max(1, value / 30), unit: 'months' };
  return { value, unit: 'days' };
}

function durationToDays() {
  const value = Math.max(1, Number($('plan-duration-value').value || 1));
  return $('plan-duration-unit').value === 'months' ? value * 30 : value;
}

function openPlan(plan = {}) {
  $('plan-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $('plan-id').value = plan.id || '';
  $('plan-name-page').value = plan.name || '';
  $('plan-price-page').value = plan.id ? currencyInput(Number(plan.price_cents || 0) / 100) : '';
  const duration = durationToUi(plan.duration_days || 30);
  $('plan-duration-value').value = duration.value;
  $('plan-duration-unit').value = duration.unit;
  $('plan-description-page').innerHTML = plan.description || '';
  $('plan-benefits-page').innerHTML = plan.benefits || '';
  $('plan-rules-page').innerHTML = plan.rules || '';
  setTimeout(() => $('plan-name-page').focus(), 50);
}

function closePlan() {
  $('plan-modal').classList.add('hidden');
  document.body.style.overflow = '';
  $('plan-form').reset();
  for (const id of ['plan-description-page', 'plan-benefits-page', 'plan-rules-page']) $(id).innerHTML = '';
}

async function load() {
  try {
    const result = await req('/api/plans/detail');
    rows = result.data || [];
    render();
    $('plans-status').textContent = `${rows.length} plano(s) carregado(s).`;
  } catch (error) {
    $('plans-status').textContent = `Erro: ${error.message}`;
  }
}

async function save(event) {
  event.preventDefault();
  const name = $('plan-name-page').value.trim();
  const price = numberFromCurrency($('plan-price-page').value);
  if (!name) { $('plans-status').textContent = 'Informe o nome do plano.'; return; }
  if (price <= 0) { $('plans-status').textContent = 'Informe um preço maior que zero.'; return; }
  try {
    $('save-plan-page-button').disabled = true;
    const id = $('plan-id').value;
    const payload = {
      name,
      price_cents: Math.round(price * 100),
      duration_days: durationToDays(),
      public_highlight: null,
      description: $('plan-description-page').innerHTML.trim(),
      benefits: $('plan-benefits-page').innerHTML.trim(),
      rules: $('plan-rules-page').innerHTML.trim()
    };
    await req(id ? '/api/plans/update' : '/api/plans/detail', { method: 'POST', body: JSON.stringify(id ? { plan_id: id, ...payload } : payload) });
    closePlan();
    await load();
    $('plans-status').textContent = 'Plano salvo com sucesso.';
  } catch (error) {
    $('plans-status').textContent = `Erro ao salvar: ${error.message}`;
  } finally {
    $('save-plan-page-button').disabled = false;
  }
}

async function toggle(plan) {
  try {
    await req(plan.is_active ? '/api/plans/deactivate' : '/api/plans/activate', { method: 'POST', body: JSON.stringify({ plan_id: plan.id }) });
    await load();
  } catch (error) { $('plans-status').textContent = `Erro: ${error.message}`; }
}

document.querySelectorAll('.editor-toolbar').forEach(setupEditor);
$('new-plan-button').onclick = () => openPlan();
$('close-plan-modal').onclick = closePlan;
$('cancel-plan-button').onclick = closePlan;
$('plan-form').addEventListener('submit', save);
$('plan-price-page').addEventListener('blur', (event) => {
  const value = numberFromCurrency(event.target.value);
  event.target.value = value > 0 ? currencyInput(value) : '';
});
load();
