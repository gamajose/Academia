(function (root, factory) {
  const reviewUi = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = reviewUi;
  if (root?.document) reviewUi.install(root);
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const STATUS_LABELS = {
    maintain: 'Manter a ficha atual',
    adjust: 'Ajustar a ficha',
    replace_partially: 'Substituir parte da ficha',
    professional_review: 'Revisão do professor necessária'
  };

  const SIGNAL_LABELS = {
    adherence: 'Frequência e regularidade',
    effort: 'Esforço percebido',
    progression: 'Progressão',
    assessment: 'Avaliações físicas',
    restriction: 'Restrições ou dores',
    balance: 'Equilíbrio da ficha',
    recovery: 'Recuperação',
    insufficient_data: 'Dados insuficientes'
  };

  const SEVERITY_LABELS = {
    info: 'Informação',
    attention: 'Atenção',
    critical: 'Prioridade alta'
  };

  const SUGGESTION_LABELS = {
    keep_plan: 'Manter a ficha',
    adjust_volume: 'Ajustar volume',
    adjust_rest: 'Ajustar descanso',
    progress_load: 'Avaliar progressão de carga',
    replace_exercise: 'Avaliar troca de exercício',
    reduce_load: 'Rever carga',
    professional_review: 'Revisão profissional'
  };

  const PRIORITY_LABELS = {
    low: 'Prioridade baixa',
    medium: 'Prioridade média',
    high: 'Prioridade alta'
  };

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
    return `Confiabilidade dos dados: ${percentage}% (${confidenceBand(value)})`;
  }

  function statusLabel(value) {
    return STATUS_LABELS[String(value || '')] || 'Acompanhamento do professor recomendado';
  }

  function recommendationLabel(review) {
    if (review?.requires_human_review && review?.status === 'maintain') {
      return 'Manter a ficha até a revisão do professor';
    }
    return statusLabel(review?.status);
  }

  function sourceLabel(value) {
    return String(value || '') === 'local_generative' ? 'IA local' : 'Regras automáticas';
  }

  function humanizeText(value) {
    return String(value || '')
      .replace(/\bfat_loss\b/gi, 'redução de gordura')
      .replace(/\bmuscle_gain\b/gi, 'ganho de massa muscular')
      .replace(/\bprofessional_review\b/gi, 'revisão do professor')
      .replace(/\breplace_partially\b/gi, 'substituição parcial')
      .replace(/\brules_fallback\b/gi, 'regras automáticas')
      .replace(/\blocal_generative\b/gi, 'IA local')
      .replace(/\bmaintain\b/gi, 'manter a ficha')
      .replace(/\badjust\b/gi, 'ajustar a ficha')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function plural(count, singular, pluralText) {
    return Number(count) === 1 ? singular : pluralText;
  }

  function safeSummary(review) {
    const summary = humanizeText(review?.summary || '');
    const normalized = summary.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const incompleteEnding = /\b(rep|reps|serie|series|sessao|sessoes|treino|exercicio|exercicios)$/i.test(normalized);
    if (summary.length >= 20 && /[.!?]$/.test(summary) && !incompleteEnding) return summary;
    if (review?.requires_human_review || review?.status === 'professional_review') {
      return 'A ficha precisa de revisão do professor antes de qualquer progressão.';
    }
    return 'A análise foi concluída. Consulte os pontos de atenção e as sugestões abaixo.';
  }

  function comparisonText(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return '';
    const currentSignals = Array.isArray(rows[0]?.signals) ? rows[0].signals.length : 0;
    const previousSignals = Array.isArray(rows[1]?.signals) ? rows[1].signals.length : 0;
    return [
      `Comparação com a análise anterior: agora a recomendação é “${recommendationLabel(rows[0]).toLowerCase()}”; antes era “${recommendationLabel(rows[1]).toLowerCase()}”.`,
      `A análise atual encontrou ${currentSignals} ${plural(currentSignals, 'ponto de atenção', 'pontos de atenção')}; a anterior encontrou ${previousSignals}.`
    ].join(' ');
  }

  const NON_RECOVERABLE_ERRORS = new Set([
    'aguarde_nova_analise',
    'limite_horario_atingido',
    'sem_permissao',
    'ficha_nao_encontrada',
    'plan_id_obrigatorio'
  ]);

  function shouldAttemptRecovery(error) {
    return !NON_RECOVERABLE_ERRORS.has(String(error?.message || error || ''));
  }

  function install(windowObject) {
    const document = windowObject.document;
    const byId = (id) => document.getElementById(id);
    const reviewButton = byId('review-plan-button');
    const historyButton = byId('review-history-button');
    if (!reviewButton || !historyButton) return;

    const apiBaseUrl = windowObject.localStorage.getItem('apiBaseUrl') || `http://${windowObject.location.hostname || 'localhost'}:3004`;
    const token = windowObject.localStorage.getItem('academiaToken') || '';
    let currentReview = null;
    let loadingTimer = null;

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

    function setText(id, value) {
      const element = byId(id);
      if (element) element.textContent = humanizeText(value);
    }

    function reviewItem(title, description, evidence = []) {
      const article = document.createElement('article');
      article.className = 'training-review-item';
      const heading = document.createElement('strong');
      heading.textContent = humanizeText(title);
      const body = document.createElement('div');
      body.textContent = humanizeText(description);
      article.append(heading, body);
      const safeEvidence = Array.isArray(evidence) ? evidence.filter(Boolean) : [];
      if (safeEvidence.length) {
        const list = document.createElement('ul');
        list.className = 'training-review-evidence';
        safeEvidence.forEach((value) => {
          const row = document.createElement('li');
          row.textContent = humanizeText(value);
          list.appendChild(row);
        });
        article.appendChild(list);
      }
      return article;
    }

    function ensureExplanation() {
      const badges = byId('review-source')?.parentElement;
      if (!badges) return;
      let status = byId('review-status-readable');
      if (!status) {
        status = document.createElement('p');
        status.id = 'review-status-readable';
        status.className = 'training-review-note';
        badges.insertAdjacentElement('afterend', status);
      }
      let help = byId('review-confidence-help');
      if (!help) {
        help = document.createElement('p');
        help.id = 'review-confidence-help';
        help.className = 'section-help';
        status.insertAdjacentElement('afterend', help);
      }
      help.textContent = 'A confiabilidade indica quanto a análise conseguiu se apoiar nos registros de treinos, avaliações e dados da ficha. Não é uma nota do aluno e não garante resultado.';
    }

    function renderReview(review) {
      currentReview = review;
      ensureExplanation();
      setText('review-source', sourceLabel(review?.source));
      setText('review-confidence', confidenceText(review?.confidence));
      const confidence = byId('review-confidence');
      if (confidence) confidence.title = 'Quanto maior o percentual, maior a quantidade e consistência dos dados disponíveis para a análise.';
      const human = byId('review-human');
      if (human) {
        human.textContent = 'Revisão do professor necessária';
        human.classList.toggle('hidden', !review?.requires_human_review);
      }
      setText('review-status-readable', `Recomendação: ${recommendationLabel(review)}.`);
      setText('review-summary', safeSummary(review));
      setText('review-student-message', review?.student_message || '');
      setText('review-trainer-notes', review?.trainer_notes || '');

      const signals = byId('review-signals');
      if (signals) {
        const rows = Array.isArray(review?.signals) ? review.signals : [];
        signals.replaceChildren(...rows.map((item) => reviewItem(
          `${SEVERITY_LABELS[item?.severity] || 'Informação'} · ${SIGNAL_LABELS[item?.type] || 'Acompanhamento'}`,
          item?.description || '',
          item?.evidence || []
        )));
      }

      const suggestions = byId('review-suggestions');
      if (suggestions) {
        const rows = Array.isArray(review?.suggestions) ? review.suggestions : [];
        suggestions.replaceChildren(...rows.map((item) => {
          const targets = [];
          if (item?.target_sets) targets.push(`${item.target_sets} séries`);
          if (item?.target_reps) targets.push(`${item.target_reps} repetições`);
          if (item?.target_rest_seconds) targets.push(`${item.target_rest_seconds}s de descanso`);
          return reviewItem(
            `${PRIORITY_LABELS[item?.priority] || 'Sugestão'} · ${SUGGESTION_LABELS[item?.type] || 'Acompanhamento'}`,
            item?.suggested_action || '',
            [item?.reason, targets.length ? `Referência sugerida: ${targets.join(', ')}` : null]
          );
        }));
      }

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
      byId('review-result')?.classList.remove('hidden');
    }

    function historyCard(item) {
      const card = reviewItem(
        `${new Date(item.created_at).toLocaleString('pt-BR')} · ${sourceLabel(item?.source)}`,
        safeSummary(item),
        [
          `Recomendação: ${recommendationLabel(item)}`,
          confidenceText(item?.confidence),
          item?.requires_human_review ? 'Revisão do professor: necessária' : 'Revisão do professor: acompanhamento normal'
        ]
      );
      card.classList.add('training-review-history-item');
      card.addEventListener('click', () => renderReview(item));
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
          // A consulta será repetida até o limite abaixo.
        }
        if (Date.now() >= deadline) break;
        await wait(2000);
      } while (Date.now() < deadline);
      return null;
    }

    function errorMessage(error) {
      const code = String(error?.message || error || '');
      const messages = {
        analise_em_andamento: 'Já existe uma análise em andamento. Aguarde a conclusão antes de tentar novamente.',
        aguarde_nova_analise: 'Esta ficha foi analisada há pouco. Consulte o histórico antes de gerar outra análise.',
        limite_horario_atingido: 'O limite de análises desta hora foi atingido.',
        sem_permissao: 'Seu usuário não possui permissão para gerar esta análise.',
        ficha_nao_encontrada: 'A ficha selecionada não foi encontrada.',
        resposta_invalida: 'A análise foi processada, mas a tela não recebeu a resposta completa. Consulte o histórico.'
      };
      return messages[code] || 'A tela perdeu o retorno da análise. Consulte o histórico; se houver uma análise nova, ela foi salva normalmente.';
    }

    function startLoading() {
      const loading = byId('review-loading');
      if (!loading) return;
      loading.classList.remove('hidden');
      const spinner = document.createElement('span');
      spinner.className = 'training-review-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      const text = document.createTextNode(' Analisando ficha com a IA local… 0s');
      loading.replaceChildren(spinner, text);
      const started = Date.now();
      loadingTimer = windowObject.setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        text.nodeValue = ` Analisando ficha com a IA local… ${elapsed}s. O processamento pode levar até alguns minutos.`;
      }, 1000);
    }

    function stopLoading() {
      if (loadingTimer) windowObject.clearInterval(loadingTimer);
      loadingTimer = null;
      byId('review-loading')?.classList.add('hidden');
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
      byId('review-result')?.classList.add('hidden');
      byId('review-history')?.classList.add('hidden');
      startLoading();

      try {
        const review = await request('/api/training/plans/review', {
          method: 'POST',
          body: JSON.stringify({ plan_id: planId })
        });
        renderReview(review);
        const status = byId('training-status');
        if (status) status.textContent = review.source === 'local_generative' ? 'Análise concluída pela IA local.' : 'Análise concluída pelas regras automáticas.';
      } catch (error) {
        const recovered = shouldAttemptRecovery(error)
          ? await recoverRecentReview(requestStartedAt)
          : null;
        if (recovered) {
          errorBox?.classList.add('hidden');
          renderReview(recovered);
          const status = byId('training-status');
          if (status) status.textContent = 'Análise concluída pela IA local.';
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

    if (typeof windowObject.reviewPlan === 'function') reviewButton.removeEventListener('click', windowObject.reviewPlan);
    if (typeof windowObject.loadReviewHistory === 'function') historyButton.removeEventListener('click', windowObject.loadReviewHistory);
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
    shouldAttemptRecovery
  };
}));
