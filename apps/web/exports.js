const exportsHost = window.location.hostname || 'localhost';
const EXPORTS_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${exportsHost}:3004`;
const exportsToken = localStorage.getItem('academiaToken') || '';

async function downloadCsv(path) {
  const status = document.getElementById('export-status');
  if (!exportsToken) {
    status.textContent = 'Faca login no painel principal antes de exportar.';
    return;
  }

  try {
    const response = await fetch(`${EXPORTS_API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${exportsToken}` }
    });
    if (!response.ok) throw new Error('falha_exportacao');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = path.split('/').pop();
    link.click();
    URL.revokeObjectURL(url);
    status.textContent = 'Arquivo gerado.';
  } catch (error) {
    status.textContent = `Erro ao exportar: ${error.message}`;
  }
}

document.querySelectorAll('[data-export]').forEach((button) => {
  button.addEventListener('click', () => downloadCsv(button.dataset.export));
});
