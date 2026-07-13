(function () {
  const p = (id) => document.getElementById(id);
  const value = (item, key, suffix = '') => item?.[key] == null || item[key] === '' ? '-' : `${item[key]}${suffix}`;
  function entity(title, subtitle, detail) {
    const li = document.createElement('li'); li.className = 'entity-card';
    li.innerHTML = `<div class="entity-main"><strong>${StudentPortal.escapeHtml(title)}</strong><span>${StudentPortal.escapeHtml(subtitle)}</span><span>${StudentPortal.escapeHtml(detail || '')}</span></div>`;
    return li;
  }
  async function load() {
    try {
      await StudentPortal.init();
      const data = await StudentPortal.api('/api/student/progress');
      const assessments = data.assessments || [];
      const latest = assessments[0];
      p('student-progress-summary').innerHTML = [['Peso', value(latest, 'weight_kg', ' kg')], ['Gordura', value(latest, 'body_fat_percent', '%')], ['Massa muscular', value(latest, 'muscle_mass_kg', ' kg')]].map(([label, content]) => `<div class="student-stat"><span>${label}</span><strong>${StudentPortal.escapeHtml(content)}</strong></div>`).join('');
      const list = p('student-progress-list'); list.innerHTML = '';
      assessments.forEach((item) => list.appendChild(entity(new Date(`${item.assessment_date}T12:00:00`).toLocaleDateString('pt-BR'), `Peso ${value(item, 'weight_kg', ' kg')} · Gordura ${value(item, 'body_fat_percent', '%')}`, `Massa muscular ${value(item, 'muscle_mass_kg', ' kg')} · Cintura ${value(item, 'waist_cm', ' cm')}`)));
      if (!assessments.length) { const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = 'Nenhuma avaliação registrada ainda.'; list.appendChild(empty); }
      const photos = p('student-photo-grid'); photos.innerHTML = '';
      assessments.filter((item) => item.photo_url).forEach((item) => { const figure = document.createElement('figure'); figure.className = 'student-photo-card'; figure.innerHTML = `<img src="${StudentPortal.escapeHtml(item.photo_url)}" alt="Foto de evolução" loading="lazy"><figcaption>${StudentPortal.escapeHtml(new Date(`${item.assessment_date}T12:00:00`).toLocaleDateString('pt-BR'))}</figcaption>`; photos.appendChild(figure); });
      if (!photos.children.length) photos.innerHTML = '<div class="empty-state">Nenhuma foto compartilhada ainda.</div>';
      p('student-progress-status').textContent = 'Evolução carregada.';
    } catch (error) { p('student-progress-status').textContent = `Erro: ${error.message}`; }
  }
  load();
}());
