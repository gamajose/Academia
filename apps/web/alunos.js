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

const digits = (value) => String(value || '').replace(/\D/g, '');
const val = (id) => $(id)?.value?.trim() || '';
const brl = (value) => (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatCpf(value) {
  const number = digits(value).slice(0, 11);
  return number.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function formatPhone(value) {
  const number = digits(value).slice(0, 11);
  if (number.length <= 10) return number.replace(/^(\d{2})(\d{0,4})(\d{0,4})/, (_, ddd, a, b) => [ddd ? `(${ddd})` : '', a, b].filter(Boolean).join(' '));
  return number.replace(/^(\d{2})(\d)(\d{0,4})(\d{0,4})/, (_, ddd, nine, a, b) => `(${ddd}) ${nine} ${a}${b ? `-${b}` : ''}`.trim());
}

function formatCep(value) {
  return digits(value).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
}

function button(text, action, className = 'mini-button') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  element.onclick = action;
  return element;
}

function render() {
  const list = $('students-list');
  const term = val('student-search').toLowerCase();
  list.innerHTML = '';
  const filtered = rows.filter((item) => `${item.name} ${item.email || ''} ${item.phone || ''} ${item.cpf || ''} ${item.rg || ''}`.toLowerCase().includes(term));

  for (const item of filtered) {
    const pending = Number(item.pending_amount_cents || 0);
    const li = document.createElement('li');
    li.className = 'entity-card';
    const main = document.createElement('div');
    main.className = 'entity-main';
    const statusClass = item.status === 'active' ? 'ok' : 'bad';
    main.innerHTML = `
      <strong>${item.name}</strong>
      <span>${item.email || 'Sem e-mail'} · ${item.phone ? formatPhone(item.phone) : 'Sem telefone'}</span>
      <span>${item.plan_name || 'Sem plano'} · <span class="badge ${statusClass}">${item.status === 'active' ? 'Ativo' : 'Inativo'}</span> ${pending > 0 ? `<span class="badge warn">Pendente ${brl(pending)}</span>` : '<span class="badge ok">Em dia</span>'}</span>`;
    const actions = document.createElement('div');
    actions.className = 'entity-actions';
    actions.appendChild(button('Editar cadastro', () => openModal(item), 'mini-button secondary'));
    actions.appendChild(button(item.status === 'active' ? 'Desativar' : 'Ativar', () => toggle(item), 'mini-button'));
    li.append(main, actions);
    list.appendChild(li);
  }

  if (!list.children.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Nenhum aluno encontrado.';
    list.appendChild(li);
  }
}

async function load() {
  if (!TOKEN) { location.href = './student-login.html'; return; }
  try {
    const result = await req('/api/members/detail');
    rows = result.data || [];
    render();
    $('students-status').textContent = `${rows.length} aluno(s) carregado(s).`;
  } catch (error) {
    $('students-status').textContent = `Erro: ${error.message}`;
  }
}

function setValue(id, value) { if ($(id)) $(id).value = value ?? ''; }

function openModal(item = {}) {
  $('student-form-panel').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setValue('student-id', item.id);
  setValue('student-name', item.name);
  setValue('student-cpf', item.cpf ? formatCpf(item.cpf) : '');
  setValue('student-rg', item.rg || item.document);
  setValue('student-email', item.email);
  setValue('student-birth', item.birth_date ? String(item.birth_date).slice(0, 10) : '');
  const countryCode = item.phone_country_code || '+55';
  setValue('student-phone-country', countryCode === '+55' ? '+55' : 'other');
  setValue('student-phone-country-custom', countryCode === '+55' ? '' : countryCode);
  $('student-phone-country-custom-wrap').classList.toggle('hidden', countryCode === '+55');
  setValue('student-phone', countryCode === '+55' ? formatPhone(item.phone) : item.phone);
  setValue('student-emergency-name', item.emergency_contact_name || (item.emergency_contact || '').split('|')[0]?.trim());
  setValue('student-emergency-phone', item.emergency_contact_phone || (item.emergency_contact || '').split('|')[1]?.trim());
  setValue('student-postal-code', formatCep(item.postal_code));
  setValue('student-street', item.street);
  setValue('student-address-number', item.address_number);
  setValue('student-address-complement', item.address_complement);
  setValue('student-neighborhood', item.neighborhood);
  setValue('student-city', item.city);
  setValue('student-state', item.state);
  setValue('student-country', item.country || 'Brasil');
  setValue('student-objective', item.objective);
  setValue('student-allergies', item.allergies);
  setValue('student-medical', item.medical_notes);
  setValue('student-nutrition', item.nutrition_notes);
  setValue('student-notes', item.notes);
  setTimeout(() => $('student-name').focus(), 50);
}

function closeModal() {
  $('student-form-panel').classList.add('hidden');
  document.body.style.overflow = '';
  $('student-form').reset();
  setValue('student-country', 'Brasil');
  setValue('student-phone-country', '+55');
  $('student-phone-country-custom-wrap').classList.add('hidden');
}

function structuredAddress() {
  const parts = [
    [val('student-street'), val('student-address-number')].filter(Boolean).join(', '),
    val('student-address-complement'), val('student-neighborhood'),
    [val('student-city'), val('student-state')].filter(Boolean).join(' - '),
    formatCep(val('student-postal-code')), val('student-country')
  ].filter(Boolean);
  return parts.join(' | ');
}

async function save(event) {
  event.preventDefault();
  const email = val('student-email');
  const cpf = digits(val('student-cpf'));
  if (!val('student-name')) { $('students-status').textContent = 'Informe o nome completo.'; $('student-name').focus(); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('students-status').textContent = 'Informe um e-mail válido.'; $('student-email').focus(); return; }
  if (cpf && cpf.length !== 11) { $('students-status').textContent = 'O CPF deve possuir 11 dígitos.'; $('student-cpf').focus(); return; }

  const countryCode = val('student-phone-country') === '+55' ? '+55' : val('student-phone-country-custom');
  const emergencyName = val('student-emergency-name');
  const emergencyPhone = digits(val('student-emergency-phone'));

  try {
    $('save-student-button').disabled = true;
    await req('/api/members/detail/save', {
      method: 'POST',
      body: JSON.stringify({
        member_id: val('student-id') || undefined,
        name: val('student-name'), cpf: cpf || null, rg: val('student-rg') || null,
        document: val('student-rg') || cpf || null, email: email || null,
        phone_country_code: countryCode || null, phone: digits(val('student-phone')) || null,
        birth_date: val('student-birth') || null,
        emergency_contact_name: emergencyName || null, emergency_contact_phone: emergencyPhone || null,
        emergency_contact: [emergencyName, emergencyPhone].filter(Boolean).join(' | ') || null,
        postal_code: digits(val('student-postal-code')) || null, street: val('student-street') || null,
        address_number: val('student-address-number') || null, address_complement: val('student-address-complement') || null,
        neighborhood: val('student-neighborhood') || null, city: val('student-city') || null,
        state: val('student-state') || null, country: val('student-country') || 'Brasil',
        address: structuredAddress() || null, objective: val('student-objective') || null,
        allergies: val('student-allergies') || null, medical_notes: val('student-medical') || null,
        nutrition_notes: val('student-nutrition') || null, notes: val('student-notes') || null
      })
    });
    closeModal();
    await load();
    $('students-status').textContent = 'Cadastro salvo com sucesso.';
  } catch (error) {
    const labels = { cpf_ja_cadastrado: 'Este CPF já pertence a outro aluno.', email_invalido: 'Informe um e-mail válido.', cpf_invalido: 'O CPF deve possuir 11 dígitos.' };
    $('students-status').textContent = labels[error.message] || `Erro ao salvar: ${error.message}`;
  } finally {
    $('save-student-button').disabled = false;
  }
}

async function toggle(item) {
  try {
    await req(item.status === 'active' ? '/api/members/deactivate' : '/api/members/activate', { method: 'POST', body: JSON.stringify({ member_id: item.id }) });
    await load();
  } catch (error) { $('students-status').textContent = `Erro: ${error.message}`; }
}

$('new-student-button').onclick = () => openModal();
$('close-student-modal').onclick = closeModal;
$('cancel-student-button').onclick = closeModal;
$('student-form').addEventListener('submit', save);
$('student-search').oninput = render;
$('student-cpf').addEventListener('input', (event) => { event.target.value = formatCpf(event.target.value); });
$('student-phone').addEventListener('input', (event) => { if (val('student-phone-country') === '+55') event.target.value = formatPhone(event.target.value); });
$('student-emergency-phone').addEventListener('input', (event) => { event.target.value = formatPhone(event.target.value); });
$('student-postal-code').addEventListener('input', (event) => { event.target.value = formatCep(event.target.value); });
$('student-phone-country').addEventListener('change', () => {
  const brazil = val('student-phone-country') === '+55';
  $('student-phone-country-custom-wrap').classList.toggle('hidden', brazil);
  $('student-phone').placeholder = brazil ? '(32) 9 9919-2233' : 'Telefone com código de área';
  if (brazil) $('student-phone').value = formatPhone($('student-phone').value);
});
load();
