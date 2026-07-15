(function () {
  const p = (id) => document.getElementById(id);
  const maxPhotoBytes = 5 * 1024 * 1024;
  let progressData = { assessments: [], goals: [], analysis: null };

  function escape(value) { return StudentPortal.escapeHtml(value == null ? '' : String(value)); }
  function value(item, key, suffix = '') { return item?.[key] == null || item[key] === '' ? '-' : `${item[key]}${suffix}`; }
  function number(valueToFormat, suffix = '') { return valueToFormat == null || valueToFormat === '' ? '-' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(valueToFormat))}${suffix}`; }
  function dateLabel(valueToFormat) {
    if (!valueToFormat) return '-';
    const date = new Date(`${String(valueToFormat).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? String(valueToFormat) : date.toLocaleDateString('pt-BR');
  }
  function localDate() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function entity(title, subtitle, detail) {
    const li = document.createElement('li'); li.className = 'entity-card';
    li.innerHTML = `<div class="entity-main"><strong>${escape(title)}</strong><span>${escape(subtitle)}</span><span>${escape(detail || '')}</span></div>`;
    return li;
  }
  function setStatus(text, error = false) { const target = p('student-progress-status'); if (target) { target.textContent = text; target.classList.toggle('error', error); } }
  function setFormStatus(text, error = false) { const target = p('student-assessment-status'); if (target) { target.textContent = text; target.classList.toggle('error', error); } }

  function renderSummary(assessments) {
    const latest = assessments[0];
    p('student-progress-summary').innerHTML = [
      ['Peso', value(latest, 'weight_kg', ' kg')],
      ['Gordura', value(latest, 'body_fat_percent', '%')],
      ['Massa muscular', value(latest, 'muscle_mass_kg', ' kg')],
      ['Cintura', value(latest, 'waist_cm', ' cm')]
    ].map(([label, content]) => `<div class="student-stat"><span>${label}</span><strong>${escape(content)}</strong></div>`).join('');
    p('student-progress-summary-date').textContent = latest ? `Última medição em ${dateLabel(latest.assessment_date)}` : 'Nenhuma medição registrada ainda.';
    const reminder = p('student-progress-reminder');
    if (!latest) { reminder.hidden = false; reminder.textContent = 'Faça sua primeira medição'; return; }
    const last = new Date(`${String(latest.assessment_date).slice(0, 10)}T12:00:00`);
    const days = Math.floor((Date.now() - last.getTime()) / 86400000);
    reminder.hidden = days < 30;
    reminder.textContent = 'Sua medição mensal está disponível';
  }

  function renderAnalysis(analysis) {
    const target = p('student-progress-analysis');
    if (!analysis) { target.innerHTML = ''; return; }
    const projection = analysis.projection;
    target.innerHTML = `<div class="progress-analysis"><div><p class="eyebrow">Assistente de evolução</p><h3>${escape(analysis.title || 'Análise de progresso')}</h3></div><p class="progress-analysis-copy">${escape(analysis.message || '')}</p>${projection ? `<div class="progress-analysis-projection"><div><span>Projeção de peso · 3 meses</span><strong>${escape(number(projection.weight_kg, ' kg'))}</strong></div><div><span>Projeção de gordura</span><strong>${escape(number(projection.body_fat_percent, '%'))}</strong></div><div><span>Projeção de massa muscular</span><strong>${escape(number(projection.muscle_mass_kg, ' kg'))}</strong></div><div><span>Projeção de cintura</span><strong>${escape(number(projection.waist_cm, ' cm'))}</strong></div></div>` : ''}${analysis.disclaimer ? `<p class="progress-analysis-disclaimer">${escape(analysis.disclaimer)}</p>` : ''}</div>`;
  }

  function renderHistory(assessments) {
    const list = p('student-progress-list'); list.innerHTML = '';
    assessments.forEach((item) => {
      const details = [
        `Peso ${value(item, 'weight_kg', ' kg')}`,
        `Gordura ${value(item, 'body_fat_percent', '%')}`,
        `Massa muscular ${value(item, 'muscle_mass_kg', ' kg')}`,
        `Cintura ${value(item, 'waist_cm', ' cm')}`,
        `Bíceps ${value(item, 'biceps_cm', ' cm')}`,
        `Coxas ${value(item, 'left_thigh_cm', ' cm')}`
      ].join(' · ');
      list.appendChild(entity(dateLabel(item.assessment_date), details, item.notes || 'Nova medição adicionada ao histórico.'));
    });
    if (!assessments.length) { const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = 'Nenhuma avaliação registrada ainda.'; list.appendChild(empty); }
  }

  function renderPhotos(assessments) {
    const photos = p('student-photo-grid'); photos.innerHTML = '';
    assessments.filter((item) => item.photo_url).forEach((item) => { const figure = document.createElement('figure'); figure.className = 'student-photo-card'; figure.innerHTML = `<img src="${escape(item.photo_url)}" alt="Foto de evolução" loading="lazy"><figcaption>${escape(dateLabel(item.assessment_date))}</figcaption>`; photos.appendChild(figure); });
    if (!photos.children.length) photos.innerHTML = '<div class="empty-state">Nenhuma foto compartilhada ainda.</div>';
  }

  async function load() {
    try {
      await StudentPortal.init();
      progressData = await StudentPortal.api('/api/student/progress');
      const assessments = progressData.assessments || [];
      renderSummary(assessments); renderAnalysis(progressData.analysis); renderHistory(assessments); renderPhotos(assessments);
    } catch (error) { setStatus(`Erro: ${error.message}`, true); }
  }

  function preview(source) { const image = p('student-assessment-photo-preview'); const empty = p('student-assessment-photo-empty'); image.hidden = !source; empty.hidden = Boolean(source); image.src = source || ''; }
  async function uploadPhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('Escolha JPG, PNG, GIF ou WebP.');
    if (file.size > maxPhotoBytes) throw new Error('A imagem não pode ultrapassar 5 MB.');
    const form = new FormData(); form.append('file', file, file.name);
    const response = await fetch(`${StudentPortal.apiBase}/api/editor/images`, { method: 'POST', headers: { Authorization: `Bearer ${StudentPortal.token}` }, body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a foto.');
    return data.location || '';
  }

  async function saveAssessment(event) {
    event.preventDefault();
    const button = p('student-assessment-submit');
    try {
      button.disabled = true; setFormStatus('Salvando nova medição...');
      const file = p('student-assessment-photo').files?.[0];
      const photoUrl = file ? await uploadPhoto(file) : '';
      const fields = { assessment_date: p('student-assessment-date').value || null, weight_kg: p('student-weight').value, height_cm: p('student-height').value, body_fat_percent: p('student-fat').value, waist_cm: p('student-waist').value, chest_cm: p('student-chest').value, hip_cm: p('student-hip').value, biceps_cm: p('student-biceps').value, thigh_cm: p('student-thigh').value, photo_url: photoUrl, notes: p('student-assessment-notes').value.trim() };
      await StudentPortal.api('/api/student/progress/assessment', { method: 'POST', body: JSON.stringify(fields) });
      p('student-assessment-form').reset(); p('student-assessment-date').value = localDate(); preview(''); closeAssessmentModal(); setStatus('Nova medição adicionada ao histórico.'); await load();
    } catch (error) { setFormStatus(`Erro: ${error.message}`, true); } finally { button.disabled = false; }
  }

  function closeAssessmentModal() { p('student-assessment-modal').classList.add('hidden'); }

  p('student-assessment-date').value = localDate();
  p('student-assessment-photo').addEventListener('change', (event) => { const file = event.target.files?.[0]; if (file) preview(URL.createObjectURL(file)); });
  p('open-student-assessment').addEventListener('click', () => { p('student-assessment-modal').classList.remove('hidden'); setFormStatus(''); setTimeout(() => p('student-assessment-date').focus(), 0); });
  p('student-assessment-close').addEventListener('click', closeAssessmentModal);
  p('student-assessment-cancel').addEventListener('click', closeAssessmentModal);
  p('student-assessment-modal').addEventListener('click', (event) => { if (event.target === p('student-assessment-modal')) closeAssessmentModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !p('student-assessment-modal').classList.contains('hidden')) closeAssessmentModal(); });
  p('student-assessment-form').addEventListener('submit', saveAssessment);
  load();
}());
