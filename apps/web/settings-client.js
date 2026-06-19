const settingsHost = window.location.hostname || 'localhost';
const defaultApi = `http://${settingsHost}:3004`;
const apiInput = document.getElementById('api-base-url');
const settingsStatus = document.getElementById('settings-status');

apiInput.value = localStorage.getItem('apiBaseUrl') || defaultApi;

function setSettingsStatus(text) {
  settingsStatus.textContent = text;
}

async function testApiConnection() {
  try {
    const cleanUrl = apiInput.value.replace(/\/$/, '');
    const response = await fetch(`${cleanUrl}/health`);
    const data = await response.json();
    setSettingsStatus(`API ${data.status || 'ok'} - ${data.version || 'sem versao'}`);
  } catch (error) {
    setSettingsStatus('Falha ao conectar na API.');
  }
}

function saveApiUrl() {
  const cleanUrl = apiInput.value.replace(/\/$/, '');
  localStorage.setItem('apiBaseUrl', cleanUrl);
  setSettingsStatus('URL salva.');
}

function clearSession() {
  localStorage.removeItem('academiaToken');
  setSettingsStatus('Sessao limpa. Abra o painel para entrar novamente.');
}

document.getElementById('save-api-button').addEventListener('click', saveApiUrl);
document.getElementById('test-api-button').addEventListener('click', testApiConnection);
document.getElementById('logout-settings-button').addEventListener('click', clearSession);
testApiConnection();
