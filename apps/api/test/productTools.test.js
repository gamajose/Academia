const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ACCESS_GRACE_DAYS = '10';

const { normalizeLimit, dynamicNotifications } = require('../features/productToolsRoutes');

test('normalizeLimit aplica limites seguros', () => {
  assert.equal(normalizeLimit(undefined), 50);
  assert.equal(normalizeLimit('0'), 1);
  assert.equal(normalizeLimit('500'), 200);
  assert.equal(normalizeLimit('25'), 25);
});

test('notificacao dinamica informa bloqueio financeiro', () => {
  const items = dynamicNotifications({
    financial: {
      pending_payment: {
        overdue_days: 11,
        due_date: '2026-07-01',
        block_on: '2026-07-12'
      }
    },
    membership: null
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'access_blocked');
  assert.match(items[0].message, /11 dias/);
});

test('notificacao dinamica informa periodo de carencia', () => {
  const items = dynamicNotifications({
    financial: {
      pending_payment: {
        overdue_days: 4,
        due_date: '2026-07-07',
        block_on: '2026-07-18'
      }
    },
    membership: null
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'payment_overdue');
  assert.match(items[0].message, /2026-07-18/);
});
