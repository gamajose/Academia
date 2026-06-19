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

function buildTrainingReview({ planAgeDays, level, exercises }) {
  const normalized = normalizeLevel(level);
  const progression = progressionByLevel(normalized);
  const suggestions = [];

  const grouped = new Map();
  for (const item of exercises || []) {
    const group = item.muscle_group || 'geral';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(item);
  }

  if (planAgeDays >= 90) {
    for (const [muscleGroup, rows] of grouped.entries()) {
      const current = rows[0];
      suggestions.push({
        type: 'replace_exercise',
        muscle_group: muscleGroup,
        current_exercise: current?.exercise_name || null,
        reason: 'Ficha com 90 dias ou mais. Recomendada troca parcial para novo estimulo.',
        target_sets: progression.sets,
        target_reps: progression.reps,
        target_rest_seconds: progression.rest_seconds
      });
      if (suggestions.length >= 4) break;
    }
    return {
      recommendation: 'Trocar parte dos exercicios e ajustar volume conforme nivel do aluno.',
      suggestions
    };
  }

  if (planAgeDays >= 45) {
    suggestions.push({
      type: 'adjust_volume',
      reason: 'Ficha em meia vida. Ajustar carga, repeticoes ou descanso antes de trocar tudo.',
      target_sets: progression.sets,
      target_reps: progression.reps,
      target_rest_seconds: progression.rest_seconds
    });
    return { recommendation: 'Manter estrutura principal e evoluir volume/intensidade.', suggestions };
  }

  suggestions.push({
    type: 'keep_plan',
    reason: 'Ficha recente. Ainda e cedo para trocar exercicios, salvo dor, limitacao ou baixa aderencia.',
    target_sets: progression.sets,
    target_reps: progression.reps,
    target_rest_seconds: progression.rest_seconds
  });
  return { recommendation: 'Manter ficha atual e acompanhar execucao.', suggestions };
}

module.exports = { normalizeLevel, progressionByLevel, buildTrainingReview };
