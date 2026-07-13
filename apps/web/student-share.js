(function () {
  const p = (id) => document.getElementById(id); const maxBytes = 5 * 1024 * 1024;
  function preview(source) { const image = p('portal-progress-photo-preview'); const empty = p('portal-progress-photo-empty'); image.hidden = !source; empty.hidden = Boolean(source); image.src = source || ''; }
  async function upload(file) {
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('Escolha JPG, PNG, GIF ou WebP.');
    if (file.size > maxBytes) throw new Error('A imagem não pode ultrapassar 5 MB.');
    const form = new FormData(); form.append('file', file, file.name);
    const response = await fetch(`${StudentPortal.apiBase}/api/editor/images`, { method: 'POST', headers: { Authorization: `Bearer ${StudentPortal.token}` }, body: form });
    const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a foto.'); return data.location || '';
  }
  p('portal-progress-photo').addEventListener('change', (event) => { const file = event.target.files?.[0]; if (file && file.size <= maxBytes) preview(URL.createObjectURL(file)); });
  p('portal-progress-photo-url').addEventListener('input', (event) => { if (!p('portal-progress-photo').files?.length) preview(event.target.value.trim()); });
  p('portal-progress-photo-button').addEventListener('click', async () => {
    const button = p('portal-progress-photo-button');
    try { button.disabled = true; p('portal-progress-photo-status').textContent = 'Enviando foto...'; const file = p('portal-progress-photo').files?.[0]; const photoUrl = file ? await upload(file) : p('portal-progress-photo-url').value.trim(); if (!photoUrl) throw new Error('Escolha uma foto ou informe um link.'); await StudentPortal.api('/api/student/progress/photos', { method: 'POST', body: JSON.stringify({ photo_url: photoUrl, notes: p('portal-progress-photo-notes').value.trim() }) }); p('portal-progress-photo').value = ''; p('portal-progress-photo-url').value = ''; p('portal-progress-photo-notes').value = ''; preview(''); p('portal-progress-photo-status').textContent = 'Foto compartilhada com a equipe.'; } catch (error) { p('portal-progress-photo-status').textContent = `Erro: ${error.message}`; } finally { button.disabled = false; }
  });
  StudentPortal.init().catch((error) => { p('portal-progress-photo-status').textContent = `Erro: ${error.message}`; });
}());
