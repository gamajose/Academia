const auditApiHost = window.location.hostname || 'localhost';
const AUDIT_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${auditApiHost}:3004`;

async function loadAuditLogs() {
  const list = document.getElementById('audit-list');
  if (!list) return;

  const savedToken = localStorage.getItem('academiaToken') || '';
  if (!savedToken) {
    list.innerHTML = '<li>Faca login para visualizar as atividades.</li>';
    return;
  }

  try {
    const response = await fetch(`${AUDIT_API_BASE_URL}/api/audit/recent`, {
      headers: { Authorization: `Bearer ${savedToken}` }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'erro_auditoria');

    list.innerHTML = '';
    for (const item of result.data || []) {
      const row = document.createElement('li');
      const date = new Date(item.created_at).toLocaleString('pt-BR');
      row.textContent = `${date} - ${item.action} ${item.entity}`;
      list.appendChild(row);
    }

    if (!list.children.length) {
      list.innerHTML = '<li>Nenhuma atividade registrada ainda.</li>';
    }
  } catch (error) {
    list.innerHTML = '<li>Nao foi possivel carregar a auditoria.</li>';
  }
}

setInterval(loadAuditLogs, 8000);
loadAuditLogs();
