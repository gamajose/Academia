function numericDelta(current, previous, field) {
  const a = Number(current?.[field]);
  const b = Number(previous?.[field]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Number((a - b).toFixed(2));
}

function projection(current, change, field) {
  const value = Number(current?.[field]);
  if (!Number.isFinite(value) || !Number.isFinite(change)) return null;
  return Number((value + change * 3).toFixed(2));
}

function buildProgressAnalysis(current, previous, goals = []) {
  if (!current) return { status: 'empty', title: 'Comece seu acompanhamento', message: 'Registre sua primeira medição para acompanhar sua evolução.' };
  if (!previous) return { status: 'baseline', title: 'Primeira medição registrada', message: 'Esta avaliação será sua base de comparação para os próximos lançamentos.', projection: null };

  const delta = {
    weight_kg: numericDelta(current, previous, 'weight_kg'),
    body_fat_percent: numericDelta(current, previous, 'body_fat_percent'),
    muscle_mass_kg: numericDelta(current, previous, 'muscle_mass_kg'),
    waist_cm: numericDelta(current, previous, 'waist_cm')
  };
  const signals = [];
  if (delta.body_fat_percent !== null && delta.body_fat_percent < 0) signals.push(`gordura corporal caiu ${Math.abs(delta.body_fat_percent).toFixed(2).replace('.', ',')} p.p.`);
  if (delta.muscle_mass_kg !== null && delta.muscle_mass_kg > 0) signals.push(`massa muscular subiu ${delta.muscle_mass_kg.toFixed(2).replace('.', ',')} kg`);
  if (delta.waist_cm !== null && delta.waist_cm < 0) signals.push(`cintura reduziu ${Math.abs(delta.waist_cm).toFixed(2).replace('.', ',')} cm`);
  if (!signals.length) signals.push('continue registrando medições para identificar tendências com mais confiança');

  return {
    status: 'comparison',
    title: 'Análise inteligente do progresso',
    message: `Desde a avaliação anterior, ${signals.join(' e ')}.`,
    delta,
    projection: {
      months: 3,
      weight_kg: projection(current, delta.weight_kg, 'weight_kg'),
      body_fat_percent: projection(current, delta.body_fat_percent, 'body_fat_percent'),
      muscle_mass_kg: projection(current, delta.muscle_mass_kg, 'muscle_mass_kg'),
      waist_cm: projection(current, delta.waist_cm, 'waist_cm')
    },
    goal_count: goals.length,
    disclaimer: 'Estimativa automática baseada nas duas últimas medições. Não substitui a avaliação do profissional.'
  };
}

module.exports = { buildProgressAnalysis };
