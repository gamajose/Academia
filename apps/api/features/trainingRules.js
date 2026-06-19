const levelNames = {
  frango: 'frango',
  iniciante: 'frango',
  intermediario: 'intermediario',
  avancado: 'avancado'
};

function normalizeLevel(level) {
  return levelNames[String(level || '').toLowerCase()] || 'frango';
}

function progressionByLevel(level) {
  const normalized = normalizeLevel(level);
  if (normalized === 'avancado') return { sets: 4, reps: '6-10', rest_seconds: 90 };
  if (normalized === 'intermediario') return { sets: 4, reps: '8-12', rest_seconds: 75 };
  return { sets: 3, reps: '12-15', rest_seconds: 60 };
}

function avg(values) {
  const nums = values.map(Number).filter((item) => Number.isFinite(item));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildTrainingReview({ planAgeDays, level, exercises, logs = [], assessments = [] }) {
  const normalized = normalizeLevel(level);
  const progression = progressionByLevel(normalized);
  const suggestions = [];
  const avgEffort = avg(logs.map((item) => item.perceived_effort));
  const sessions = logs.length;
  const last = assessments[0] || null;
  const previous = assessments[1] || null;
  const weightDelta = last && previous && last.weight_kg && previous.weight_kg ? Number(last.weight_kg) - Number(previous.weight_kg) : null;

  const grouped = new Map();
  for (const item of exercises || []) {
    const group = item.muscle_group || 'geral';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(item);
  }

  if (sessions < 4 && planAgeDays >= 30) {
    suggestions.push({ type: 'adherence', reason: 'Poucos treinos registrados para a idade da ficha. Priorizar frequencia antes de aumentar volume.', target_sets: Math.max(2, progression.sets - 1), target_reps: progression.reps, target_rest_seconds: progression.rest_seconds });
  }

  if (avgEffort !== null && avgEffort >= 9) {
    suggestions.push({ type: 'manage_effort', reason: 'Esforco percebido muito alto. Avaliar carga, descanso e recuperacao.', target_sets: progression.sets, target_reps: progression.reps, target_rest_seconds: progression.rest_seconds + 15 });
  }

  if (avgEffort !== null && avgEffort <= 5 && sessions >= 6) {
    suggestions.push({ type: 'progress_load', reason: 'Boa frequencia com esforco baixo. Pode progredir carga ou complexidade.', target_sets: progression.sets, target_reps: progression.reps, target_rest_seconds: progression.rest_seconds });
  }

  if (weightDelta !== null && Math.abs(weightDelta) >= 2) {
    suggestions.push({ type: 'assessment_signal', reason: `Variacao fisica detectada: ${weightDelta.toFixed(1)}kg. Ajustar conforme objetivo.`, target_sets: progression.sets, target_reps: progression.reps, target_rest_seconds: progression.rest_seconds });
  }

  if (planAgeDays >= 90) {
    for (const [muscleGroup, rows] of grouped.entries()) {
      const current = rows[0];
      suggestions.push({ type: 'replace_exercise', muscle_group: muscleGroup, current_exercise: current?.exercise_name || null, reason: 'Ficha com 90 dias ou mais. Recomendada troca parcial para novo estimulo.', target_sets: progression.sets, target_reps: progression.reps, target_rest_seconds: progression.rest_seconds });
      if (suggestions.length >= 6) break;
    }
    return { recommendation: 'Trocar parte dos exercicios e ajustar volume conforme execucao, esforco e evolucao.', signals: { planAgeDays, sessions, avgEffort, weightDelta }, suggestions };
  }

  if (planAgeDays >= 45) {
    suggestions.push({ type: 'adjust_volume', reason: 'Ficha em meia vida. Ajustar carga, repeticoes ou descanso antes de trocar tudo.', target_sets: progression.sets, target_reps: progression.reps, target_rest_seconds: progression.rest_seconds });
    return { recommendation: 'Manter estrutura principal e evoluir volume/intensidade.', signals: { planAgeDays, sessions, avgEffort, weightDelta }, suggestions };
  }

  suggestions.push({ type: 'keep_plan', reason: 'Ficha recente. Continuar acompanhando execucao e feedback.', target_sets: progression.sets, target_reps: progression.reps, target_rest_seconds: progression.rest_seconds });
  return { recommendation: 'Manter ficha atual e acompanhar execucao.', signals: { planAgeDays, sessions, avgEffort, weightDelta }, suggestions };
}

module.exports = { normalizeLevel, progressionByLevel, buildTrainingReview };