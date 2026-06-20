const host = window.location.hostname || 'localhost';
const API = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
const $ = (id) => document.getElementById(id);

async function loadPublicPlans() {
  try {
    const response = await fetch(`${API}/health`);
    await response.json();
    $('public-status').textContent = 'Sistema online. Integração pública de matrícula em implantação.';
  } catch (error) {
    $('public-status').textContent = 'API indisponível no momento.';
  }
}

$('public-submit').addEventListener('click', () => {
  $('public-status').textContent = 'Pré-matrícula registrada localmente. Próxima etapa: integrar com pagamentos e geração de QR Code.';
});

loadPublicPlans();
