const moduleStatus = document.getElementById('module-settings-status');
const moduleLabels = {
  dashboard: ['Painel', 'Resumo da operação'], community: ['Comunidade', 'Publicações e interações'], members: ['Alunos', 'Cadastros dos alunos'],
  plans: ['Planos', 'Planos comerciais'], memberships: ['Matrículas', 'Vínculos e matrículas'], pre_enrollments: ['Pré-matrículas', 'Solicitações de entrada'],
  finance: ['Financeiro', 'Cobranças e movimentações'], alerts: ['Alertas', 'Avisos operacionais'], training: ['Treinos', 'Exercícios e fichas'],
  access: ['Acessos', 'QR Code, catraca e credenciais'], users: ['Funcionários', 'Equipe e permissões']
};

async function loadModuleSettings() {
  const modules = await window.AcademiaModules.load(localStorage.getItem('academiaToken') || '');
  document.getElementById('module-settings-grid').innerHTML = Object.entries(moduleLabels).map(([key, [label, help]]) => `
    <label class="module-toggle"><input type="checkbox" data-module-key="${key}" ${modules[key] !== false ? 'checked' : ''} /><span><strong>${label}</strong><small>${help}</small></span></label>`).join('');
}

async function saveModuleSettings() {
  const button = document.getElementById('save-modules-button');
  const modules = { ...window.AcademiaModules.defaults };
  document.querySelectorAll('[data-module-key]').forEach((input) => { modules[input.dataset.moduleKey] = input.checked; });
  button.disabled = true;
  moduleStatus.textContent = 'Salvando...';
  try {
    const token = localStorage.getItem('academiaToken') || '';
    const response = await fetch('/api/gym/modules', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ modules }) });
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

document.getElementById('save-modules-button').addEventListener('click', saveModuleSettings);
loadModuleSettings();
