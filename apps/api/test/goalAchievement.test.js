const test = require('node:test');
const assert = require('node:assert/strict');
const { goalWasReached, measurementFieldForGoal, reachedGoals } = require('../lib/goalAchievement');

test('completes a weight goal when the new measurement reaches the target exactly', () => {
  const goal = { id: 'goal-1', goal_type: 'Peso', target_value: '79.00', status: 'active' };
  assert.equal(goalWasReached(goal, { weight_kg: '79.00' }, { weight_kg: '80.00' }), true);
});

test('recognizes a weight goal written in natural Portuguese', () => {
  const goal = { goal_type: 'Chegar a 79 quilos', target_value: 79, status: 'active' };
  assert.equal(goalWasReached(goal, { weight_kg: 79 }, { weight_kg: 80 }), true);
});

test('completes a goal when the measurement crosses the target in either direction', () => {
  const loss = { goal_type: 'Peso', target_value: 79, status: 'active' };
  const gain = { goal_type: 'Massa muscular', target_value: 65, status: 'active' };
  assert.equal(goalWasReached(loss, { weight_kg: 78.8 }, { weight_kg: 80 }), true);
  assert.equal(goalWasReached(gain, { muscle_mass_kg: 65.2 }, { muscle_mass_kg: 64 }), true);
});

test('does not auto-complete unsupported or already completed goals', () => {
  assert.equal(measurementFieldForGoal('Correr 5 km'), null);
  assert.deepEqual(reachedGoals([
    { goal_type: 'Correr 5 km', target_value: 5, status: 'active' },
    { goal_type: 'Peso', target_value: 79, status: 'completed' }
  ], { weight_kg: 79 }, { weight_kg: 80 }), []);
});
