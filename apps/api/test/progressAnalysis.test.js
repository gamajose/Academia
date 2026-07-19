const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIntelligentMetrics, buildProgressAnalysis, carryForwardAssessments } = require('../lib/progressAnalysis');

test('keeps the previous measurement when the newest assessment leaves a field blank', () => {
  const assessments = carryForwardAssessments([
    { id: 'new', weight_kg: '79.00', waist_cm: null, chest_cm: null, hip_cm: null, biceps_cm: null, left_thigh_cm: null },
    { id: 'old', weight_kg: '80.00', waist_cm: '84.00', chest_cm: '101.00', hip_cm: '98.00', biceps_cm: '36.00', left_thigh_cm: '57.00' }
  ]);

  assert.equal(assessments[0].weight_kg, '79.00');
  assert.equal(assessments[0].waist_cm, '84.00');
  assert.equal(assessments[0].chest_cm, '101.00');
  assert.equal(assessments[0].hip_cm, '98.00');
  assert.equal(assessments[0].biceps_cm, '36.00');
  assert.equal(assessments[0].left_thigh_cm, '57.00');
});

test('does not interpret a missing measurement as zero in progress analysis', () => {
  const analysis = buildProgressAnalysis(
    { weight_kg: '79.00', waist_cm: null },
    { weight_kg: '80.00', waist_cm: '84.00' }
  );

  assert.equal(analysis.delta.weight_kg, -1);
  assert.equal(analysis.delta.waist_cm, null);
  assert.equal(analysis.projection.waist_cm, null);
  assert.doesNotMatch(analysis.message, /cintura/);
});

test('can compare the current measurement with the fixed initial baseline', () => {
  const analysis = buildProgressAnalysis(
    { weight_kg: 79, waist_cm: 84 },
    { weight_kg: 80, waist_cm: 84 },
    [],
    { comparisonLabel: 'medição inicial', includeProjection: false }
  );

  assert.match(analysis.message, /Desde a medição inicial/);
  assert.match(analysis.message, /peso reduziu 1,00 kg/);
  assert.equal(analysis.projection, null);
});

test('estimates body composition when a new assessment contains only weight', () => {
  const metrics = buildIntelligentMetrics(
    { assessment_date: '2026-07-15', weight_kg: 70, body_fat_percent: 18.5, muscle_mass_kg: 63.2, waist_cm: 84, measurement_sources: { measured: ['weight_kg'] } },
    { assessment_date: '2026-04-15', weight_kg: 79, body_fat_percent: 24, muscle_mass_kg: 60, waist_cm: 92 },
    { trainingSessions: 28 }
  );

  assert.equal(metrics.weight_kg.source, 'measured');
  assert.equal(metrics.body_fat_percent.source, 'estimated');
  assert.equal(metrics.muscle_mass_kg.source, 'estimated');
  assert.equal(metrics.waist_cm.source, 'estimated');
  assert.ok(metrics.body_fat_percent.value < 24);
  assert.ok(metrics.muscle_mass_kg.value > 60);
  assert.ok(metrics.waist_cm.value < 92);
});

test('keeps values marked as measured instead of replacing them with estimates', () => {
  const metrics = buildIntelligentMetrics(
    { assessment_date: '2026-07-15', weight_kg: 70, body_fat_percent: 17, muscle_mass_kg: 61, waist_cm: 82, measurement_sources: { measured: ['weight_kg', 'body_fat_percent', 'muscle_mass_kg', 'waist_cm'] } },
    { assessment_date: '2026-04-15', weight_kg: 79, body_fat_percent: 24, muscle_mass_kg: 60, waist_cm: 92 },
    { trainingSessions: 28 }
  );

  assert.equal(metrics.body_fat_percent.source, 'measured');
  assert.equal(metrics.body_fat_percent.value, 17);
  assert.equal(metrics.muscle_mass_kg.value, 61);
  assert.equal(metrics.waist_cm.value, 82);
});
