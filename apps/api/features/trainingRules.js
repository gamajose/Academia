const levelNames = {
  frango: 'iniciante',
  iniciante: 'iniciante',
  intermediario: 'intermediario',
  avançado: 'avancado',
  avancado: 'avancado'
};

const EMPTY_RESTRICTION_MARKERS = new Set([
  'sem restricao informada',
  'sem restricoes informadas',
  'nenhuma restricao informada',
  'nenhuma restricao cadastrada',
  'nao possui restricao',
  'nao possui restricoes',
  'sem alergia informada',
  'sem alergias informadas',
  'nenhuma alergia informada',
  'sem observacao medica',
  'sem observacoes medicas',
  'nenhuma observacao medica',
  'nao informado',
  'nao informada',
  'nenhum',
  'nenhuma'
]);

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function isMeaningfulRestriction(value) {
  const normalized = normalizeText(value).replace(/[.!?;:]+$/g, '').replace(/\s+/g, ' ').trim();
  return Boolean(normalized) && !EMPTY_RESTRICTION_MARKERS.has(normalized);
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

function formatAssessmentDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

function describeAssessment(item = {}) {
  const details = [];
  const date = formatAssessmentDate(item.assessment_date);
  if (date) details.push(`Avaliação realizada em ${date}`);
  if (Number.isFinite(Number(item.weight_kg))) details.push(`Peso: ${Number(item.weight_kg).toFixed(1)} kg`);
  if (Number.isFinite(Number(item.body_fat_percent))) details.push(`Gordura corporal: ${Number(item.body_fat_percent).toFixed(1)}%`);
  if (Number.isFinite(Number(item.muscle_mass_kg))) details.push(`Massa muscular: ${Number(item.muscle_mass_kg).toFixed(1)} kg`);
  if (Number.isFinite(Number(item.waist_cm))) details.push(`Cintura: ${Number(item.waist_cm).toFixed(1)} cm`);
  return details.slice(0, 4);
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

function categorizeMuscleGroup(primary, secondary, name) {
  const text = normalizeText([primary, secondary, name].filter(Boolean).join(' '));
  if (/peit/.test(text)) return 'Peito';
  if (/costa|dorsal|lombar|remada|puxada/.test(text)) return 'Costas';
  if (/perna|quadricep|posterior|coxa|panturrilha|glute|agach|leg press/.test(text)) return 'Membros Inferiores';
  if (/ombro|deltoid|desenvolvimento|elevacao lateral/.test(text)) return 'Ombros';
  if (/biceps|triceps|braco|antebraco|rosca/.test(text)) return 'Braços';
  if (/abd|core|obliqu|prancha/.test(text)) return 'Abdômen / Core';
  return primary ? String(primary).trim() : 'Geral';
}

function buildTrainingReview(input = {}) {
  const snapshot = input.snapshot || {};
  const plan = snapshot.plan || {};
  const exercises = input.exercises || plan.exercises || [];
  const logs = input.logs || snapshot.executions || [];
  const exerciseLogs = input.exerciseLogs || snapshot.exercise_executions || [];
  const assessments = input.assessments || snapshot.assessments || [];
  const restrictions = (input.restrictions || snapshot.restrictions || []).filter(isMeaningfulRestriction);
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
    addSignal(
      'restriction',
      'critical',
      'Existem restrições cadastradas que precisam ser consideradas antes de qualquer ajuste.',
      restrictions.map((value) => `Restrição informada: ${String(value).trim()}`).filter((value) => value !== 'Restrição informada:')
    );
  }

  const assessmentEvidence = [];
  if (weightDelta !== null) assessmentEvidence.push(`Variação de peso: ${weightDelta.toFixed(1)} kg`);
  if (fatDelta !== null) assessmentEvidence.push(`Variação de gordura: ${fatDelta.toFixed(1)} p.p.`);
  if (waistDelta !== null) assessmentEvidence.push(`Variação de cintura: ${waistDelta.toFixed(1)} cm`);
  if (assessmentEvidence.length) addSignal('assessment', 'info', 'As avaliações recentes apresentam mudanças mensuráveis.', assessmentEvidence);
  if (assessments.length < 2) {
    const evidence = assessments.length
      ? describeAssessment(assessments[0])
      : ['Nenhuma avaliação física registrada'];
    addSignal('assessment', 'attention', 'Ainda não há avaliações suficientes para comparar evolução com segurança.', evidence);
    requiresHumanReview = true;
  }

  if (exercises.length >= 2) {
    const groupSets = new Map();
    for (const ex of exercises) {
      const group = categorizeMuscleGroup(ex.muscle_group_primary, ex.muscle_group_secondary, ex.name || ex.exercise_name);
      const sets = Number.isFinite(Number(ex.sets)) && Number(ex.sets) > 0 ? Number(ex.sets) : 3;
      groupSets.set(group, (groupSets.get(group) || 0) + sets);
    }
    const sortedGroups = [...groupSets.entries()].sort((a, b) => b[1] - a[1]);
    const balanceEvidence = sortedGroups.slice(0, 4).map(([grp, count]) => `${grp}: ${count} séries`);

    const hasChest = groupSets.has('Peito');
    const hasBack = groupSets.has('Costas');
    const hasLegs = groupSets.has('Membros Inferiores');
    const chestSets = groupSets.get('Peito') || 0;
    const backSets = groupSets.get('Costas') || 0;

    if (chestSets >= 8 && backSets === 0) {
      addSignal('balance', 'attention', 'Desproporção entre peito e costas; recomenda-se incluir exercícios de tração/costas.', balanceEvidence);
    } else if ((hasChest || hasBack) && !hasLegs && exercises.length >= 4) {
      addSignal('balance', 'attention', 'A ficha atual não contempla exercícios para membros inferiores.', balanceEvidence);
    } else {
      addSignal('balance', 'info', 'Distribuição de volume muscular equilibrada entre os grupamentos planejados.', balanceEvidence);
    }
  }

  if (exerciseLogs.length >= 2) {
    const loads = exerciseLogs
      .map((item) => {
        const match = String(item.load_used || '').match(/(\d+(?:[.,]\d+)?)/);
        return match ? parseFloat(match[1].replace(',', '.')) : null;
      })
      .filter((val) => val !== null && Number.isFinite(val) && val > 0);

    if (loads.length >= 2) {
      const recentAvg = avg(loads.slice(0, Math.min(4, Math.ceil(loads.length / 2))));
      const pastAvg = avg(loads.slice(-Math.min(4, Math.ceil(loads.length / 2))));
      if (recentAvg !== null && pastAvg !== null && recentAvg > pastAvg * 1.05) {
        addSignal('progression', 'info', 'Sobrecarga progressiva positiva observada nas cargas registradas.', [
          `Carga média recente: ${recentAvg.toFixed(1)} kg`,
          `Carga média anterior: ${pastAvg.toFixed(1)} kg`
        ]);
      } else if (avgEffort !== null && avgEffort <= 5 && sessions >= 4) {
        addSignal('progression', 'info', 'Cargas estáveis com esforço percebido moderado ou baixo.', [
          `Carga média: ${recentAvg ? recentAvg.toFixed(1) + ' kg' : 'Estável'}`,
          'Margem favorável para progressão gradual com o professor'
        ]);
      } else {
        addSignal('progression', 'info', 'Cargas mantidas estáveis nos treinos recentes.', [
          'Acompanhamento de adaptação neuromuscular em andamento'
        ]);
      }
    } else if (sessions >= 4) {
      addSignal('progression', 'info', 'Registro de cargas em andamento.', [
        'O apontamento das cargas utilizadas aprimora o cálculo da progressão'
      ]);
    }
  }

  if (completed.length >= 2) {
    const dates = completed
      .map((item) => (item.completed_at ? new Date(item.completed_at).getTime() : null))
      .filter((t) => t !== null && !Number.isNaN(t))
      .sort((a, b) => b - a);

    if (dates.length >= 2) {
      const intervalsDays = [];
      for (let i = 0; i < dates.length - 1; i++) {
        intervalsDays.push(Math.abs(dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24));
      }
      const avgInterval = avg(intervalsDays);
      const minInterval = Math.min(...intervalsDays);

      if (minInterval < 1.0 && avgEffort !== null && avgEffort >= 8) {
        addSignal('recovery', 'attention', 'Treinos intensos em dias consecutivos sem descanso intermediário.', [
          'Intervalo menor que 24h com esforço percebido elevado'
        ]);
      } else if (avgInterval !== null) {
        addSignal('recovery', 'info', 'Cadência de treinos e dias de descanso adequados à rotina.', [
          `Intervalo médio entre sessões: ${avgInterval.toFixed(1)} dias`
        ]);
      }
    }
  }

  let professionalReviewReason = 'Dor, restrição, esforço excessivo ou dados insuficientes exigem decisão do profissional.';
  if (avgPain !== null || painMentioned) {
    professionalReviewReason = 'Registro de dor ou desconforto reportado pelo aluno requer avaliação presencial.';
  } else if (restrictions.length) {
    professionalReviewReason = 'Restrições clínicas cadastradas exigem validação prévia dos exercícios e amplitudes.';
  } else if (avgEffort !== null && avgEffort >= 9) {
    professionalReviewReason = 'Esforço percebido máximo (RPE >= 9) em treinos recentes requer ajuste de intensidade.';
  } else if (assessments.length < 2) {
    professionalReviewReason = 'Ainda não há histórico comparativo de avaliações físicas para balizar a evolução.';
  }

  if (requiresHumanReview) {
    suggestions.push(suggestion('professional_review', 'high', 'Revisar a ficha presencialmente antes de progredir carga, volume ou complexidade.', professionalReviewReason, progression, { target_sets: null, target_reps: null, target_rest_seconds: null }));
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
  const confidenceEvidence = [
    sessions >= 4,
    assessments.length >= 2,
    exercises.length > 0,
    Number.isFinite(adherence),
    exerciseLogs.length >= 2
  ].filter(Boolean).length;
  const confidence = Number(Math.min(0.9, 0.25 + confidenceEvidence * 0.16).toFixed(2));
  const summary = status === 'professional_review'
    ? 'A ficha precisa de revisão do profissional antes de qualquer progressão.'
    : status === 'replace_partially'
      ? 'A ficha está em janela de troca parcial, preservando o que continua funcionando.'
      : status === 'adjust'
        ? 'A ficha pode receber ajustes graduais com acompanhamento do profissional.'
        : 'Os dados atuais sustentam a manutenção da ficha com acompanhamento.';
  const studentMessage = requiresHumanReview
    ? 'Seu professor identificou pontos importantes na sua rotina que merecem uma conversa presencial antes de avançar nas cargas.'
    : sessions >= 4
      ? 'Excelente constância! Continue registrando seus treinos e dialogando com seu professor para manter sua evolução.'
      : 'Bom início de ciclo! Mantenha o foco em completar suas sessões e registrar seu esforço ao final de cada treino.';
  return {
    summary,
    status,
    confidence,
    requires_human_review: requiresHumanReview,
    signals,
    suggestions,
    student_message: studentMessage,
    trainer_notes: `${summary} Foram consideradas ${sessions} execuções, ${assessments.length} avaliações e ${exercises.length} exercícios planejados.`
  };
}

module.exports = { normalizeLevel, progressionByLevel, describeAssessment, isMeaningfulRestriction, buildTrainingReview };
