(function () {
  const p = (id) => document.getElementById(id);
  const maxPhotoBytes = 5 * 1024 * 1024;
  let progressData = { assessments: [], goals: [], analysis: null };
  let historyPage = 1;
  const historyPageSize = 5;
  const measurementFields = ['weight_kg', 'height_cm', 'body_fat_percent', 'muscle_mass_kg', 'waist_cm', 'chest_cm', 'hip_cm', 'biceps_cm', 'back_cm', 'left_arm_cm', 'right_arm_cm', 'left_thigh_cm', 'right_thigh_cm', 'resting_heart_rate'];

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

  function hasMeasurement(valueToCheck) { return valueToCheck !== undefined && valueToCheck !== null && valueToCheck !== ''; }
  function carryForwardAssessments(assessments) {
    const rows = assessments.map((assessment) => ({ ...assessment }));
    const lastKnown = {};
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      measurementFields.forEach((field) => {
        if (hasMeasurement(rows[index][field])) lastKnown[field] = rows[index][field];
        else if (hasMeasurement(lastKnown[field])) rows[index][field] = lastKnown[field];
      });
    }
    return rows;
  }
  function normalized(valueToNormalize) { return String(valueToNormalize || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function goalMeasurementField(type) {
    const name = normalized(type);
    return [
      [['peso', 'weight', 'kg', 'quilo', 'emagrecer'], 'weight_kg'],
      [['gordura', 'body fat'], 'body_fat_percent'],
      [['massa muscular', 'musculo'], 'muscle_mass_kg'],
      [['cintura'], 'waist_cm'], [['peito', 'torax'], 'chest_cm'], [['quadril'], 'hip_cm'],
      [['biceps', 'braco'], 'biceps_cm'], [['coxa'], 'left_thigh_cm'], [['altura'], 'height_cm']
    ].find(([terms]) => terms.some((term) => name.includes(term)))?.[1] || null;
  }
  function goalReached(goal, current, previous) {
    if (goal?.status !== 'active') return false;
    const field = goalMeasurementField(goal.goal_type);
    const target = Number(goal.target_value); const currentValue = Number(current?.[field]); const previousValue = Number(previous?.[field]);
    if (!field || !hasMeasurement(goal.target_value) || !hasMeasurement(current?.[field]) || !Number.isFinite(target) || !Number.isFinite(currentValue)) return false;
    if (currentValue === target) return true;
    if (!hasMeasurement(previous?.[field]) || !Number.isFinite(previousValue)) return false;
    return previousValue > target ? currentValue <= target : previousValue < target ? currentValue >= target : true;
  }
  async function completeReachedGoals(goals, assessments) {
    const reached = goals.filter((goal) => goalReached(goal, assessments[0], assessments[1]));
    const results = await Promise.allSettled(reached.map((goal) => StudentPortal.api(`/api/student/goals/${encodeURIComponent(goal.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ goal_type: goal.goal_type, target_value: goal.target_value, target_date: goal.target_date ? String(goal.target_date).slice(0, 10) : '', status: 'completed', notes: goal.notes || '' })
    })));
    return reached.filter((_, index) => results[index].status === 'fulfilled').map((goal) => ({ ...goal, status: 'completed' }));
  }
  function clientAnalysis(current, baseline, fallback) {
    if (!current || !baseline || current.id === baseline.id) return fallback;
    const deltaFor = (field) => hasMeasurement(current[field]) && hasMeasurement(baseline[field]) ? Number((Number(current[field]) - Number(baseline[field])).toFixed(2)) : null;
    const delta = { weight_kg: deltaFor('weight_kg'), body_fat_percent: deltaFor('body_fat_percent'), muscle_mass_kg: deltaFor('muscle_mass_kg'), waist_cm: deltaFor('waist_cm') };
    const signals = [];
    if (delta.weight_kg) signals.push(`peso ${delta.weight_kg < 0 ? 'reduziu' : 'subiu'} ${Math.abs(delta.weight_kg).toFixed(2).replace('.', ',')} kg`);
    if (delta.body_fat_percent) signals.push(`gordura corporal ${delta.body_fat_percent < 0 ? 'caiu' : 'subiu'} ${Math.abs(delta.body_fat_percent).toFixed(2).replace('.', ',')} p.p.`);
    if (delta.muscle_mass_kg) signals.push(`massa muscular ${delta.muscle_mass_kg > 0 ? 'subiu' : 'caiu'} ${Math.abs(delta.muscle_mass_kg).toFixed(2).replace('.', ',')} kg`);
    if (delta.waist_cm) signals.push(`cintura ${delta.waist_cm < 0 ? 'reduziu' : 'subiu'} ${Math.abs(delta.waist_cm).toFixed(2).replace('.', ',')} cm`);
    if (!signals.length) signals.push('suas medidas corporais foram mantidas');
    return { ...(fallback || {}), status: 'comparison', title: 'Análise inteligente do progresso', message: fallback?.estimated_fields?.length ? fallback.message : `Desde sua medição inicial, ${signals.join(' e ')}.`, delta, projection: null };
  }

  function measurementDelta(current, previous, field) {
    if (!hasMeasurement(current?.[field]) || !hasMeasurement(previous?.[field])) return null;
    const currentValue = Number(current[field]); const previousValue = Number(previous[field]);
    return Number.isFinite(currentValue) && Number.isFinite(previousValue) ? Number((currentValue - previousValue).toFixed(2)) : null;
  }
  function deltaLabel(delta, suffix) {
    if (delta === null) return 'Sem comparação';
    if (delta === 0) return 'Manteve';
    return `${delta > 0 ? '+' : ''}${number(delta, suffix)}`;
  }
  function progressPhrase(field, delta) {
    if (delta === null) return 'Aguardando outra medição';
    if (delta === 0) return 'Valor mantido';
    const amount = number(Math.abs(delta), field === 'body_fat_percent' ? ' p.p.' : field === 'waist_cm' ? ' cm' : ' kg');
    if (field === 'weight_kg') return delta < 0 ? `Você perdeu ${amount}` : `Você ganhou ${amount}`;
    if (field === 'body_fat_percent') return delta < 0 ? `Gordura reduziu ${amount}` : `Gordura aumentou ${amount}`;
    if (field === 'muscle_mass_kg') return delta > 0 ? `Você ganhou ${amount} de músculo` : `Massa muscular reduziu ${amount}`;
    return delta < 0 ? `Sua cintura afinou ${amount}` : `Cintura aumentou ${amount}`;
  }
  function sparkline(assessments, field, currentValue) {
    const chronological = assessments.slice().reverse();
    const values = chronological.filter((item) => hasMeasurement(item[field])).map((item) => Number(item[field])).filter(Number.isFinite);
    if (values.length && hasMeasurement(currentValue) && Number.isFinite(Number(currentValue))) values[values.length - 1] = Number(currentValue);
    if (values.length < 2) return '<div class="progress-analysis-sparkline-empty" aria-hidden="true"></div>';
    const minimum = Math.min(...values); const maximum = Math.max(...values); const range = maximum - minimum || 1;
    const points = values.map((item, index) => `${4 + (index * 92 / (values.length - 1))},${28 - ((item - minimum) * 24 / range)}`).join(' ');
    return `<svg class="progress-analysis-sparkline" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}"></polyline></svg>`;
  }

  function closeGoalCelebration() { p('student-goal-celebration')?.classList.add('hidden'); }
  function showGoalCelebration(goals) {
    if (!Array.isArray(goals) || !goals.length) return;
    const names = goals.map((goal) => goal.goal_type || 'sua meta').join(', ');
    p('student-goal-celebration-message').textContent = goals.length === 1
      ? `Você atingiu a meta “${names}”. Seu resultado foi reconhecido automaticamente pela nova medição.`
      : `Você atingiu ${goals.length} metas: ${names}. Seus resultados foram reconhecidos automaticamente.`;
    const confetti = p('student-confetti');
    confetti.replaceChildren();
    const colors = ['#1478d4', '#4bbf73', '#ffca3a', '#ff6b6b', '#8f6ee8'];
    for (let index = 0; index < 48; index += 1) {
      const piece = document.createElement('i');
      piece.style.setProperty('--confetti-x', `${(index * 37) % 100}%`);
      piece.style.setProperty('--confetti-delay', `${(index % 12) * 0.06}s`);
      piece.style.setProperty('--confetti-color', colors[index % colors.length]);
      piece.style.setProperty('--confetti-turn', `${180 + (index % 5) * 90}deg`);
      confetti.appendChild(piece);
    }
    p('student-goal-celebration').classList.remove('hidden');
  }

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

  function renderBaselineDashboard(current, baseline) {
    const target = p('student-progress-baseline');
    if (!baseline) {
      target.innerHTML = '<div class="empty-state">Preencha seus dados corporais iniciais no perfil para começar a comparação.</div>';
      p('student-progress-baseline-date').textContent = 'Sua primeira medição será usada como ponto de partida.';
      return;
    }
    const startWeight = Number(baseline.weight_kg);
    const currentWeight = Number(current?.weight_kg);
    const difference = hasMeasurement(baseline.weight_kg) && hasMeasurement(current?.weight_kg) && Number.isFinite(startWeight) && Number.isFinite(currentWeight) ? Number((currentWeight - startWeight).toFixed(2)) : null;
    const differenceText = difference === null ? '-' : difference === 0 ? 'Mantido' : `${difference > 0 ? '+' : ''}${number(difference, ' kg')}`;
    target.innerHTML = [
      ['Peso inicial', number(baseline.weight_kg, ' kg')], ['Peso atual', number(current?.weight_kg, ' kg')],
      ['Diferença total', differenceText], ['Altura inicial', number(baseline.height_cm, ' cm')]
    ].map(([label, content]) => `<div><span>${escape(label)}</span><strong>${escape(content)}</strong></div>`).join('');
    p('student-progress-baseline-date').textContent = `Início registrado em ${dateLabel(baseline.assessment_date)}.`;
  }

  function renderAnalysis(analysis, assessments, recentAnalysis) {
    const target = p('student-progress-analysis');
    if (!analysis) { target.innerHTML = ''; return; }
    const projection = analysis.projection;
    const current = assessments[0]; const previous = assessments[1];
    const metrics = [
      ['weight_kg', 'Peso', ' kg'], ['body_fat_percent', 'Gordura corporal', '%'],
      ['muscle_mass_kg', 'Massa muscular', ' kg'], ['waist_cm', 'Cintura', ' cm']
    ];
    const comparison = current ? `<div class="progress-analysis-comparison-header"><strong>Da medição anterior para agora</strong><span>${previous ? `${dateLabel(previous.assessment_date)} → ${dateLabel(current.assessment_date)}` : 'Registre outra medição para comparar'}</span></div><div class="progress-analysis-metrics">${metrics.map(([field, label, suffix]) => {
      const intelligentMetric = recentAnalysis?.metrics?.[field];
      const delta = intelligentMetric?.delta ?? measurementDelta(current, previous, field);
      const displayValue = intelligentMetric?.value ?? current[field];
      const previousValue = intelligentMetric?.previous ?? previous?.[field];
      const estimated = intelligentMetric?.source === 'estimated';
      const previousText = hasMeasurement(previousValue) ? `Antes: ${number(previousValue, suffix)} · ` : '';
      return `<article class="progress-analysis-metric${estimated ? ' is-estimated' : ''}"><div class="progress-analysis-metric-heading"><span>${escape(label)}</span><b class="${delta === 0 ? 'is-neutral' : delta === null ? 'is-muted' : 'has-change'}">${escape(deltaLabel(delta, field === 'body_fat_percent' ? ' p.p.' : suffix))}</b></div><strong>${estimated ? '≈ ' : ''}${escape(number(displayValue, suffix))}</strong><small>${escape(`${previousText}${progressPhrase(field, delta)}`)}</small>${sparkline(assessments, field, displayValue)}</article>`;
    }).join('')}</div>` : '';
    target.innerHTML = `<div class="progress-analysis"><h3>${escape(analysis.title || 'Análise inteligente do progresso')}</h3>${comparison}${projection ? `<div class="progress-analysis-projection"><div><span>Projeção de peso · 3 meses</span><strong>${escape(number(projection.weight_kg, ' kg'))}</strong></div><div><span>Projeção de gordura</span><strong>${escape(number(projection.body_fat_percent, '%'))}</strong></div><div><span>Projeção de massa muscular</span><strong>${escape(number(projection.muscle_mass_kg, ' kg'))}</strong></div><div><span>Projeção de cintura</span><strong>${escape(number(projection.waist_cm, ' cm'))}</strong></div></div>` : ''}</div>`;
  }

  function renderHistory(assessments) {
    const list = p('student-progress-list'); list.innerHTML = '';
    const pagination = p('student-history-pagination'); pagination.replaceChildren();
    const totalPages = Math.max(1, Math.ceil(assessments.length / historyPageSize));
    historyPage = Math.min(Math.max(1, historyPage), totalPages);
    const start = (historyPage - 1) * historyPageSize;
    assessments.slice(start, start + historyPageSize).forEach((item) => {
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
    if (!assessments.length) { const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = 'Nenhuma avaliação registrada ainda.'; list.appendChild(empty); return; }
    const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '‹'; previous.setAttribute('aria-label', 'Página anterior'); previous.disabled = historyPage === 1;
    const indicator = document.createElement('span'); indicator.textContent = `${historyPage} de ${totalPages}`;
    const next = document.createElement('button'); next.type = 'button'; next.textContent = '›'; next.setAttribute('aria-label', 'Próxima página'); next.disabled = historyPage === totalPages;
    previous.addEventListener('click', () => { historyPage -= 1; renderHistory(assessments); });
    next.addEventListener('click', () => { historyPage += 1; renderHistory(assessments); });
    pagination.append(previous, indicator, next);
  }

  async function load() {
    try {
      await StudentPortal.init();
      progressData = await StudentPortal.api('/api/student/progress');
      const assessments = carryForwardAssessments(progressData.assessments || []);
      const baseline = progressData.baseline || assessments.at(-1) || null;
      const clientCompletedGoals = await completeReachedGoals(progressData.goals || [], assessments);
      historyPage = 1;
      renderBaselineDashboard(assessments[0], baseline); renderSummary(assessments); renderAnalysis(clientAnalysis(assessments[0], baseline, progressData.analysis), assessments, progressData.recent_analysis); renderHistory(assessments);
      showGoalCelebration([...(progressData.completed_goals || []), ...clientCompletedGoals]);
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
      const result = await StudentPortal.api('/api/student/progress/assessment', { method: 'POST', body: JSON.stringify(fields) });
      p('student-assessment-form').reset(); p('student-assessment-date').value = localDate(); preview(''); closeAssessmentModal(); setStatus('Nova medição adicionada ao histórico.'); await load();
      showGoalCelebration(result.completed_goals);
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
  p('student-goal-celebration-later').addEventListener('click', closeGoalCelebration);
  p('student-goal-celebration-new').addEventListener('click', () => { window.location.href = './student-goals.html?new=1'; });
  p('student-goal-celebration').addEventListener('click', (event) => { if (event.target === p('student-goal-celebration')) closeGoalCelebration(); });
  load();
}());
