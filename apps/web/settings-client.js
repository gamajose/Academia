const moduleStatus = document.getElementById('module-settings-status');
const paymentStatus = document.getElementById('payment-settings-status');

const moduleLabels = {
  dashboard: ['Painel', 'Resumo da operação'],
  members: ['Alunos', 'Cadastros dos alunos'],
  plans: ['Planos', 'Planos comerciais'],
  memberships: ['Matrículas', 'Vínculos e matrículas'],
  pre_enrollments: ['Pré-matrículas', 'Solicitações de entrada'],
  finance: ['Financeiro', 'Cobranças e movimentações'],
  alerts: ['Alertas', 'Avisos operacionais'],
  training: ['Treinos', 'Exercícios e fichas'],
  assessments: ['Avaliações', 'Acompanhamento físico e metas'],
  access: ['Acessos', 'QR Code, recepção e credenciais'],
  users: ['Funcionários', 'Equipe e permissões']
};

function byId(id) {
  return document.getElementById(id);
}

function fieldVal(id) {
  return byId(id)?.value?.trim() || '';
}

function setFieldVal(id, val) {
  const el = byId(id);
  if (el) el.value = val || '';
}

async function loadModuleSettings() {
  const modules = await window.AcademiaModules.load(localStorage.getItem('academiaToken') || '');
  const container = document.getElementById('module-settings-grid');
  if (container) {
    container.innerHTML = Object.entries(moduleLabels).map(([key, [label, help]]) => `
      <label class="module-toggle"><input type="checkbox" data-module-key="${key}" ${modules[key] !== false ? 'checked' : ''} /><span><strong>${label}</strong><small>${help}</small></span></label>`).join('');
  }
}

async function saveModuleSettings() {
  const button = document.getElementById('save-modules-button');
  const modules = { ...window.AcademiaModules.defaults };
  document.querySelectorAll('[data-module-key]').forEach((input) => { modules[input.dataset.moduleKey] = input.checked; });
  button.disabled = true;
  moduleStatus.textContent = 'Salvando...';
  try {
    const token = localStorage.getItem('academiaToken') || '';
    const response = await fetch('/api/gym/modules', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ modules })
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : { error: `resposta_invalida_${response.status}` };
    if (!response.ok) throw new Error(data.error || 'falha_ao_salvar');
    window.AcademiaModules.store(data.modules);
    moduleStatus.textContent = 'Configuração salva. Os menus foram atualizados para toda a academia.';
    setTimeout(() => window.location.reload(), 450);
  } catch (error) {
    const messages = { acesso_negado: 'Somente administrador ou proprietário pode alterar os módulos.', nao_autorizado: 'Sua sessão expirou. Entre novamente.', resposta_invalida_501: 'O servidor web não aceitou a atualização. Recarregue a página e tente novamente.' };
    moduleStatus.textContent = messages[error.message] || `Não foi possível salvar os módulos: ${error.message}`;
  } finally { button.disabled = false; }
}

// Payment Settings Logic
async function loadPaymentSettings() {
  try {
    const token = localStorage.getItem('academiaToken') || '';
    const response = await fetch('/api/gym/payment-settings', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (!response.ok) return;
    const data = await response.json();
    const settings = data.payment_settings || {};
    const pix = settings.pix || {};
    const card = settings.card || {};
    const paypal = settings.paypal || {};

    setFieldVal('pay-pix-key', pix.key || data.pix_key || localStorage.getItem('gymPixKey') || '');
    setFieldVal('pay-pix-receiver', pix.receiver_name || localStorage.getItem('gymPixReceiver') || localStorage.getItem('gymName') || '');
    setFieldVal('pay-pix-bank', pix.bank || '');
    setFieldVal('pay-pix-city', pix.city || '');

    setFieldVal('pay-card-provider', card.provider || 'mercadopago');
    setFieldVal('pay-card-installments', String(card.installments_max || '12'));
    setFieldVal('pay-card-public-key', card.public_key || '');
    setFieldVal('pay-card-secret-key', card.secret_key || '');

    setFieldVal('pay-paypal-email', paypal.business_email || '');
    setFieldVal('pay-paypal-mode', paypal.mode || 'live');
    setFieldVal('pay-paypal-client-id', paypal.client_id || '');
    setFieldVal('pay-paypal-secret', paypal.client_secret || '');
  } catch (error) {
    if (paymentStatus) paymentStatus.textContent = `Erro ao carregar dados de pagamento: ${error.message}`;
  }
}

async function savePaymentSettings() {
  const btn = byId('save-payments-button');
  if (btn) btn.disabled = true;
  if (paymentStatus) paymentStatus.textContent = 'Salvando credenciais de pagamento...';

  try {
    const token = localStorage.getItem('academiaToken') || '';
    const pixKey = fieldVal('pay-pix-key');
    const pixReceiver = fieldVal('pay-pix-receiver');
    const pixBank = fieldVal('pay-pix-bank');
    const pixCity = fieldVal('pay-pix-city');

    const cardProvider = fieldVal('pay-card-provider');
    const cardInstallments = parseInt(fieldVal('pay-card-installments'), 10) || 12;
    const cardPublicKey = fieldVal('pay-card-public-key');
    const cardSecretKey = fieldVal('pay-card-secret-key');

    const paypalEmail = fieldVal('pay-paypal-email');
    const paypalMode = fieldVal('pay-paypal-mode');
    const paypalClientId = fieldVal('pay-paypal-client-id');
    const paypalSecret = fieldVal('pay-paypal-secret');

    const payload = {
      pix_key: pixKey,
      payment_settings: {
        pix: {
          key: pixKey,
          receiver_name: pixReceiver,
          bank: pixBank,
          city: pixCity
        },
        card: {
          provider: cardProvider,
          installments_max: cardInstallments,
          public_key: cardPublicKey,
          secret_key: cardSecretKey
        },
        paypal: {
          business_email: paypalEmail,
          mode: paypalMode,
          client_id: paypalClientId,
          client_secret: paypalSecret
        }
      }
    };

    const response = await fetch('/api/gym/payment-settings', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'falha_ao_salvar');
    }

    if (pixKey) localStorage.setItem('gymPixKey', pixKey);
    if (pixReceiver) localStorage.setItem('gymPixReceiver', pixReceiver);

    if (paymentStatus) {
      paymentStatus.textContent = '✓ Configurações de pagamento salvas com sucesso!';
      paymentStatus.style.color = '#10b981';
      setTimeout(() => { paymentStatus.textContent = ''; }, 4000);
    }
  } catch (error) {
    if (paymentStatus) {
      paymentStatus.textContent = `Não foi possível salvar: ${error.message}`;
      paymentStatus.style.color = '#ef4444';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Payment Tabs switching
function initPaymentTabs() {
  const tabs = document.querySelectorAll('.payment-tabs-nav .tab-btn');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const targetId = `tab-${tab.dataset.tab}`;
      document.querySelectorAll('.payment-tab-content').forEach((content) => {
        if (content.id === targetId) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      });
    });
  });
}

document.getElementById('save-modules-button')?.addEventListener('click', saveModuleSettings);
document.getElementById('save-payments-button')?.addEventListener('click', savePaymentSettings);

initPaymentTabs();
loadModuleSettings();
loadPaymentSettings();
