const trainingHost = window.location.hostname || 'localhost';
const TRAINING_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${trainingHost}:3004`;
const trainingToken = localStorage.getItem('academiaToken') || '';
let members = [];
let exercises = [];
let plans = [];
let days = [];
let trainingLevels = [];
let editingExerciseId = null;
let editingOriginalVideoUrl = '';
let editingPlanId = null;
let planDayDrafts = new Map();
let activePlanWeekday = null;
let exerciseLibraryQuery = '';
let exercisePrimaryFilter = '';
let exerciseSecondaryFilter = '';
let planLibraryQuery = '';
let exercisePage = 1;
let planPage = 1;
let currentTrainingReview = null;
let targetExerciseForPlan = null;
const TRAINING_PAGE_SIZE = 5;

const t = (id) => document.getElementById(id);

function trainingActionIcon(type, label, className = '') {
  const iconType = type === 'delete' ? 'trash' : (type === 'add' ? 'plus' : type);
  if (window.AcademiaIcons) return window.AcademiaIcons.button(iconType, label, className);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-button action-icon-button ${className}`.trim();
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = type === 'edit'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>'
    : (iconType === 'plus'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6v14H5V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>');
  return button;
}

function trainingMobileMenu(label, items) {
  const wrap = document.createElement('div');
  wrap.className = 'mobile-card-menu';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'mobile-card-menu-trigger';
  trigger.textContent = '⋮';
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('aria-expanded', 'false');
  const dropdown = document.createElement('div');
  dropdown.className = 'mobile-card-menu-dropdown hidden';
  for (const item of items) {
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = item.label;
    if (item.danger) action.classList.add('danger');
    action.addEventListener('click', async (event) => {
      event.stopPropagation();
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      wrap.closest('li')?.style.removeProperty('z-index');
      await item.run(action);
    });
    dropdown.appendChild(action);
  }
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = dropdown.classList.contains('hidden');
    document.querySelectorAll('.mobile-card-menu-dropdown').forEach((menu) => menu.classList.add('hidden'));
    document.querySelectorAll('.mobile-card-menu-trigger').forEach((button) => button.setAttribute('aria-expanded', 'false'));
    document.querySelectorAll('#exercise-list li, #plan-list li').forEach((li) => li.style.removeProperty('z-index'));
    dropdown.classList.toggle('hidden', !willOpen);
    trigger.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) {
      wrap.closest('li')?.style.setProperty('z-index', '1200', 'important');
    }
  });
  wrap.addEventListener('click', (event) => event.stopPropagation());
  wrap.addEventListener('keydown', (event) => event.stopPropagation());
  wrap.append(trigger, dropdown);
  return wrap;
}

document.addEventListener('click', () => {
  document.querySelectorAll('.mobile-card-menu-dropdown').forEach((menu) => menu.classList.add('hidden'));
  document.querySelectorAll('.mobile-card-menu-trigger').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  document.querySelectorAll('#exercise-list li, #plan-list li').forEach((li) => li.style.removeProperty('z-index'));
});

function setTrainingStatus(text) {
  t('training-status').textContent = text;
}

async function api(path, options = {}) {
  const headers = {
    Authorization: `Bearer ${trainingToken}`,
    ...(options.headers || {})
  };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${TRAINING_API_BASE_URL}${path}`, {
    ...options,
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function fillSelect(id, rows, label, empty) {
  const select = t(id);
  select.innerHTML = '';
  const first = document.createElement('option');
  first.value = '';
  first.textContent = empty;
  select.appendChild(first);
  for (const row of rows) {
    const option = document.createElement('option');
    option.value = row.id;
    option.textContent = label(row);
    select.appendChild(option);
  }
}

function planDisplayName(plan) {
  return plan.name && plan.name !== plan.member_name ? `${plan.member_name} - ${plan.name}` : plan.member_name;
}

function appendExerciseImage(container, url, alt = 'Demonstração do exercício') {
  if (!container || !url) return false;
  const image = document.createElement('img');
  image.className = 'exercise-image-preview';
  image.alt = alt;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.src = url;
  image.addEventListener('error', () => image.remove(), { once: true });
  container.appendChild(image);
  return true;
}

const defaultTrainingLevels = [
  { slug: 'frango', name: 'Frango', is_active: true },
  { slug: 'intermediario', name: 'Intermediario', is_active: true },
  { slug: 'avancado', name: 'Avancado', is_active: true }
];

function fillLevelSelect(id) {
  const select = t(id);
  const selected = select.value;
  const activeLevels = (trainingLevels.length ? trainingLevels : defaultTrainingLevels).filter((level) => level.is_active !== false);
  select.innerHTML = '';
  for (const level of activeLevels) {
    const option = document.createElement('option');
    option.value = level.slug;
    option.textContent = level.name;
    option.selected = level.slug === selected;
    select.appendChild(option);
  }
  if (!activeLevels.some((level) => level.slug === selected) && activeLevels[0]) select.value = activeLevels[0].slug;
}

function canManageTrainingLevels() {
  if (['owner', 'admin'].includes(localStorage.getItem('academiaRole'))) return true;
  try { return JSON.parse(localStorage.getItem('academiaAccessPermissions') || '{}').training === true; } catch (_) { return false; }
}

function setTrainingLevelStatus(text) {
  t('training-level-status').textContent = text;
}

function renderTrainingLevels() {
  const panel = t('training-levels-panel');
  const list = t('training-level-list');
  if (!canManageTrainingLevels()) {
    panel.hidden = true;
    t('open-training-levels-button')?.setAttribute('hidden', 'hidden');
    t('open-plan-levels-button')?.setAttribute('hidden', 'hidden');
    return;
  }
  panel.hidden = false;
  t('open-training-levels-button')?.removeAttribute('hidden');
  t('open-plan-levels-button')?.removeAttribute('hidden');
  list.innerHTML = '';
  for (const level of trainingLevels) {
    const item = document.createElement('li');
    const form = document.createElement('form');
    form.className = 'training-level-row';

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `status-toggle-dot ${level.is_active ? 'is-active' : 'is-inactive'}`;
    dot.title = level.is_active ? 'Nível ativo (clique para desativar)' : 'Nível inativo (clique para ativar)';
    dot.setAttribute('aria-label', level.is_active ? 'Desativar nível' : 'Ativar nível');
    dot.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextActive = !level.is_active;
      level.is_active = nextActive;
      dot.className = `status-toggle-dot ${nextActive ? 'is-active' : 'is-inactive'}`;
      dot.title = nextActive ? 'Nível ativo (clique para desativar)' : 'Nível inativo (clique para ativar)';
      dot.setAttribute('aria-label', nextActive ? 'Desativar nível' : 'Ativar nível');
      try {
        await api('/api/training/levels/update', {
          method: 'POST',
          body: JSON.stringify({ id: level.id, name: input.value.trim(), is_active: nextActive })
        });
        setTrainingLevelStatus(`Nível "${level.name}" ${nextActive ? 'ativado' : 'desativado'}.`);
        await loadBase();
      } catch (error) {
        level.is_active = !nextActive;
        dot.className = `status-toggle-dot ${level.is_active ? 'is-active' : 'is-inactive'}`;
        setTrainingLevelStatus(`Erro: ${error.message}`);
      }
    });

    const input = document.createElement('input');
    input.value = level.name;
    input.maxLength = 60;
    input.required = true;
    input.setAttribute('aria-label', `Nome do nivel ${level.name}`);

    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'mini-button';
    save.textContent = 'Salvar';

    const remove = trainingActionIcon('delete', 'Excluir este nível', 'danger');
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Excluir o nível "${level.name}"?`)) return;
      remove.disabled = true;
      try {
        await api('/api/training/levels', { method: 'DELETE', body: JSON.stringify({ id: level.id }) });
        setTrainingLevelStatus('Nível excluído.');
        await loadBase();
      } catch (error) {
        const message = error.message === 'nivel_em_uso' ? 'Esse nível já está sendo usado. Desative-o para não aparecer em novos cadastros.' : `Erro: ${error.message}`;
        setTrainingLevelStatus(message);
      } finally {
        remove.disabled = false;
      }
    });

    form.append(dot, input, save, remove);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        await api('/api/training/levels/update', {
          method: 'POST',
          body: JSON.stringify({ id: level.id, name: input.value.trim(), is_active: level.is_active })
        });
        setTrainingLevelStatus('Nivel atualizado.');
        await loadBase();
      } catch (error) {
        setTrainingLevelStatus(`Erro: ${error.message}`);
      } finally {
        save.disabled = false;
      }
    });
    item.appendChild(form);
    list.appendChild(item);
  }
}

async function loadBase() {
  if (!trainingToken) {
    setTrainingStatus('Entre no painel principal antes de acessar treinos.');
    return;
  }
  const memberResult = await api('/api/members');
  const exerciseResult = await api('/api/training/exercises');
  const planResult = await api('/api/training/plans');
  const levelResult = await api('/api/training/levels');
  members = memberResult.data || [];
  exercises = exerciseResult.data || [];
  plans = planResult.data || [];
  trainingLevels = levelResult.data || [];
  renderAll();
  setTrainingStatus('');
  checkUrlAction();
  setupMobileTrainingTabs();
}

function setupMobileTrainingTabs() {
  const tabExercises = t('tab-exercises-btn');
  const tabPlans = t('tab-plans-btn');
  const panelExercises = t('panel-exercises');
  const panelPlans = t('panel-plans');

  if (!tabExercises || !tabPlans || !panelExercises || !panelPlans) return;
  if (tabExercises.dataset.tabsBound === 'true') return;
  tabExercises.dataset.tabsBound = 'true';

  function applyTab(target) {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) {
      panelExercises.classList.remove('mobile-panel-hidden');
      panelPlans.classList.remove('mobile-panel-hidden');
      return;
    }

    if (target === 'exercises') {
      tabExercises.classList.add('active');
      tabExercises.setAttribute('aria-selected', 'true');
      tabPlans.classList.remove('active');
      tabPlans.setAttribute('aria-selected', 'false');
      panelExercises.classList.remove('mobile-panel-hidden');
      panelPlans.classList.add('mobile-panel-hidden');
    } else {
      tabPlans.classList.add('active');
      tabPlans.setAttribute('aria-selected', 'true');
      tabExercises.classList.remove('active');
      tabExercises.setAttribute('aria-selected', 'false');
      panelPlans.classList.remove('mobile-panel-hidden');
      panelExercises.classList.add('mobile-panel-hidden');
    }
  }

  tabExercises.addEventListener('click', () => applyTab('exercises'));
  tabPlans.addEventListener('click', () => applyTab('plans'));

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      panelExercises.classList.remove('mobile-panel-hidden');
      panelPlans.classList.remove('mobile-panel-hidden');
    } else {
      const activeTab = tabExercises.classList.contains('active') ? 'exercises' : 'plans';
      applyTab(activeTab);
    }
  });

  if (window.innerWidth <= 768) {
    applyTab('exercises');
  }
}

function checkUrlAction() {
  const urlParams = new URLSearchParams(window.location.search);
  const targetPlanId = urlParams.get('plan_id') || urlParams.get('review_plan_id');
  const targetAction = urlParams.get('action');

  if (targetPlanId) {
    const reviewSelect = t('review-plan');
    if (reviewSelect) {
      reviewSelect.value = targetPlanId;
      reviewSelect.dispatchEvent(new Event('change'));
    }
    if (targetAction === 'edit') {
      const planItem = plans.find((p) => String(p.id) === String(targetPlanId));
      if (planItem) openPlanForm(planItem);
    } else {
      openTrainingModal('review-modal');
      setTimeout(() => {
        t('review-plan-button')?.click();
      }, 50);
    }
  }
}

function normalizeExerciseFilterValue(value) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR');
}

function getExerciseFilterValues(type) {
  const values = new Set();
  for (const item of exercises) {
    const source = type === 'secondary'
      ? item.muscle_group_secondary
      : (item.muscle_group_primary || item.muscle_group);
    if (type === 'secondary') {
      String(source || '').split(',').map((value) => value.trim()).filter(Boolean).forEach((value) => values.add(value));
    } else if (String(source || '').trim()) {
      values.add(String(source).trim());
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function fillExerciseFilter(id, values, selectedValue) {
  const select = t(id);
  if (!select) return;
  select.replaceChildren();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'Todos';
  select.appendChild(all);
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  select.value = values.includes(selectedValue) ? selectedValue : '';
}

function renderExerciseFilters() {
  fillExerciseFilter('exercise-primary-filter', getExerciseFilterValues('primary'), exercisePrimaryFilter);
  fillExerciseFilter('exercise-secondary-filter', getExerciseFilterValues('secondary'), exerciseSecondaryFilter);
}

function getVisibleExercises() {
  const query = normalizeExerciseFilterValue(exerciseLibraryQuery);
  const primary = normalizeExerciseFilterValue(exercisePrimaryFilter);
  const secondary = normalizeExerciseFilterValue(exerciseSecondaryFilter);
  return exercises.filter((item) => {
    const name = normalizeExerciseFilterValue(item.name);
    const primaryValue = normalizeExerciseFilterValue(item.muscle_group_primary || item.muscle_group);
    const secondaryValue = normalizeExerciseFilterValue(item.muscle_group_secondary);
    const equipment = normalizeExerciseFilterValue(item.equipment);
    const matchesQuery = !query || [name, primaryValue, secondaryValue, equipment].some((value) => value.includes(query));
    return matchesQuery && (!primary || primaryValue === primary) && (!secondary || secondaryValue.includes(secondary));
  });
}

function renderAll({ libraryOnly = false } = {}) {
  if (!libraryOnly) {
    fillLevelSelect('exercise-level');
    fillLevelSelect('profile-level');
    fillLevelSelect('plan-level');
    fillSelect('profile-member', members, (m) => m.name, 'Selecione o aluno');
    fillSelect('plan-member', members, (m) => m.name, 'Selecione o aluno');
    fillSelect('exercise-select', exercises, (e) => `${e.name} - ${e.muscle_group_primary || e.muscle_group}`, 'Selecione o exercicio');
    fillSelect('day-plan', plans, (p) => planDisplayName(p), 'Selecione a ficha');
    fillSelect('review-plan', plans, (p) => `${planDisplayName(p)} (${p.age_days || 0} dias)`, 'Selecione a ficha');
    renderTrainingLevels();
    renderExerciseFilters();
  }

  const exerciseList = t('exercise-list');
  exerciseList.innerHTML = '';
  const visibleExercises = getVisibleExercises();
  const exercisePages = Math.max(1, Math.ceil(visibleExercises.length / TRAINING_PAGE_SIZE));
  exercisePage = Math.min(exercisePages, Math.max(1, exercisePage));
  const renderedExercises = visibleExercises.slice((exercisePage - 1) * TRAINING_PAGE_SIZE, exercisePage * TRAINING_PAGE_SIZE);
  window.AdminPagination?.render(t('exercise-pagination'), {
    page: exercisePage,
    total: visibleExercises.length,
    pageSize: TRAINING_PAGE_SIZE,
    onChange: (page) => { exercisePage = page; renderAll({ libraryOnly: true }); }
  });
  const libraryStatus = t('exercise-library-status');
  if (libraryStatus) {
    libraryStatus.textContent = '';
  }
  for (const item of renderedExercises) {
    const row = document.createElement('li');
    row.className = 'entity-card exercise-card';
    if (item.is_active === false) row.classList.add('is-inactive');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Exercício ${item.name}`);

    const isMobile = () => window.innerWidth <= 768;

    row.addEventListener('click', (event) => {
      if (event.target.closest('.entity-actions, .mobile-card-menu, .exercise-card-add-btn, button, input, select')) return;
      if (isMobile()) {
        selectExerciseForPlan(item);
      } else {
        openExerciseDetails(item);
      }
    });

    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (isMobile()) {
          selectExerciseForPlan(item);
        } else {
          openExerciseDetails(item);
        }
      }
    });

    const header = document.createElement('div');
    header.className = 'exercise-card-header';

    const main = document.createElement('div');
    main.className = 'entity-main exercise-card-title-wrap';
    const name = document.createElement('strong');
    name.textContent = item.name;

    const level = trainingLevels.find((candidate) => candidate.slug === item.level);
    const primaryMuscle = item.muscle_group_primary || item.muscle_group || 'Geral';
    const secondaryMuscles = item.muscle_group_secondary ? ` · ${item.muscle_group_secondary}` : '';
    const status = item.is_active === false ? ' · Inativo' : '';

    const detail = document.createElement('span');
    detail.className = 'exercise-card-detail';
    detail.textContent = `${level?.name || item.level || 'Geral'}${secondaryMuscles}${status}`;

    const tag = document.createElement('span');
    tag.className = 'exercise-card-tag';
    tag.textContent = primaryMuscle;

    main.append(name, detail, tag);
    header.append(main);

    const media = document.createElement('div');
    media.className = 'video-preview-slot exercise-card-media';
    if (item.video_url && window.AcademiaTrainingMedia) {
      window.AcademiaTrainingMedia.appendVideoPreview(media, item.video_url);
      const thumbnailVideo = media.querySelector('video');
      if (thumbnailVideo) {
        thumbnailVideo.controls = false;
        thumbnailVideo.autoplay = true;
        thumbnailVideo.loop = true;
        thumbnailVideo.muted = true;
        thumbnailVideo.playsInline = true;
      }
    } else if (item.image_url) {
      appendExerciseImage(media, item.image_url, `Demonstração de ${item.name}`);
    } else {
      const emptyMedia = document.createElement('div');
      emptyMedia.className = 'exercise-card-media-placeholder';
      emptyMedia.innerHTML = '<span>Sem vídeo</span>';
      media.appendChild(emptyMedia);
    }

    const footer = document.createElement('div');
    footer.className = 'exercise-card-footer';

    if (item.instructions) {
      const caption = document.createElement('p');
      caption.className = 'exercise-card-caption';
      caption.textContent = item.instructions;
      footer.appendChild(caption);
    }

    const actionRow = document.createElement('div');
    actionRow.className = 'exercise-card-action-row';

    const mobileAddBtn = document.createElement('button');
    mobileAddBtn.type = 'button';
    mobileAddBtn.className = 'button exercise-card-mobile-add-btn';
    mobileAddBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.5;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span>Adicionar à ficha</span>';
    mobileAddBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      selectExerciseForPlan(item);
    });
    actionRow.appendChild(mobileAddBtn);

    const menuItems = [
      { label: 'Adicionar à ficha', run: () => selectExerciseForPlan(item) }
    ];
    if (canManageTrainingLevels()) {
      menuItems.push(
        { label: 'Editar', run: () => openExerciseForm(item) },
        { label: item.is_active === false ? 'Ativar' : 'Excluir', danger: item.is_active !== false, run: (button) => toggleExercise(item, button) }
      );
    }
    actionRow.appendChild(trainingMobileMenu(`Opções de ${item.name}`, menuItems));

    footer.appendChild(actionRow);
    row.append(header, media, footer);
    exerciseList.appendChild(row);
  }
  if (!renderedExercises.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhum exercício encontrado com esses filtros.';
    exerciseList.appendChild(empty);
  }

  if (libraryOnly) return;

  const planList = t('plan-list');
  planList.innerHTML = '';
  const normalizedPlanQuery = normalizeExerciseFilterValue(planLibraryQuery);
  const visiblePlans = plans.filter((item) => !normalizedPlanQuery || normalizeExerciseFilterValue(`${item.member_name || ''} ${item.name || ''}`).includes(normalizedPlanQuery));
  const planPages = Math.max(1, Math.ceil(visiblePlans.length / TRAINING_PAGE_SIZE));
  planPage = Math.min(planPages, Math.max(1, planPage));
  const renderedPlans = visiblePlans.slice((planPage - 1) * TRAINING_PAGE_SIZE, planPage * TRAINING_PAGE_SIZE);
  window.AdminPagination?.render(t('plan-pagination'), {
    page: planPage,
    total: visiblePlans.length,
    pageSize: TRAINING_PAGE_SIZE,
    onChange: (page) => { planPage = page; renderAll(); }
  });
  for (const item of renderedPlans) {
    const row = document.createElement('li');
    row.className = 'entity-card';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Visualizar ficha de ${item.member_name}`);
    row.addEventListener('click', (event) => {
      if (event.target.closest('.mobile-card-menu, button, input, select')) return;
      openPlanDetails(item);
    });
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPlanDetails(item); } });
    const main = document.createElement('div');
    main.className = 'entity-main';
    const level = trainingLevels.find((candidate) => candidate.slug === item.level);
    const name = document.createElement('strong');
    name.textContent = planDisplayName(item);
    const detail = document.createElement('span');
    detail.textContent = `${level?.name || item.level} · ${item.age_days || 0} dias`;
    main.append(name, detail);
    row.appendChild(main);
    if (canManageTrainingLevels()) {
      row.appendChild(trainingMobileMenu(`Opções da ficha de ${item.member_name}`, [
        { label: 'Editar', run: () => openPlanForm(item) },
        { label: 'Excluir', danger: true, run: (button) => deletePlan(item, button) }
      ]));
    }
    planList.appendChild(row);
  }
  if (!renderedPlans.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = planLibraryQuery ? 'Nenhuma ficha encontrada para esse aluno.' : 'Nenhuma ficha cadastrada.';
    planList.appendChild(empty);
  }
}

async function openPlanDetails(item) {
  try {
    const detail = await api(`/api/training/plans/detail?plan_id=${encodeURIComponent(item.id)}`);
    t('plan-view-title').textContent = detail.plan?.name || item.name || 'Detalhes da ficha';
    t('plan-view-member').textContent = item.member_name || 'Aluno';
    t('plan-view-meta').textContent = `Início: ${String(detail.plan?.starts_at || item.starts_at || '').slice(0, 10) || '-'} · ${detail.plan?.status === 'active' ? 'Ativa' : (detail.plan?.status || 'Sem status')}`;
    t('plan-view-goal').textContent = `Objetivo: ${detail.plan?.goal || 'Não informado'}`;
    t('plan-view-level').textContent = `Nível: ${trainingLevels.find((level) => level.slug === (detail.plan?.level || item.level))?.name || detail.plan?.level || 'Não informado'}`;
    t('plan-view-age').textContent = `${detail.plan?.age_days || item.age_days || 0} dias`;
    const byDay = new Map((detail.days || []).map((day) => [day.id, { ...day, exercises: [] }]));
    for (const exercise of detail.exercises || []) {
      if (!byDay.has(exercise.workout_day_id)) byDay.set(exercise.workout_day_id, { id: exercise.workout_day_id, title: exercise.day_title, weekday: exercise.weekday, exercises: [] });
      byDay.get(exercise.workout_day_id).exercises.push(exercise);
    }
    const container = t('plan-view-days');
    container.replaceChildren();
    if (!byDay.size) {
      const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Nenhum dia ou exercício foi montado nesta ficha.'; container.appendChild(empty);
    }
    for (const day of [...byDay.values()].sort((a, b) => Number(a.weekday || 0) - Number(b.weekday || 0))) {
      const section = document.createElement('section'); section.className = 'plan-view-day';
      const title = document.createElement('h4'); title.textContent = `${day.weekday ? `Dia ${day.weekday} · ` : ''}${day.title || 'Treino'}`;
      section.appendChild(title);
      if (day.notes) { const notes = document.createElement('p'); notes.textContent = day.notes; section.appendChild(notes); }
      const list = document.createElement('ul'); list.className = 'plan-view-exercises';
      for (const exercise of day.exercises || []) {
        const row = document.createElement('li');
        const name = document.createElement('strong'); name.textContent = exercise.exercise_name || 'Exercício';
        const dosage = document.createElement('small'); dosage.textContent = `${exercise.sets || '-'} séries · ${exercise.reps || '-'} repetições`;
        const rest = document.createElement('small'); rest.textContent = `${exercise.rest_seconds || '-'}s descanso`;
        row.append(name, dosage, rest); list.appendChild(row);
      }
      if (!list.children.length) { const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = 'Nenhum exercício neste dia.'; list.appendChild(empty); }
      section.appendChild(list); container.appendChild(section);
    }
    openTrainingModal('plan-view-modal');
  } catch (error) {
    setTrainingStatus(`Erro ao abrir ficha: ${error.message}`);
  }
}

function openExerciseDetails(item) {
  t('exercise-view-name').textContent = item.name || 'Exercício';
  const primaryMuscle = item.muscle_group_primary || item.muscle_group || 'Não informado';
  t('exercise-view-muscle').textContent = `Músculo principal: ${primaryMuscle}`;
  t('exercise-view-primary').textContent = primaryMuscle;
  t('exercise-view-secondary').textContent = item.muscle_group_secondary || 'Não informado';
  t('exercise-view-equipment').textContent = item.equipment || 'Peso livre ou equipamento não informado';
  t('exercise-view-level').textContent = trainingLevels.find((level) => level.slug === item.level)?.name || item.level || 'Não informado';
  t('exercise-view-instructions').textContent = item.instructions || 'Nenhuma orientação cadastrada para este exercício.';
  const media = t('exercise-view-media');
  media.replaceChildren();
  if (item.video_url && window.AcademiaTrainingMedia) {
    window.AcademiaTrainingMedia.appendVideoPreview(media, item.video_url);
  } else if (item.image_url) {
    appendExerciseImage(media, item.image_url, `Demonstração de ${item.name}`);
  } else {
    const empty = document.createElement('span');
    empty.className = 'exercise-view-media-empty';
    empty.textContent = 'Nenhuma demonstração cadastrada para este exercício.';
    media.appendChild(empty);
  }
  openTrainingModal('exercise-view-modal');
}

function openExerciseForm(item = null) {
  editingExerciseId = item?.id || null;
  editingOriginalVideoUrl = item?.video_url || '';
  t('exercise-title').textContent = item ? 'Editar exercício' : 'Novo exercício';
  t('create-exercise-button').textContent = 'Salvar';
  t('exercise-name').value = item?.name || '';
  t('exercise-group').value = item?.muscle_group_primary || item?.muscle_group || '';
  t('exercise-secondary-muscles').value = item?.muscle_group_secondary || '';
  t('exercise-equipment').value = item?.equipment || '';
  t('exercise-level').value = item?.level || '';
  t('exercise-instructions').value = item?.instructions || '';
  t('exercise-active').checked = item ? item.is_active !== false : true;
  t('exercise-video-file').value = '';
  t('exercise-video-url').value = item?.video_url || '';
  t('exercise-video-source').value = item?.video_url && !item.video_url.startsWith('/uploads/') ? 'link' : 'upload';
  setVideoSourceMode();
  if (item?.video_url) previewVideoLink(item.video_url);
  openTrainingModal('exercise-modal');
}

async function toggleExercise(item, button) {
  const action = item.is_active === false ? 'ativar' : 'excluir';
  if (!window.confirm(`${action === 'excluir' ? 'Excluir' : 'Ativar'} o exercício "${item.name}"?`)) return;
  button.disabled = true;
  try {
    if (action === 'ativar') {
      await api('/api/training/exercises/update', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id,
          name: item.name,
          muscle_group_primary: item.muscle_group_primary || item.muscle_group,
          muscle_group_secondary: item.muscle_group_secondary || '',
          equipment: item.equipment || '',
          level: item.level,
          instructions: item.instructions || '',
          video_url: item.video_url || '',
          image_url: item.image_url || '',
          is_active: true
        })
      });
      setTrainingStatus('Exercício ativado.');
    } else {
      await api('/api/training/exercises', { method: 'DELETE', body: JSON.stringify({ id: item.id }) });
      setTrainingStatus('Exercício excluído do catálogo.');
    }
    await loadBase();
  } catch (error) {
    setTrainingStatus(`Erro: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function createTrainingLevel(event) {
  event.preventDefault();
  const input = t('training-level-name');
  const button = event.submitter;
  button.disabled = true;
  try {
    await api('/api/training/levels', { method: 'POST', body: JSON.stringify({ name: input.value.trim() }) });
    input.value = '';
    setTrainingLevelStatus('Nivel adicionado.');
    await loadBase();
  } catch (error) {
    setTrainingLevelStatus(`Erro: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

const MAX_TRAINING_VIDEO_BYTES = 50 * 1024 * 1024;

function setVideoStatus(text) {
  t('exercise-video-status').textContent = text;
}

function clearVideoPreview() {
  const preview = t('exercise-video-preview');
  if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
  preview.removeAttribute('src');
  preview.hidden = true;
  preview.load();
  const image = t('exercise-media-preview');
  if (image?.src.startsWith('blob:')) URL.revokeObjectURL(image.src);
  if (image) {
    image.removeAttribute('src');
    image.hidden = true;
  }
}

function isAllowedTrainingMediaFile(file) {
  return file && ['image/gif', 'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'].includes(file.type);
}

function previewSelectedFile(file) {
  if (!file) {
    clearVideoPreview();
    setVideoStatus('Nenhuma demonstração selecionada.');
    return false;
  }
  if (!isAllowedTrainingMediaFile(file)) {
    clearVideoPreview();
    setVideoStatus('Formato inválido. Escolha GIF, MP4, WebM, OGG ou MOV.');
    return false;
  }
  if (file.size > MAX_TRAINING_VIDEO_BYTES) {
    clearVideoPreview();
    setVideoStatus('A demonstração ultrapassa o limite de 50 MB.');
    return false;
  }
  clearVideoPreview();
  const source = URL.createObjectURL(file);
  if (file.type === 'image/gif') {
    const image = t('exercise-media-preview');
    image.src = source;
    image.hidden = false;
  } else {
    const preview = t('exercise-video-preview');
    preview.src = source;
    preview.hidden = false;
    preview.play().catch(() => {});
  }
  setVideoStatus(`Demonstração selecionada: ${file.name}`);
  return true;
}

function previewVideoLink(value) {
  const url = value.trim();
  if (!url) {
    clearVideoPreview();
    setVideoStatus('Cole um link de GIF ou vídeo para visualizar.');
    return;
  }
  const isLocalUpload = url.startsWith('/uploads/');
  if (!isLocalUpload) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocolo');
    } catch (_) {
      clearVideoPreview();
      setVideoStatus('Use um link iniciado por http:// ou https://.');
      return;
    }
  }
  const previewUrl = isLocalUpload ? `${TRAINING_API_BASE_URL}${url}` : url;
  if (window.AcademiaTrainingMedia?.isDirectGifUrl(url)) {
    clearVideoPreview();
    const image = t('exercise-media-preview');
    image.src = previewUrl;
    image.hidden = false;
    setVideoStatus(isLocalUpload ? 'Demonstração atual mantida. Escolha outro arquivo para substituir.' : 'GIF direto detectado. A demonstração será repetida em loop.');
  } else if (window.AcademiaTrainingMedia?.isDirectVideoUrl(url)) {
    clearVideoPreview();
    const preview = t('exercise-video-preview');
    preview.src = previewUrl;
    preview.hidden = false;
    preview.play().catch(() => {});
    setVideoStatus(isLocalUpload ? 'Demonstração atual mantida. Escolha outro arquivo para substituir.' : 'Vídeo direto detectado. A demonstração será reproduzida em loop.');
  } else {
    clearVideoPreview();
    setVideoStatus(isLocalUpload ? 'Demonstração atual mantida. Escolha outro arquivo para substituir.' : 'Link salvo. Páginas de vídeo serão abertas em outra guia.');
  }
}

async function uploadTrainingVideo(file) {
  const formData = new FormData();
  formData.append('file', file, file.name);
  const result = await api('/api/training/videos', { method: 'POST', body: formData });
  return result.location;
}

function setVideoSourceMode() {
  const isUpload = t('exercise-video-source').value === 'upload';
  t('exercise-video-upload-field').classList.toggle('hidden', !isUpload);
  t('exercise-video-link-field').classList.toggle('hidden', isUpload);
  clearVideoPreview();
  setVideoStatus(isUpload ? 'Nenhuma demonstração selecionada.' : 'Cole um link de GIF ou vídeo para visualizar.');
}

async function createExercise() {
  const button = t('create-exercise-button');
  button.disabled = true;
  try {
    const source = t('exercise-video-source').value;
    let videoUrl = editingOriginalVideoUrl;
    if (source === 'upload') {
      const file = t('exercise-video-file').files[0];
      if (file && !previewSelectedFile(file)) return;
      if (file) {
        setTrainingStatus('Enviando demonstração...');
        videoUrl = await uploadTrainingVideo(file);
      }
    } else {
      videoUrl = t('exercise-video-url').value.trim();
      if (videoUrl) {
        const parsed = new URL(videoUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('link_video_invalido');
      }
    }
    const payload = {
      name: t('exercise-name').value.trim(),
      muscle_group: t('exercise-group').value.trim(),
      muscle_group_primary: t('exercise-group').value.trim(),
      muscle_group_secondary: t('exercise-secondary-muscles').value.trim(),
      equipment: t('exercise-equipment').value.trim(),
      level: t('exercise-level').value,
      instructions: t('exercise-instructions').value.trim(),
      video_url: videoUrl || null,
      image_url: editingExerciseId ? (exercises.find((exercise) => exercise.id === editingExerciseId)?.image_url || '') : '',
      is_active: t('exercise-active').checked
    };
    const path = editingExerciseId ? '/api/training/exercises/update' : '/api/training/exercises';
    await api(path, {
      method: 'POST',
      body: JSON.stringify(editingExerciseId ? { id: editingExerciseId, ...payload } : payload)
    });
    setTrainingStatus(editingExerciseId ? 'Exercício atualizado.' : 'Exercício criado.');
    editingExerciseId = null;
    editingOriginalVideoUrl = '';
    t('exercise-title').textContent = 'Novo exercício';
    t('create-exercise-button').textContent = 'Salvar';
    t('exercise-video-file').value = '';
    t('exercise-video-url').value = '';
    setVideoSourceMode();
    await loadBase();
    closeTrainingModal('exercise-modal');
  } catch (error) {
    setTrainingStatus(`Erro: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function saveProfile() {
  await api('/api/training/profile', {
    method: 'POST',
    body: JSON.stringify({
      member_id: t('profile-member').value,
      level: t('profile-level').value,
      goal: t('profile-goal').value.trim(),
      training_days_per_week: Number(t('profile-days').value || 3),
      restrictions: t('profile-restrictions').value.trim()
    })
  });
  setTrainingStatus('Perfil de treino salvo.');
}

const planWeekdayNames = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];

function selectedPlanDays() {
  return [...document.querySelectorAll('input[name="plan-day"]:checked')].map((input) => Number(input.value));
}

function emptyPlanDayExercise() {
  return { exercise_id: '', sets: '3', reps: '10-12', rest_seconds: '60', load_hint: '' };
}

function ensurePlanDayDraft(weekday) {
  if (!planDayDrafts.has(weekday)) planDayDrafts.set(weekday, []);
  return planDayDrafts.get(weekday);
}

function configuredPlanDays() {
  return [...planDayDrafts.entries()]
    .filter(([, draft]) => draft.length > 0)
    .map(([weekday]) => weekday)
    .sort((a, b) => a - b);
}

function resetPlanBuilder() {
  editingPlanId = null;
  planDayDrafts = new Map();
  activePlanWeekday = null;
  document.querySelectorAll('input[name="plan-day"]').forEach((input) => { input.checked = false; });
  if (t('plan-title')) t('plan-title').textContent = 'Nova ficha';
  if (t('create-plan-button')) t('create-plan-button').textContent = 'Salvar';
  if (t('plan-member')) {
    t('plan-member').value = '';
    t('plan-member').disabled = false;
  }
  if (t('plan-level')) t('plan-level').value = '';
  if (t('plan-goal')) t('plan-goal').value = '';
  if (t('plan-start')) t('plan-start').value = '';
  if (t('plan-status')) t('plan-status').textContent = '';
  t('plan-day-builder')?.classList.add('hidden');
  t('plan-day-exercise-list')?.replaceChildren();
  if (t('plan-day-builder-status')) t('plan-day-builder-status').textContent = '';
}

async function openPlanForm(item) {
  if (!item) {
    resetPlanBuilder();
    openTrainingModal('plan-modal');
    return;
  }
  try {
    const detail = await api(`/api/training/plans/detail?plan_id=${encodeURIComponent(item.id)}`);
    editingPlanId = item.id;
    t('plan-title').textContent = 'Editar ficha';
    t('create-plan-button').textContent = 'Salvar';
    t('plan-member').value = detail.plan?.member_id || item.member_id || '';
    t('plan-member').disabled = false;
    t('plan-level').value = detail.plan?.level || item.level || '';
    t('plan-goal').value = detail.plan?.goal || item.goal || '';
    t('plan-start').value = String(detail.plan?.starts_at || item.starts_at || '').slice(0, 10);
    planDayDrafts = new Map();
    const exercisesByDay = new Map();
    for (const exercise of detail.exercises || []) {
      if (!exercisesByDay.has(exercise.workout_day_id)) exercisesByDay.set(exercise.workout_day_id, []);
      exercisesByDay.get(exercise.workout_day_id).push({
        exercise_id: exercise.exercise_id,
        sets: String(exercise.sets ?? 3),
        reps: exercise.reps || '10-12',
        rest_seconds: String(exercise.rest_seconds ?? 60),
        load_hint: exercise.load_hint || ''
      });
    }
    for (const day of detail.days || []) {
      planDayDrafts.set(Number(day.weekday), exercisesByDay.get(day.id) || []);
    }
    document.querySelectorAll('input[name="plan-day"]').forEach((input) => { input.checked = false; });
    const firstDay = [...planDayDrafts.keys()].sort((a, b) => a - b)[0];
    if (firstDay) {
      const activeInput = document.querySelector(`input[name="plan-day"][value="${firstDay}"]`);
      if (activeInput) activeInput.checked = true;
      activePlanWeekday = firstDay;
    } else {
      activePlanWeekday = null;
    }
    renderPlanDayBuilder();
    openTrainingModal('plan-modal');
  } catch (error) {
    setTrainingStatus(`Erro ao abrir a ficha: ${error.message}`);
  }
}

function planDaysPayload(selectedDays) {
  return selectedDays.map((weekday) => ({
    weekday,
    title: planWeekdayNames[weekday - 1],
    exercises: (planDayDrafts.get(weekday) || []).map((item) => ({
      exercise_id: item.exercise_id,
      sets: Number(item.sets || 3),
      reps: item.reps || '10-12',
      rest_seconds: Number(item.rest_seconds || 60),
      load_hint: item.load_hint || ''
    }))
  }));
}

async function deletePlan(item, button) {
  if (!window.confirm(`Excluir a ficha de ${item.member_name}? Ela será desativada e mantida no histórico.`)) return;
  button.disabled = true;
  try {
    await api('/api/training/plans', { method: 'DELETE', body: JSON.stringify({ plan_id: item.id }) });
    setTrainingStatus('Ficha excluída.');
    await loadBase();
  } catch (error) {
    setTrainingStatus(`Erro ao excluir ficha: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

function renderPlanDayBuilder() {
  const builder = t('plan-day-builder');
  const list = t('plan-day-exercise-list');
  if (!builder || !list) return;
  const weekdays = selectedPlanDays();
  if (!weekdays.length) {
    builder.classList.add('hidden');
    list.replaceChildren();
    activePlanWeekday = null;
    return;
  }
  if (!weekdays.includes(activePlanWeekday)) activePlanWeekday = weekdays[0];
  const draft = ensurePlanDayDraft(activePlanWeekday);
  builder.classList.remove('hidden');
  t('plan-day-builder-title').textContent = `Exercícios de ${planWeekdayNames[activePlanWeekday - 1]}`;
  list.replaceChildren();

  if (!draft.length) {
    const empty = document.createElement('p');
    empty.className = 'section-help';
    empty.textContent = 'Nenhum exercício adicionado neste dia.';
    list.appendChild(empty);
  }

  draft.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'plan-day-exercise-row';
    const exerciseField = document.createElement('label');
    exerciseField.className = 'field';
    const exerciseLabel = document.createElement('span');
    exerciseLabel.textContent = 'Exercício';
    const exerciseSelect = document.createElement('select');
    exerciseSelect.required = true;
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'Selecione o exercício';
    exerciseSelect.appendChild(emptyOption);
    for (const exercise of exercises) {
      const option = document.createElement('option');
      option.value = exercise.id;
      option.textContent = exercise.name;
      option.selected = exercise.id === item.exercise_id;
      exerciseSelect.appendChild(option);
    }
    exerciseSelect.addEventListener('change', () => { item.exercise_id = exerciseSelect.value; });
    exerciseField.append(exerciseLabel, exerciseSelect);

    const makeInput = (label, key, type = 'text') => {
      const field = document.createElement('label');
      field.className = 'field';
      const caption = document.createElement('span');
      caption.textContent = label;
      const input = document.createElement('input');
      input.type = type;
      input.value = item[key] ?? '';
      if (type === 'number') input.min = '0';
      input.addEventListener('input', () => { item[key] = input.value; });
      field.append(caption, input);
      return field;
    };

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button remove-plan-day-exercise';
    remove.setAttribute('aria-label', 'Remover exercício do dia');
    remove.title = 'Remover exercício';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      draft.splice(index, 1);
      renderPlanDayBuilder();
    });
    row.append(exerciseField, makeInput('Séries', 'sets', 'number'), makeInput('Repetições', 'reps'), makeInput('Descanso (s)', 'rest_seconds', 'number'), remove);
    list.appendChild(row);
  });
  t('plan-day-builder-status').textContent = `${draft.length} exercício(s) configurado(s) para este dia.`;
}

function addPlanDayExercise() {
  const weekdays = selectedPlanDays();
  if (!weekdays.length) return;
  if (!weekdays.includes(activePlanWeekday)) activePlanWeekday = weekdays[0];
  ensurePlanDayDraft(activePlanWeekday).push(emptyPlanDayExercise());
  renderPlanDayBuilder();
}

function appendExerciseToCurrentPlan(exercise) {
  let weekdays = selectedPlanDays();
  if (!weekdays.length) {
    const monday = document.querySelector('input[name="plan-day"][value="1"]');
    if (monday) monday.checked = true;
    activePlanWeekday = 1;
    weekdays = [1];
  } else if (!activePlanWeekday || !weekdays.includes(activePlanWeekday)) {
    activePlanWeekday = weekdays[0];
  }

  const draft = ensurePlanDayDraft(activePlanWeekday);
  draft.push({
    exercise_id: exercise.id,
    sets: '3',
    reps: '10-12',
    rest_seconds: '60',
    load_hint: ''
  });
  renderPlanDayBuilder();
  if (t('plan-status')) {
    t('plan-status').textContent = `"${exercise.name}" adicionado ao treino de ${planWeekdayNames[activePlanWeekday - 1]}.`;
  }
  setTrainingStatus(`Exercício "${exercise.name}" adicionado à ficha.`);
  openTrainingModal('plan-modal');
  const builder = t('plan-day-builder');
  if (builder) {
    builder.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function openExercisePlanPicker(exercise) {
  targetExerciseForPlan = exercise;
  const pickerList = t('exercise-plan-picker-list');
  const searchInput = t('picker-plan-search');
  if (!pickerList) return;

  const subtitle = t('exercise-plan-picker-subtitle');
  if (subtitle) {
    subtitle.textContent = `Selecione o aluno para enviar "${exercise.name}":`;
  }

  if (searchInput) searchInput.value = '';

  function renderPickerOptions(query = '') {
    pickerList.innerHTML = '';
    const norm = normalizeExerciseFilterValue(query);
    const filtered = (plans || []).filter((p) => {
      if (!norm) return true;
      const combined = `${p.member_name || ''} ${p.name || ''} ${p.goal || ''}`;
      return normalizeExerciseFilterValue(combined).includes(norm);
    });

    if (filtered.length > 0) {
      for (const plan of filtered) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'plan-picker-option';
        const level = trainingLevels.find((candidate) => candidate.slug === plan.level);
        const memberName = plan.member_name || plan.name || 'Aluno';
        const initial = (memberName.trim().charAt(0) || 'A').toUpperCase();
        const displayName = planDisplayName(plan);
        const levelName = level?.name || plan.level || 'Geral';
        const dateStr = String(plan.starts_at || '').slice(0, 10);
        const metaStr = dateStr ? `Início: ${dateStr}` : 'Ficha ativa';

        btn.innerHTML = `
          <span class="picker-avatar" aria-hidden="true">${initial}</span>
          <div class="picker-text-wrap">
            <strong class="picker-student-name">${displayName}</strong>
            <span class="picker-plan-detail">${levelName} · ${metaStr}</span>
          </div>
          <span class="picker-action-arrow" aria-hidden="true">Adicionar ➔</span>
        `;
        btn.addEventListener('click', async () => {
          closeTrainingModal('exercise-plan-picker-modal');
          await openPlanForm(plan);
          appendExerciseToCurrentPlan(exercise);
        });
        pickerList.appendChild(btn);
      }
    } else {
      const empty = document.createElement('p');
      empty.className = 'section-help';
      empty.textContent = query ? 'Nenhum aluno encontrado para esta busca.' : 'Nenhuma ficha cadastrada no momento.';
      pickerList.appendChild(empty);
    }
  }

  renderPickerOptions();

  if (searchInput) {
    searchInput.oninput = (e) => renderPickerOptions(e.target.value);
  }

  openTrainingModal('exercise-plan-picker-modal');
}

async function selectExerciseForPlan(exercise) {
  const planModal = t('plan-modal');
  const isPlanModalOpen = planModal && !planModal.classList.contains('hidden');

  if (isPlanModalOpen) {
    appendExerciseToCurrentPlan(exercise);
    return;
  }

  if (!plans || plans.length === 0) {
    resetPlanBuilder();
    appendExerciseToCurrentPlan(exercise);
    return;
  }

  openExercisePlanPicker(exercise);
}

async function createPlan() {
  const memberId = t('plan-member').value;
  const member = members.find((item) => item.id === memberId);
  const selectedDays = editingPlanId ? [...planDayDrafts.keys()].sort((a, b) => a - b) : configuredPlanDays();
  if (!memberId || !member) {
    t('plan-status').textContent = 'Selecione um aluno para criar a ficha.';
    return;
  }
  if (!selectedDays.length) {
    t('plan-status').textContent = 'Adicione pelo menos um exercício em um dia da ficha.';
    return;
  }
  const incompleteDay = selectedDays.find((weekday) => planDayDrafts.get(weekday)?.some((item) => !item.exercise_id));
  if (!editingPlanId && selectedDays.some((weekday) => !planDayDrafts.get(weekday)?.length)) {
    t('plan-status').textContent = 'Adicione pelo menos um exercício em cada dia configurado.';
    return;
  }
  if (incompleteDay) {
    t('plan-status').textContent = `Selecione os exercícios de ${planWeekdayNames[incompleteDay - 1]}.`;
    activePlanWeekday = incompleteDay;
    renderPlanDayBuilder();
    return;
  }
  const button = t('create-plan-button');
  button.disabled = true;
  t('plan-status').textContent = 'Salvando ficha e dias...';
  try {
    if (editingPlanId) {
      await api('/api/training/plans/update', {
        method: 'POST',
        body: JSON.stringify({
          plan_id: editingPlanId,
          member_id: memberId,
          name: member.name,
          level: t('plan-level').value,
          goal: t('plan-goal').value.trim(),
          starts_at: t('plan-start').value || null,
          days: planDaysPayload(selectedDays)
        })
      });
      t('plan-status').textContent = 'Ficha atualizada.';
      setTrainingStatus('Ficha atualizada.');
      await loadBase();
      resetPlanBuilder();
      closeTrainingModal('plan-modal');
      return;
    }
    const plan = await api('/api/training/plans', {
      method: 'POST',
      body: JSON.stringify({
        member_id: memberId,
        name: member.name,
        level: t('plan-level').value,
        goal: t('plan-goal').value.trim(),
        starts_at: t('plan-start').value || null
      })
    });
    for (const weekday of selectedDays) {
      const day = await api('/api/training/plans/day', {
        method: 'POST',
        body: JSON.stringify({ plan_id: plan.id, weekday, title: planWeekdayNames[weekday - 1] })
      });
      for (const [index, item] of planDayDrafts.get(weekday).entries()) {
        await api('/api/training/plans/exercise', {
          method: 'POST',
          body: JSON.stringify({
            workout_day_id: day.id,
            exercise_id: item.exercise_id,
            order_index: index + 1,
            sets: Number(item.sets || 3),
            reps: item.reps || '10-12',
            rest_seconds: Number(item.rest_seconds || 60),
            load_hint: item.load_hint || ''
          })
        });
      }
    }
    t('plan-status').textContent = 'Ficha criada com os dias selecionados.';
    setTrainingStatus('Ficha criada.');
    await loadBase();
    resetPlanBuilder();
    closeTrainingModal('plan-modal');
  } catch (error) {
    t('plan-status').textContent = `Erro: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

async function createDay() {
  await api('/api/training/plans/day', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: t('day-plan').value,
      weekday: Number(t('day-weekday').value || 1),
      title: t('day-title').value.trim(),
      notes: t('day-notes').value.trim()
    })
  });
  setTrainingStatus('Dia criado. Abra o detalhe da ficha para carregar o dia.');
}

async function loadPlanDetail(planId) {
  const detail = await api(`/api/training/plans/detail?plan_id=${encodeURIComponent(planId)}`);
  days = [];
  const seen = new Set();
  for (const item of detail.exercises || []) {
    if (!seen.has(item.workout_day_id)) {
      seen.add(item.workout_day_id);
      days.push({ id: item.workout_day_id, title: item.day_title, weekday: item.weekday });
    }
  }
  fillSelect('exercise-day', days, (d) => `${d.weekday} - ${d.title}`, 'Selecione o dia da ficha');
  setTrainingStatus(`Ficha carregada: ${detail.plan.name}`);
}

async function addWorkoutExercise() {
  await api('/api/training/plans/exercise', {
    method: 'POST',
    body: JSON.stringify({
      workout_day_id: t('exercise-day').value,
      exercise_id: t('exercise-select').value,
      order_index: Number(t('workout-order').value || 1),
      sets: Number(t('workout-sets').value || 3),
      reps: t('workout-reps').value || '10-12',
      rest_seconds: Number(t('workout-rest').value || 60),
      load_hint: t('workout-load').value.trim()
    })
  });
  setTrainingStatus('Exercicio adicionado na ficha.');
}

async function reviewPlan() {
  const button = t('review-plan-button');
  const loading = t('review-loading');
  const error = t('review-error');
  button.disabled = true;
  loading.classList.remove('hidden');
  error.classList.add('hidden');
  t('review-result').classList.add('hidden');
  t('review-history').classList.add('hidden');
  try {
    currentTrainingReview = await api('/api/training/plans/review', {
      method: 'POST',
      body: JSON.stringify({ plan_id: t('review-plan').value })
    });
    renderTrainingReview(currentTrainingReview);
    setTrainingStatus(currentTrainingReview.source === 'local_generative' ? 'Análise local gerada.' : 'Análise gerada pelo motor de regras.');
  } catch (requestError) {
    error.textContent = trainingReviewErrorMessage(requestError);
    error.classList.remove('hidden');
  } finally {
    button.disabled = false;
    loading.classList.add('hidden');
  }
}

function trainingReviewErrorMessage(error) {
  const text = String(error?.message || error || '');
  if (text.includes('analise_em_andamento')) return 'Já existe uma análise em andamento. Aguarde a conclusão.';
  if (text.includes('aguarde_nova_analise')) return 'Esta ficha foi analisada há pouco. Aguarde antes de gerar novamente.';
  if (text.includes('limite_horario_atingido')) return 'O limite de análises desta hora foi atingido.';
  return 'Não foi possível concluir a análise. Tente novamente.';
}

function reviewItem(title, description, evidence = []) {
  const item = document.createElement('article');
  item.className = 'training-review-item';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const body = document.createElement('div');
  body.textContent = description;
  item.append(strong, body);
  if (evidence.length) {
    const list = document.createElement('ul');
    list.className = 'training-review-evidence';
    evidence.forEach((value) => {
      const row = document.createElement('li');
      row.textContent = value;
      list.appendChild(row);
    });
    item.appendChild(list);
  }
  return item;
}

function renderTrainingReview(review) {
  t('review-source').textContent = review.source === 'local_generative' ? 'IA local' : 'Motor de regras';
  t('review-confidence').textContent = `Confiança ${Math.round(Number(review.confidence || 0) * 100)}%`;
  t('review-human').classList.toggle('hidden', !review.requires_human_review);
  t('review-summary').textContent = review.summary || '';
  t('review-student-message').textContent = review.student_message || '';
  t('review-trainer-notes').textContent = review.trainer_notes || '';
  const signals = t('review-signals');
  signals.replaceChildren(...(review.signals || []).map((item) => reviewItem(`${item.severity} · ${item.type}`, item.description, item.evidence || [])));
  const suggestions = t('review-suggestions');
  suggestions.replaceChildren(...(review.suggestions || []).map((item) => reviewItem(`${item.priority} · ${item.type}`, item.suggested_action, [item.reason])));
  t('review-decision').classList.toggle('hidden', Boolean(review.approved_at || review.rejected_at));
  t('review-decision-status').textContent = review.approved_at
    ? 'Análise aprovada. A mensagem está disponível para o aluno.'
    : review.rejected_at
      ? 'Análise rejeitada.'
      : '';
  t('review-decision-status').classList.toggle('hidden', !review.approved_at && !review.rejected_at);
  t('review-result').classList.remove('hidden');
}

async function decideCurrentReview(decision) {
  if (!currentTrainingReview) return;
  const reason = decision === 'reject' ? t('review-rejection-reason').value.trim() : '';
  const review = await api(`/api/training/plans/review/${decision}`, {
    method: 'POST',
    body: JSON.stringify({ review_id: currentTrainingReview.id, reason })
  });
  currentTrainingReview = review;
  renderTrainingReview(review);
  await loadReviewHistory();
}

async function loadReviewHistory() {
  const planId = t('review-plan').value;
  const result = await api(`/api/training/plans/reviews?plan_id=${encodeURIComponent(planId)}&limit=20`);
  const rows = result.data || [];
  const list = t('review-history-list');
  list.replaceChildren(...rows.map((item) => {
    const card = reviewItem(`${new Date(item.created_at).toLocaleString('pt-BR')} · ${item.source === 'local_generative' ? 'IA local' : 'Regras'}`, item.summary || '', [`Status: ${item.status}`, `Confiança: ${Math.round(Number(item.confidence || 0) * 100)}%`]);
    card.classList.add('training-review-history-item');
    card.addEventListener('click', () => {
      currentTrainingReview = item;
      renderTrainingReview(item);
    });
    return card;
  }));
  const comparison = t('review-comparison');
  if (rows.length >= 2) {
    comparison.textContent = `Comparação: ${rows[0].status} agora; ${rows[1].status} na análise anterior. Sinais: ${(rows[0].signals || []).length} agora e ${(rows[1].signals || []).length} antes.`;
    comparison.classList.remove('hidden');
  } else {
    comparison.classList.add('hidden');
  }
  t('review-history').classList.remove('hidden');
}

t('create-exercise-button').addEventListener('click', createExercise);
t('training-level-form').addEventListener('submit', createTrainingLevel);
t('exercise-video-source').addEventListener('change', setVideoSourceMode);
t('exercise-video-file').addEventListener('change', (event) => previewSelectedFile(event.target.files[0]));
t('exercise-video-url').addEventListener('input', (event) => previewVideoLink(event.target.value));
t('save-profile-button').addEventListener('click', saveProfile);
t('create-plan-button').addEventListener('click', createPlan);
t('add-plan-day-exercise')?.addEventListener('click', addPlanDayExercise);
t('open-plan-button')?.addEventListener('click', () => openPlanForm());
document.querySelectorAll('input[name="plan-day"]').forEach((input) => {
  input.addEventListener('change', () => {
    activePlanWeekday = Number(input.value);
    renderPlanDayBuilder();
  });
});
t('create-day-button').addEventListener('click', createDay);
t('add-workout-exercise-button').addEventListener('click', addWorkoutExercise);
// A interface de análise é controlada por training-review-ui.js.

function syncTrainingModalState() {
  document.body.classList.toggle('modal-open', Boolean(document.querySelector('.modal:not(.hidden)')));
}

function openTrainingModal(id) {
  const modal = t(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  syncTrainingModalState();
}

function closeTrainingModal(id) {
  const modal = t(id);
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  syncTrainingModalState();
}

[
  ['open-training-levels-button', 'training-levels-modal'],
  ['open-profile-button', 'profile-modal'],
  ['open-plan-button', 'plan-modal'],
  ['open-day-button', 'day-modal'],
  ['open-workout-exercise-button', 'workout-exercise-modal'],
  ['open-review-button', 'review-modal']
].forEach(([buttonId, modalId]) => t(buttonId)?.addEventListener('click', () => openTrainingModal(modalId)));
t('open-exercise-button')?.addEventListener('click', () => openExerciseForm());
t('open-plan-levels-button')?.addEventListener('click', () => openTrainingModal('training-levels-modal'));

t('toggle-exercise-search')?.addEventListener('click', () => {
  const filters = t('exercise-library-filters');
  const isOpen = filters?.classList.toggle('hidden') === false;
  filters?.setAttribute('aria-hidden', String(!isOpen));
  t('toggle-exercise-search')?.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) t('exercise-search')?.focus();
});
t('exercise-search')?.addEventListener('input', (event) => {
  exerciseLibraryQuery = event.target.value;
  exercisePage = 1;
  renderAll({ libraryOnly: true });
  t('exercise-search')?.focus();
});
t('exercise-primary-filter')?.addEventListener('change', (event) => {
  exercisePrimaryFilter = event.target.value;
  exercisePage = 1;
  renderAll({ libraryOnly: true });
});
t('exercise-secondary-filter')?.addEventListener('change', (event) => {
  exerciseSecondaryFilter = event.target.value;
  exercisePage = 1;
  renderAll({ libraryOnly: true });
});
t('toggle-plan-search')?.addEventListener('click', () => {
  const filters = t('plan-library-filters');
  const isOpen = filters?.classList.toggle('hidden') === false;
  filters?.setAttribute('aria-hidden', String(!isOpen));
  t('toggle-plan-search')?.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) t('plan-search')?.focus();
});
t('plan-search')?.addEventListener('input', (event) => {
  planLibraryQuery = event.target.value;
  planPage = 1;
  renderAll();
  t('plan-search')?.focus();
});

[
  ['close-training-levels-modal', 'training-levels-modal'],
  ['close-exercise-modal', 'exercise-modal'],
  ['close-profile-modal', 'profile-modal'],
  ['close-plan-modal', 'plan-modal'],
  ['close-day-modal', 'day-modal'],
  ['close-workout-exercise-modal', 'workout-exercise-modal'],
  ['close-review-modal', 'review-modal'],
  ['close-exercise-view-modal', 'exercise-view-modal'],
  ['close-plan-view-modal', 'plan-view-modal'],
  ['close-exercise-plan-picker-modal', 'exercise-plan-picker-modal']
].forEach(([buttonId, modalId]) => t(buttonId)?.addEventListener('click', () => closeTrainingModal(modalId)));

t('new-plan-from-picker-button')?.addEventListener('click', () => {
  closeTrainingModal('exercise-plan-picker-modal');
  resetPlanBuilder();
  if (targetExerciseForPlan) {
    appendExerciseToCurrentPlan(targetExerciseForPlan);
  } else {
    openTrainingModal('plan-modal');
  }
});

document.querySelectorAll('[data-close-training-modal]').forEach((button) => {
  button.addEventListener('click', () => closeTrainingModal(button.dataset.closeTrainingModal));
});
document.querySelectorAll('.modal').forEach((modal) => {
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeTrainingModal(modal.id);
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const open = document.querySelector('.modal:not(.hidden)');
  if (open) closeTrainingModal(open.id);
});
loadBase().catch((error) => setTrainingStatus(`Erro: ${error.message}`));
