const levelNames = {
  frango: 'iniciante',
  iniciante: 'iniciante',
  intermediario: 'intermediario',
  avançado: 'avancado',
  avancado: 'avancado'
};

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function normalizeLevel(level) {
  const normalized = normalizeText(level);
  return levelNames[normalized] || normalized || 'iniciante';
}

function progressionByLevel(level) {
  const normalized = normalizeLevel(level);
  if (normalized === 'avancado') return { sets: 4, reps: '6-10', rest_seconds: 90 };
  if (normalized === 'intermediario') return { sets: 4, reps: '8-12', rest_seconds: 75 };
  return { sets: 3, reps: '10-15', rest_seconds: 60 };
}

function avg(values) {
  const nums = values.map(Number).filter((item) => Number.isFinite(item));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function metricDelta(assessments, field) {
  const current = Number(assessments?.[0]?.[field]);
  const previous = Number(assessments?.[1]?.[field]);
  return Number.isFinite(current) && Number.isFinite(previous) ? current - previous : null;
}

function suggestion(type, priority, action, reason, progression, extra = {}) {
  return {
    type,
    priority,
    muscle_group: extra.muscle_group || null,
    current_exercise_id: extra.current_exercise_id || null,
    current_exercise: extra.current_exercise || null,
    suggested_exercise_id: extra.suggested_exercise_id || null,
    suggested_exercise: extra.suggested_exercise || null,
    suggested_action: action,
    reason,
    target_sets: extra.target_sets ?? progression.sets,
    target_reps: extra.target_reps ?? progression.reps,
    target_rest_seconds: extra.target_rest_seconds ?? progression.rest_seconds
  };
}

function buildTrainingReview(input = {}) {
  const snapshot = input.snapshot || {};
  const plan = snapshot.plan || {};
  const exercises = input.exercises || plan.exercises || [];
  const logs = input.logs || snapshot.executions || [];
  const exerciseLogs = input.exerciseLogs || snapshot.exercise_executions || [];
  const assessments = input.assessments || snapshot.assessments || [];
  const restrictions = input.restrictions || snapshot.restrictions || [];
  const planAgeDays = Number(input.planAgeDays ?? plan.age_days ?? 0);
  const level = input.level || snapshot.level;
  const progression = progressionByLevel(level);
  const completed = logs.filter((item) => String(item.status || 'completed') === 'completed');
  const sessions = completed.length;
  const avgEffort = avg(logs.map((item) => item.perceived_effort));
  const avgPain = avg(exerciseLogs.map((item) => item.pain_level));
  const adherence = Number(snapshot.execution_summary?.adherence_rate);
  const weightDelta = metricDelta(assessments, 'weight_kg');
  const fatDelta = metricDelta(assessments, 'body_fat_percent');
  const waistDelta = metricDelta(assessments, 'waist_cm');
  const feedbackText = normalizeText(logs.map((item) => item.feedback).join(' '));
  const painMentioned = /dor|lesao|lesão|machuc|incômodo|incomodo/.test(feedbackText);
  const signals = [];
  const suggestions = [];
  let requiresHumanReview = false;

  const addSignal = (type, severity, description, evidence) => {
    signals.push({ type, severity, description, evidence: evidence.filter(Boolean).slice(0, 6) });
    if (severity === 'critical') requiresHumanReview = true;
  };

  if (Number.isFinite(adherence)) {
    const severity = adherence < 0.45 ? 'attention' : 'info';
    addSignal('adherence', severity, adherence < 0.45 ? 'A frequência está abaixo do planejado.' : 'A frequência registrada está compatível com o período.', [`Adesão calculada: ${Math.round(adherence * 100)}%`, `${sessions} sessões concluídas`]);
  } else if (sessions < 4 && planAgeDays >= 30) {
    addSignal('adherence', 'attention', 'Há poucos treinos registrados para a idade da ficha.', [`${sessions} sessões registradas`, `Ficha com ${planAgeDays} dias`]);
  }

  if (avgEffort !== null) {
    addSignal('effort', avgEffort >= 9 ? 'critical' : avgEffort >= 8 ? 'attention' : 'info', avgEffort >= 8 ? 'O esforço percebido está alto.' : 'O esforço percebido está em faixa de acompanhamento.', [`Esforço médio: ${avgEffort.toFixed(1)}/10`]);
  }

  if (avgPain !== null || painMentioned) {
    const pain = avgPain === null ? null : avgPain.toFixed(1);
    addSignal('restriction', 'critical', 'Há registro de dor ou desconforto e a ficha precisa de revisão profissional.', [pain ? `Dor média: ${pain}/10` : 'Dor ou lesão mencionada no feedback']);
  }

  if (restrictions.length) {
    addSignal('restriction', 'critical', 'Existem restrições cadastradas que precisam ser consideradas antes de qualquer ajuste.', restrictions.map((_, index) => `Restrição cadastrada ${index + 1}`));
  }

  const assessmentEvidence = [];
  if (weightDelta !== null) assessmentEvidence.push(`Variação de peso: ${weightDelta.toFixed(1)} kg`);
  if (fatDelta !== null) assessmentEvidence.push(`Variação de gordura: ${fatDelta.toFixed(1)} p.p.`);
  if (waistDelta !== null) assessmentEvidence.push(`Variação de cintura: ${waistDelta.toFixed(1)} cm`);
  if (assessmentEvidence.length) addSignal('assessment', 'info', 'As avaliações recentes apresentam mudanças mensuráveis.', assessmentEvidence);
  if (assessments.length < 2) {
    addSignal('assessment', 'attention', 'Há poucos dados físicos para comparar evolução com segurança.', [`${assessments.length} avaliação disponível`]);
    requiresHumanReview = true;
  }

  if (requiresHumanReview) {
    suggestions.push(suggestion('professional_review', 'high', 'Revisar a ficha presencialmente antes de progredir carga, volume ou complexidade.', 'Dor, restrição, esforço excessivo ou dados insuficientes exigem decisão do profissional.', progression, { target_sets: null, target_reps: null, target_rest_seconds: null }));
  } else if ((Number.isFinite(adherence) && adherence < 0.6) || (sessions < 4 && planAgeDays >= 30)) {
    suggestions.push(suggestion('adjust_volume', 'high', 'Priorizar consistência e ajustar o volume à rotina real do aluno.', 'Aumentar volume sem frequência suficiente tende a reduzir a aderência.', progression, { target_sets: Math.max(2, progression.sets - 1) }));
  } else if (avgEffort !== null && avgEffort >= 8) {
    suggestions.push(suggestion('reduce_load', 'high', 'Rever carga e ampliar o descanso entre séries.', 'O esforço percebido está elevado nos registros recentes.', progression, { target_rest_seconds: Math.min(600, progression.rest_seconds + 30) }));
  } else if (avgEffort !== null && avgEffort <= 5 && sessions >= 6) {
    suggestions.push(suggestion('progress_load', 'medium', 'Avaliar progressão gradual de carga com técnica preservada.', 'Há frequência suficiente e esforço percebido baixo.', progression));
  }

  if (planAgeDays >= 90 && !requiresHumanReview) {
    const seen = new Set();
    for (const item of exercises) {
      const group = item.muscle_group_primary || item.muscle_group || 'geral';
      if (seen.has(group)) continue;
      seen.add(group);
      suggestions.push(suggestion('replace_exercise', 'medium', `Avaliar troca parcial de estímulo para ${group}.`, 'A ficha tem 90 dias ou mais; qualquer substituição deve usar a biblioteca da academia e ser aprovada pelo profissional.', progression, {
        muscle_group: group,
        current_exercise_id: item.exercise_id || null,
        current_exercise: item.exercise_name || item.name || null
      }));
      if (seen.size >= 3) break;
    }
  } else if (planAgeDays >= 45 && !requiresHumanReview) {
    suggestions.push(suggestion('adjust_volume', 'medium', 'Revisar volume, repetições e descanso sem trocar toda a ficha.', 'A ficha chegou à janela de revisão de 45 dias.', progression));
  }

  if (!suggestions.length) {
    suggestions.push(suggestion('keep_plan', 'low', 'Manter a ficha e continuar registrando execução, esforço e feedback.', 'Não há sinal objetivo suficiente para uma alteração imediata.', progression));
  }

  const status = requiresHumanReview
    ? 'professional_review'
    : planAgeDays >= 90
      ? 'replace_partially'
      : suggestions.some((item) => ['adjust_volume', 'adjust_rest', 'progress_load', 'reduce_load'].includes(item.type))
        ? 'adjust'
        : 'maintain';
  const confidenceEvidence = [sessions >= 4, assessments.length >= 2, exercises.length > 0, Number.isFinite(adherence)].filter(Boolean).length;
  const confidence = Number(Math.min(0.9, 0.25 + confidenceEvidence * 0.16).toFixed(2));
  const summary = status === 'professional_review'
    ? 'A ficha precisa de revisão do profissional antes de qualquer progressão.'
    : status === 'replace_partially'
      ? 'A ficha está em janela de troca parcial, preservando o que continua funcionando.'
      : status === 'adjust'
        ? 'A ficha pode receber ajustes graduais com acompanhamento do profissional.'
        : 'Os dados atuais sustentam a manutenção da ficha com acompanhamento.';
  return {
    summary,
    status,
    confidence,
    requires_human_review: requiresHumanReview,
    signals,
    suggestions,
    student_message: requiresHumanReview
      ? 'Seu professor identificou pontos que precisam ser revisados antes de mudar seu treino.'
      : 'Continue registrando seus treinos e siga as orientações do seu professor.',
    trainer_notes: `${summary} Foram consideradas ${sessions} execuções, ${assessments.length} avaliações e ${exercises.length} exercícios.`
  };
}

module.exports = { normalizeLevel, progressionByLevel, buildTrainingReview };
