const ACCESS_HOST = window.location.hostname || 'localhost';
const ACCESS_API = localStorage.getItem('apiBaseUrl') || `http://${ACCESS_HOST}:3004`;
const ACCESS_TOKEN = localStorage.getItem('academiaToken') || '';
const accessEl = (id) => document.getElementById(id);
let accessMembers = [];
let accessMemberId = '';
let accessExpiresAt = null;
let accessTtlSeconds = 30;
let accessTimer = null;
let accessRequestInFlight = false;

async function accessApi(path, options = {}) {
  const response = await fetch(`${ACCESS_API}${path}`, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ACCESS_TOKEN}`, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

const digits = (value) => String(value || '').replace(/\D/g, '');
const formatCode = (value) => { const number = digits(value).slice(0, 6); return number.length === 6 ? `${number.slice(0, 3)} ${number.slice(3)}` : '--- ---'; };
const formatDateTime = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-';

function setStatus(message) { accessEl('access-status').textContent = message; }

function statusLabel(item) {
  if (item.status === 'active') return 'Ativo';
  if (item.status === 'blocked') return 'Bloqueado';
  return item.status || 'Pendente';
}

function accessDecisionLabel(item) {
  return item.allowed ? 'Entrada liberada' : 'Entrada bloqueada';
}

function renderMembers() {
  const list = accessEl('access-member-list');
  const term = accessEl('access-member-search').value.trim().toLowerCase();
  const filter = accessEl('access-member-filter').value;
  list.innerHTML = '';
  const rows = accessMembers.filter((member) => `${member.name} ${member.email || ''} ${member.phone || ''}`.toLowerCase().includes(term)
    && (!filter || (filter === 'active' ? member.status === 'active' : member.status !== 'active')));
  accessEl('access-member-count').textContent = String(accessMembers.length);
  if (!rows.length) {
    const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = term ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado.'; list.appendChild(empty); return;
  }
  for (const member of rows) {
    const row = document.createElement('li'); row.className = 'access-member-row'; row.setAttribute('role', 'button'); row.tabIndex = 0; row.title = 'Abrir credencial do aluno';
    row.addEventListener('click', () => openCredential(member));
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCredential(member); } });
    const info = document.createElement('div'); info.className = 'access-member-main';
    const name = document.createElement('strong'); name.textContent = member.name;
    const contact = document.createElement('span'); contact.textContent = [member.email, member.phone].filter(Boolean).join(' · ') || 'Sem contato informado';
    info.append(name, contact);
    const meta = document.createElement('div'); meta.className = 'access-member-meta';
    const badge = document.createElement('span'); badge.className = `badge ${member.status === 'active' ? 'ok' : 'bad'}`; badge.textContent = statusLabel(member);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button'; button.textContent = '▦'; button.title = 'Abrir QR Code e credencial'; button.setAttribute('aria-label', 'Abrir QR Code e credencial'); button.addEventListener('click', (event) => { event.stopPropagation(); openCredential(member); });
    meta.append(badge, button); row.append(info, meta); list.appendChild(row);
  }
}

function renderDecisions(rows) {
  const list = accessEl('access-decision-list'); list.innerHTML = '';
  accessEl('access-decision-count').textContent = String(rows.length);
  if (!rows.length) { const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = 'Nenhuma decisão registrada ainda.'; list.appendChild(empty); return; }
  for (const item of rows.slice(0, 50)) {
    const row = document.createElement('li'); row.className = 'access-decision-row';
    const main = document.createElement('div'); const name = document.createElement('strong'); name.textContent = item.member_name || 'Aluno'; const detail = document.createElement('span'); detail.textContent = `${accessDecisionLabel(item)} · ${formatDateTime(item.decided_at)}`; main.append(name, detail);
    const actions = document.createElement('div'); actions.className = 'access-decision-actions';
    const badge = document.createElement('span'); badge.className = `badge ${item.allowed ? 'ok' : 'bad'}`; badge.textContent = item.allowed ? 'Liberado' : 'Bloqueado';
    const details = document.createElement('details'); details.className = 'access-decision-details';
    const summary = document.createElement('summary'); summary.textContent = 'Ver decisão';
    const explanation = document.createElement('p'); explanation.textContent = [item.reason, item.message, item.device_name ? `Dispositivo: ${item.device_name}` : ''].filter(Boolean).join(' · ') || 'Sem detalhes adicionais.';
    details.append(summary, explanation); actions.append(badge, details); row.append(main, actions); list.appendChild(row);
  }
}

function setCredentialState(access) {
  const allowed = access.allowed === true; accessEl('access-state-dot').classList.toggle('allowed', allowed); accessEl('access-state-dot').classList.toggle('blocked', !allowed); accessEl('access-state-label').textContent = allowed ? 'Acesso liberado' : 'Acesso bloqueado';
}

async function drawQr(payload, dataUrl = '') {
  const canvas = accessEl('access-qr'); const empty = accessEl('access-qr-empty');
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (dataUrl) {
    await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { context.drawImage(image, 0, 0, canvas.width, canvas.height); resolve(); }; image.onerror = reject; image.src = dataUrl; });
    empty.classList.add('hidden');
    return;
  }
  if (!payload || !window.QRCode?.toCanvas) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden'); await window.QRCode.toCanvas(canvas, payload, { width: 220, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } });
}

function remainingSeconds() { return accessExpiresAt ? Math.max(0, Math.ceil((accessExpiresAt.getTime() - Date.now()) / 1000)) : 0; }

function updateCountdown() {
  const remaining = remainingSeconds(); accessEl('access-countdown').textContent = accessExpiresAt ? `Muda em ${remaining} segundo(s)` : 'Credencial temporária indisponível'; accessEl('access-progress-bar').style.width = `${Math.min(1, Math.max(0, remaining / accessTtlSeconds)) * 100}%`;
  if (accessExpiresAt && remaining <= 2 && accessMemberId && !accessRequestInFlight && !accessEl('access-credential-modal').classList.contains('hidden')) void loadCredential(true);
}

async function loadCredential(silent = false) {
  if (!accessMemberId || accessRequestInFlight) return; accessRequestInFlight = true; if (!silent) accessEl('access-credential-status').textContent = 'Gerando credencial segura...';
  try {
    const result = await accessApi('/api/access/member-credential/preview', { method: 'POST', body: JSON.stringify({ member_id: accessMemberId }) });
    const member = result.member || {}; const dynamic = result.dynamic || {}; const offline = result.offline || {}; const access = result.access || {};
    accessEl('access-student-name').textContent = member.name || 'Aluno'; accessEl('access-credential-subtitle').textContent = `Credencial de ${member.name || 'aluno'}`; accessEl('access-registration-number').textContent = offline.registration_number || '------'; accessEl('access-offline-pin').textContent = offline.pin || '----'; accessEl('access-dynamic-code').textContent = formatCode(dynamic.access_code); accessExpiresAt = dynamic.expires_at ? new Date(dynamic.expires_at) : null; accessTtlSeconds = Number(dynamic.ttl_seconds || 30); setCredentialState(access); await drawQr(dynamic.qr_payload || '', dynamic.qr_data_url || ''); accessEl('access-credential-status').textContent = access.allowed ? 'Pagamento e matrícula conferidos. Credencial pronta para a catraca.' : (access.message || 'O acesso deste aluno está bloqueado.'); updateCountdown();
  } catch (error) { accessExpiresAt = null; accessEl('access-credential-status').textContent = `Erro: ${error.message}`; accessEl('access-dynamic-code').textContent = '--- ---'; await drawQr(''); } finally { accessRequestInFlight = false; }
}

function openCredential(member) { accessMemberId = member.id; accessExpiresAt = null; accessEl('access-credential-modal').classList.remove('hidden'); accessEl('access-credential-modal').setAttribute('aria-hidden', 'false'); document.body.classList.add('modal-open'); accessEl('access-student-name').textContent = member.name; accessEl('access-credential-subtitle').textContent = 'Carregando a credencial...'; if (accessTimer) clearInterval(accessTimer); accessTimer = setInterval(updateCountdown, 1000); void loadCredential(); }

function closeCredential() { accessMemberId = ''; accessExpiresAt = null; accessEl('access-credential-modal').classList.add('hidden'); accessEl('access-credential-modal').setAttribute('aria-hidden', 'true'); document.body.classList.remove('modal-open'); if (accessTimer) clearInterval(accessTimer); accessTimer = null; }

async function resetPin() { if (!accessMemberId || !window.confirm('Gerar um novo PIN? O PIN anterior deixará de funcionar imediatamente.')) return; const button = accessEl('access-reset-pin'); button.disabled = true; try { const result = await accessApi('/api/access/member-offline-pin/reset', { method: 'POST', body: JSON.stringify({ member_id: accessMemberId }) }); accessEl('access-registration-number').textContent = result.registration_number || '------'; accessEl('access-offline-pin').textContent = result.pin || '----'; accessEl('access-credential-status').textContent = 'Novo PIN gerado.'; } catch (error) { accessEl('access-credential-status').textContent = `Erro: ${error.message}`; } finally { button.disabled = false; } }

async function loadPage() { try { const [members, decisions] = await Promise.all([accessApi('/api/access/members'), accessApi('/api/access/decisions/recent')]); accessMembers = members.data || []; renderMembers(); renderDecisions(decisions.data || []); accessEl('access-last-update').textContent = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date()); setStatus('Acesso carregado.'); } catch (error) { setStatus(`Erro ao carregar acesso: ${error.message}`); } }

accessEl('access-member-search').addEventListener('input', renderMembers);
accessEl('access-member-filter').addEventListener('change', renderMembers);
accessEl('close-access-credential').addEventListener('click', closeCredential);
accessEl('access-reset-pin').addEventListener('click', resetPin);
accessEl('access-credential-modal').addEventListener('click', (event) => { if (event.target === accessEl('access-credential-modal')) closeCredential(); });
loadPage();
