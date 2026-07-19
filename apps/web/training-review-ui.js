(function (root, factory) {
  const reviewUi = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = reviewUi;
  if (root?.document) reviewUi.install(root);
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const STATUS_LABELS = {
    maintain: 'Mantenha a ficha atual.',
    adjust: 'Ajuste a ficha com acompanhamento.',
    replace_partially: 'Revise parte da ficha.',
    professional_review: 'Solicite revisão do professor.'
  };

  const SUGGESTION_LABELS = {
    keep_plan: 'Manter a ficha',
    adjust_volume: 'Ajustar volume',
    adjust_rest: 'Ajustar descanso',
    progress_load: 'Avaliar progressão',
    replace_exercise: 'Avaliar troca de exercício',
    reduce_load: 'Rever carga',
    professional_review: 'Revisão profissional'
  };

  const NON_RECOVERABLE_ERRORS = new Set([
    'aguarde_nova_analise',
    'limite_horario_atingido',
    'sem_permissao',
    'ficha_nao_encontrada',
    'plan_id_obrigatorio'
  ]);

  function confidencePercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    const percentage = number >= 0 && number <= 1 ? number * 100 : number;
    return Math.max(0, Math.min(100, Math.round(percentage)));
  }

  function confidenceBand(value) {
    const percentage = confidencePercent(value);
    if (percentage < 40) return 'baixa';
    if (percentage < 70) return 'moderada';
    return 'alta';
  }

  function confidenceText(value) {
    const percentage = confidencePercent(value);
    if (percentage <= 0) return 'Dados insuficientes para medir a confiabilidade';
    return `${percentage}% de confiabilidade`;
  }

  function statusLabel(value) {
    return STATUS_LABELS[String(value || '')] || 'Acompanhe a ficha com o professor.';
  }

  function recommendationLabel(review) {
    if (review?.requires_human_review) return 'Solicite revisão do professor.';
    return statusLabel(review?.status);
  }

  function sourceLabel() {
    return 'Análise da ficha';
  }

  function humanizeText(value) {
    return String(value || '')
      .replace(/\bfat_loss\b/gi, 'redução de gordura')
      .replace(/\bmuscle_gain\b/gi, 'ganho de massa muscular')
      .replace(/\bprofessional_review\b/gi, 'revisão do professor')
      .replace(/\breplace_partially\b/gi, 'substituição parcial')
      .replace(/\brules_fallback\b/gi, 'regras automáticas')
      .replace(/\blocal_generative\b/gi, 'análise')
      .replace(/\bmaintain\b/gi, 'manter a ficha')
      .replace(/\badjust\b/gi, 'ajustar a ficha')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeSummary(review) {
    const summary = humanizeText(review?.summary || '');
    const normalized = summary.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const incompleteEnding = /\b(rep|reps|serie|series|sessao|sessoes|treino|exercicio|exercicios)$/i.test(normalized);
    if (summary.length >= 20 && /[.!?]$/.test(summary) && !incompleteEnding) return summary;
    return '';
  }

  function comparisonText(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return '';
    const currentSignals = Array.isArray(rows[0]?.signals) ? rows[0].signals.length : 0;
    const previousSignals = Array.isArray(rows[1]?.signals) ? rows[1].signals.length : 0;
    return `Agora: ${recommendationLabel(rows[0])} Antes: ${recommendationLabel(rows[1])} Pontos de atenção: ${currentSignals} vs. ${previousSignals}.`;
  }

  function shouldAttemptRecovery(error) {
    return !NON_RECOVERABLE_ERRORS.has(String(error?.message || error || ''));
  }

  function cleanEvidence(values) {
    return (Array.isArray(values) ? values : [])
      .map(humanizeText)
      .filter(Boolean)
      .filter((value) => !/^Restrição cadastrada \d+$/i.test(value));
  }

  function firstPercentage(values) {
    for (const value of values) {
      const match = String(value).match(/(\d{1,3})\s*%/);
      if (match) return Math.max(0, Math.min(100, Number(match[1])));
    }
    return null;
  }

  function firstScaleTen(values) {
    for (const value of values) {
      const match = String(value).match(/([0-9]+(?:[.,][0-9]+)?)\s*\/\s*10/);
      if (match) return Math.max(0, Math.min(10, Number(match[1].replace(',', '.'))));
    }
    return null;
  }

  function element(document, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function install(windowObject) {
    const document = windowObject.document;
    const byId = (id) => document.getElementById(id);
    const reviewButton = byId('review-plan-button');
    const historyButton = byId('review-history-button');
    const resultSection = byId('review-result');
    if (!reviewButton || !historyButton || !resultSection) return;

    if (!document.querySelector('link[data-training-review-premium]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = './training-review-premium.css?v=20260719-1';
      stylesheet.dataset.trainingReviewPremium = 'true';
      document.head.appendChild(stylesheet);
    }

    const apiBaseUrl = windowObject.localStorage.getItem('apiBaseUrl') || `http://${windowObject.location.hostname || 'localhost'}:3004`;
    const token = windowObject.localStorage.getItem('academiaToken') || '';
    let currentReview = null;
    let loadingTimer = null;

    function buildPremiumLayout() {
      resultSection.className = 'training-review-result training-review-premium hidden';

      const overview = element(document, 'div', 'training-review-overview');
      const confidenceCard = element(document, 'section', 'training-review-confidence-card');
      const ring = element(document, 'div', 'training-review-ring');
      ring.id = 'review-confidence-ring';
      const ringValue = element(document, 'strong', '', '0%');
      ringValue.id = 'review-confidence-value';
      ring.append(ringValue, element(document, 'small', '', 'dados'));
      const context = element(document, 'div', 'training-review-context');
      const contextLabel = element(document, 'p', 'training-review-context-label');
      contextLabel.id = 'review-context-title';
      const help = element(document, 'p', 'training-review-confidence-help', 'A confiabilidade indica quanto a análise conseguiu se apoiar nos registros de treinos, avaliações e dados da ficha. Não é uma nota do aluno e não garante resultado.');
      help.id = 'review-confidence-help';
      context.append(contextLabel, help);
      confidenceCard.append(ring, context);

      const actionCard = element(document, 'section', 'training-review-action-card');
      actionCard.append(element(document, 'p', 'eyebrow', 'Recomendação'));
      const recommendation = element(document, 'strong');
      recommendation.id = 'review-recommendation';
      const actionNote = element(document, 'p');
      actionNote.id = 'review-action-note';
      actionCard.append(recommendation, actionNote);
      overview.append(confidenceCard, actionCard);

      const dataGrid = element(document, 'div', 'training-review-data-grid');
      dataGrid.id = 'review-data-grid';

      const next = element(document, 'section', 'training-review-next');
      const nextTitle = element(document, 'h5', 'training-review-section-title', 'Próximos passos');
      const nextGrid = element(document, 'div', 'training-review-next-grid');
      nextGrid.id = 'review-next-grid';
      next.append(nextTitle, nextGrid);

      const details = element(document, 'details', 'training-review-details');
      details.append(element(document, 'summary', '', 'Mensagens e decisão do professor'));
      const detailsBody = element(document, 'div', 'training-review-details-body');
      const studentBlock = element(document, 'div');
      studentBlock.append(element(document, 'strong', '', 'Mensagem para o aluno'));
      const studentMessage = element(document, 'p');
      studentMessage.id = 'review-student-message';
      studentBlock.append(studentMessage);
      const trainerBlock = element(document, 'div');
      trainerBlock.append(element(document, 'strong', '', 'Observação profissional'));
      const trainerNotes = element(document, 'p');
      trainerNotes.id = 'review-trainer-notes';
      trainerBlock.append(trainerNotes);
      const reasonLabel = element(document, 'label', '', 'Motivo da rejeição (opcional)');
      reasonLabel.htmlFor = 'review-rejection-reason';
      const reason = element(document, 'textarea');
      reason.id = 'review-rejection-reason';
      reason.maxLength = 500;
      reason.placeholder = 'Registre o motivo para o histórico';
      const decision = element(document, 'div', 'form-actions');
      decision.id = 'review-decision';
      const reject = element(document, 'button', 'secondary', 'Rejeitar');
      reject.id = 'review-reject-button';
      reject.type = 'button';
      const approve = element(document, 'button', '', 'Aprovar');
      approve.id = 'review-approve-button';
      approve.type = 'button';
      decision.append(reject, approve);
      const decisionStatus = element(document, 'p', 'status-message hidden');
      decisionStatus.id = 'review-decision-status';
      decisionStatus.setAttribute('role', 'status');
      detailsBody.append(studentBlock, trainerBlock, reasonLabel, reason, decision, decisionStatus);
      details.append(detailsBody);

      resultSection.replaceChildren(overview, dataGrid, next, details);
    }

    buildPremiumLayout();

    async function request(path, options = {}) {
      const response = await windowObject.fetch(`${apiBaseUrl}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      const raw = await response.text();
      let data = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (_) {
          const error = new Error('resposta_invalida');
          error.status = response.status;
          throw error;
        }
      }
      if (!response.ok) {
        const error = new Error(data.error || 'erro_requisicao');
        error.status = response.status;
        throw error;
      }
      return data;
    }

    function createDataCard({ icon, title, value, copy, evidence = [], progress = null, accent = '#2389ee' }) {
      const card = element(document, 'article', 'training-review-data-card');
      card.style.setProperty('--card-accent', accent);
      const header = element(document, 'div', 'training-review-data-card-header');
      const titleWrap = element(document, 'div', 'training-review-data-card-title');
      titleWrap.append(element(document, 'span', 'training-review-data-icon', icon), element(document, 'span', '', title));
      header.append(titleWrap);
      card.append(header);
      if (value) card.append(element(document, 'p', 'training-review-data-card-value', value));
      if (progress !== null) {
        const bar = element(document, 'div', 'training-review-progress');
        const fill = element(document, 'span');
        fill.style.setProperty('--value', `${progress}%`);
        bar.append(fill);
        card.append(bar);
      }
      if (copy) card.append(element(document, 'p', 'training-review-data-card-copy', copy));
      if (evidence.length) {
        const list = element(document, 'ul', 'training-review-data-list');
        evidence.slice(0, 4).forEach((item) => list.append(element(document, 'li', '', item)));
        card.append(list);
      }
      return card;
    }

    function renderDataCards(review) {
      const grid = byId('review-data-grid');
      if (!grid) return;
      const cards = [];
      const signals = Array.isArray(review?.signals) ? review.signals : [];

      const adherence = signals.find((item) => item?.type === 'adherence');
      if (adherence) {
        const evidence = cleanEvidence(adherence.evidence);
        const percentage = firstPercentage(evidence);
        cards.push(createDataCard({
          icon: '↗',
          title: 'Frequência registrada',
          value: percentage === null ? 'Acompanhamento' : `${percentage}%`,
          progress: percentage,
          copy: humanizeText(adherence.description),
          evidence: evidence.filter((item) => !item.includes('%')),
          accent: percentage !== null && percentage < 45 ? '#efb13d' : '#2fc58d'
        }));
      }

      const assessment = signals.find((item) => item?.type === 'assessment');
      if (assessment) {
        const evidence = cleanEvidence(assessment.evidence);
        cards.push(createDataCard({
          icon: 'A',
          title: 'Avaliação física',
          value: evidence.length ? 'Dados identificados' : 'Sem comparação suficiente',
          copy: humanizeText(assessment.description),
          evidence,
          accent: '#7f8cff'
        }));
      }

      const restriction = signals.find((item) => item?.type === 'restriction');
      if (restriction) {
        const evidence = cleanEvidence(restriction.evidence);
        if (evidence.length) {
          cards.push(createDataCard({
            icon: '!',
            title: 'Restrições ou desconfortos',
            value: `${evidence.length} ${evidence.length === 1 ? 'registro' : 'registros'}`,
            copy: humanizeText(restriction.description),
            evidence,
            accent: '#ef6a68'
          }));
        }
      }

      const effort = signals.find((item) => item?.type === 'effort');
      if (effort) {
        const evidence = cleanEvidence(effort.evidence);
        const scale = firstScaleTen(evidence);
        cards.push(createDataCard({
          icon: 'E',
          title: 'Esforço percebido',
          value: scale === null ? 'Registrado' : `${scale.toFixed(1)}/10`,
          progress: scale === null ? null : scale * 10,
          copy: humanizeText(effort.description),
          evidence: scale === null ? evidence : evidence.filter((item) => !item.includes('/10')),
          accent: scale !== null && scale >= 8 ? '#ef6a68' : '#2fc58d'
        }));
      }

      const balance = signals.find((item) => item?.type === 'balance' || item?.type === 'progression' || item?.type === 'recovery');
      if (balance) {
        cards.push(createDataCard({
          icon: '✓',
          title: 'Leitura da ficha',
          value: balance?.severity === 'critical' ? 'Prioridade alta' : balance?.severity === 'attention' ? 'Atenção' : 'Acompanhamento',
          copy: humanizeText(balance.description),
          evidence: cleanEvidence(balance.evidence),
          accent: balance?.severity === 'critical' ? '#ef6a68' : '#2389ee'
        }));
      }

      grid.replaceChildren(...cards);
      grid.classList.toggle('hidden', cards.length === 0);
    }

    function renderNextSteps(review) {
      const grid = byId('review-next-grid');
      const section = grid?.parentElement;
      if (!grid || !section) return;
      const suggestions = (Array.isArray(review?.suggestions) ? review.suggestions : []).slice(0, 3);
      const cards = suggestions.map((item) => {
        const card = element(document, 'article', 'training-review-next-card');
        card.append(element(document, 'strong', '', SUGGESTION_LABELS[item?.type] || 'Acompanhamento'));
        const action = humanizeText(item?.suggested_action || item?.reason || '');
        if (action) card.append(element(document, 'p', '', action.slice(0, 180)));
        return card;
      });
      grid.replaceChildren(...cards);
      section.classList.toggle('hidden', cards.length === 0);
    }

    function renderReview(review) {
      currentReview = review;
      const percentage = confidencePercent(review?.confidence);
      const ring = byId('review-confidence-ring');
      if (ring) ring.style.setProperty('--progress', percentage);
      const value = byId('review-confidence-value');
      if (value) value.textContent = `${percentage}%`;
      const context = byId('review-context-title');
      if (context) context.textContent = percentage > 0
        ? `Pelos dados coletados (${percentage}% de confiabilidade de acordo com o envio):`
        : 'Pelos dados coletados até o momento:';
      const recommendation = byId('review-recommendation');
      if (recommendation) recommendation.textContent = recommendationLabel(review);
      const actionNote = byId('review-action-note');
      if (actionNote) actionNote.textContent = review?.requires_human_review
        ? 'A decisão final deve ser feita pelo profissional responsável.'
        : 'Continue acompanhando os registros e a evolução do aluno.';

      renderDataCards(review);
      renderNextSteps(review);

      const studentMessage = byId('review-student-message');
      if (studentMessage) studentMessage.textContent = humanizeText(review?.student_message || '');
      const trainerNotes = byId('review-trainer-notes');
      if (trainerNotes) trainerNotes.textContent = humanizeText(review?.trainer_notes || '');

      const decision = byId('review-decision');
      if (decision) decision.classList.toggle('hidden', Boolean(review?.approved_at || review?.rejected_at));
      const decisionStatus = byId('review-decision-status');
      if (decisionStatus) {
        decisionStatus.textContent = review?.approved_at
          ? 'Análise aprovada. A mensagem está disponível para o aluno.'
          : review?.rejected_at
            ? 'Análise rejeitada.'
            : '';
        decisionStatus.classList.toggle('hidden', !review?.approved_at && !review?.rejected_at);
      }
      resultSection.classList.remove('hidden');
    }

    function historyCard(item) {
      const card = element(document, 'article', 'training-review-item training-review-history-item');
      const copy = element(document, 'div');
      copy.append(element(document, 'strong', '', recommendationLabel(item)));
      copy.append(element(document, 'span', 'training-review-history-meta', new Date(item.created_at).toLocaleString('pt-BR')));
      const confidence = element(document, 'div', 'training-review-history-confidence', confidencePercent(item?.confidence) > 0 ? `${confidencePercent(item?.confidence)}%` : '—');
      card.append(copy, confidence);
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.addEventListener('click', () => renderReview(item));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          renderReview(item);
        }
      });
      return card;
    }

    async function fetchHistory({ show = true } = {}) {
      const planId = byId('review-plan')?.value;
      if (!planId) return [];
      const result = await request(`/api/training/plans/reviews?plan_id=${encodeURIComponent(planId)}&limit=20`);
      const rows = Array.isArray(result.data) ? result.data : [];
      if (show) {
        const list = byId('review-history-list');
        if (list) list.replaceChildren(...rows.map(historyCard));
        const comparison = byId('review-comparison');
        if (comparison) {
          const text = comparisonText(rows);
          comparison.textContent = text;
          comparison.classList.toggle('hidden', !text);
        }
        byId('review-history')?.classList.remove('hidden');
      }
      return rows;
    }

    function errorMessage(error) {
      const code = String(error?.message || error || '');
      const messages = {
        analise_em_andamento: 'Já existe uma análise em andamento. Aguarde a conclusão.',
        aguarde_nova_analise: 'Esta ficha foi analisada há pouco. Consulte o histórico.',
        limite_horario_atingido: 'O limite de análises desta hora foi atingido.',
        sem_permissao: 'Seu usuário não possui permissão para gerar esta análise.',
        ficha_nao_encontrada: 'A ficha selecionada não foi encontrada.',
        resposta_invalida: 'A análise foi processada, mas a tela não recebeu a resposta completa.'
      };
      return messages[code] || 'Não foi possível recuperar o resultado agora. Consulte o histórico.';
    }

    function startLoading() {
      const loading = byId('review-loading');
      if (!loading) return;
      loading.classList.remove('hidden');
      const spinner = element(document, 'span', 'training-review-spinner');
      spinner.setAttribute('aria-hidden', 'true');
      const text = document.createTextNode(' A IA está analisando... 0s. O processamento pode levar até alguns minutos.');
      loading.replaceChildren(spinner, text);
      const started = Date.now();
      loadingTimer = windowObject.setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        text.nodeValue = ` A IA está analisando... ${elapsed}s. O processamento pode levar até alguns minutos.`;
      }, 1000);
    }

    function stopLoading() {
      if (loadingTimer) windowObject.clearInterval(loadingTimer);
      loadingTimer = null;
      byId('review-loading')?.classList.add('hidden');
    }

    function wait(milliseconds) {
      return new Promise((resolve) => windowObject.setTimeout(resolve, milliseconds));
    }

    async function recoverRecentReview(requestStartedAt) {
      const deadline = Date.now() + 45000;
      do {
        try {
          const rows = await fetchHistory({ show: false });
          const recent = rows.find((item) => new Date(item.created_at).getTime() >= requestStartedAt - 5000);
          if (recent) return recent;
        } catch (_) {
          // Repete até o limite abaixo.
        }
        if (Date.now() >= deadline) break;
        await wait(2000);
      } while (Date.now() < deadline);
      return null;
    }

    async function generateReview() {
      const planId = byId('review-plan')?.value;
      const errorBox = byId('review-error');
      if (!planId) {
        if (errorBox) {
          errorBox.textContent = 'Selecione uma ficha antes de iniciar a análise.';
          errorBox.classList.remove('hidden');
        }
        return;
      }

      const requestStartedAt = Date.now();
      reviewButton.disabled = true;
      errorBox?.classList.add('hidden');
      resultSection.classList.add('hidden');
      byId('review-history')?.classList.add('hidden');
      startLoading();

      try {
        const review = await request('/api/training/plans/review', {
          method: 'POST',
          body: JSON.stringify({ plan_id: planId })
        });
        renderReview(review);
        const status = byId('training-status');
        if (status) status.textContent = 'Análise concluída.';
      } catch (error) {
        const recovered = shouldAttemptRecovery(error)
          ? await recoverRecentReview(requestStartedAt)
          : null;
        if (recovered) {
          errorBox?.classList.add('hidden');
          renderReview(recovered);
          const status = byId('training-status');
          if (status) status.textContent = 'Análise concluída.';
        } else if (errorBox) {
          errorBox.textContent = errorMessage(error);
          errorBox.classList.remove('hidden');
        }
      } finally {
        stopLoading();
        reviewButton.disabled = false;
      }
    }

    async function decide(decision) {
      if (!currentReview?.id) return;
      const reason = decision === 'reject' ? String(byId('review-rejection-reason')?.value || '').trim() : '';
      try {
        const review = await request(`/api/training/plans/review/${decision}`, {
          method: 'POST',
          body: JSON.stringify({ review_id: currentReview.id, reason })
        });
        renderReview(review);
        await fetchHistory({ show: true });
      } catch (error) {
        const errorBox = byId('review-error');
        if (errorBox) {
          errorBox.textContent = errorMessage(error);
          errorBox.classList.remove('hidden');
        }
      }
    }

    reviewButton.addEventListener('click', generateReview);
    historyButton.addEventListener('click', () => fetchHistory({ show: true }).catch((error) => {
      const errorBox = byId('review-error');
      if (errorBox) {
        errorBox.textContent = errorMessage(error);
        errorBox.classList.remove('hidden');
      }
    }));
    byId('review-approve-button')?.addEventListener('click', () => decide('approve'));
    byId('review-reject-button')?.addEventListener('click', () => decide('reject'));
  }

  return {
    install,
    confidencePercent,
    confidenceBand,
    confidenceText,
    statusLabel,
    recommendationLabel,
    sourceLabel,
    humanizeText,
    safeSummary,
    comparisonText,
    shouldAttemptRecovery,
    cleanEvidence,
    firstPercentage,
    firstScaleTen
  };
}));
