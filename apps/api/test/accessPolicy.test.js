const test = require('node:test');
const assert = require('node:assert/strict');

const { calendarDaysLate, evaluateAccess } = require('../lib/accessPolicy');

const base = {
  memberActive: true,
  membershipStatus: 'active',
  membershipEndsAt: '2026-08-01',
  today: '2026-07-11',
  graceDays: 10
};

test('calculo usa dias de calendario', () => {
  assert.equal(calendarDaysLate('2026-07-11', '2026-07-01'), 10);
  assert.equal(calendarDaysLate('2026-07-11', '2026-07-11'), 0);
  assert.equal(calendarDaysLate('2026-07-11', '2026-07-20'), 0);
});

test('aluno regular recebe acesso liberado', () => {
  const result = evaluateAccess(base);
  assert.equal(result.allowed, true);
  assert.equal(result.status, 'current');
  assert.equal(result.overdue_days, 0);
});

test('atraso de dez dias ainda fica na carencia', () => {
  const result = evaluateAccess({ ...base, oldestUnpaidDueDate: '2026-07-01' });
  assert.equal(result.allowed, true);
  assert.equal(result.status, 'grace_period');
  assert.equal(result.overdue_days, 10);
  assert.equal(result.remaining_grace_days, 0);
});

test('atraso de onze dias bloqueia a entrada', () => {
  const result = evaluateAccess({ ...base, oldestUnpaidDueDate: '2026-06-30' });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'payment_grace_expired');
  assert.equal(result.overdue_days, 11);
});

test('matricula vencida usa a mesma regra de carencia', () => {
  const result = evaluateAccess({ ...base, membershipEndsAt: '2026-07-01' });
  assert.equal(result.allowed, true);
  assert.equal(result.status, 'grace_period');
  assert.equal(result.overdue_days, 10);
});

test('cadastro ou matricula inativa bloqueiam acesso', () => {
  assert.equal(evaluateAccess({ ...base, memberActive: false }).reason, 'member_inactive');
  assert.equal(evaluateAccess({ ...base, membershipStatus: 'expired' }).reason, 'membership_inactive');
});
