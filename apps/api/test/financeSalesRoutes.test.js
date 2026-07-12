const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';

const { boundedInteger, addMonths } = require('../features/financeSalesRoutes');

test('boundedInteger keeps valid financial values', () => {
  assert.equal(boundedInteger('15990', 0), 15990);
  assert.equal(boundedInteger('-1', 10), 10);
  assert.equal(boundedInteger('invalid', 25), 25);
});

test('addMonths creates consecutive due dates', () => {
  assert.equal(addMonths('2026-07-15', 0), '2026-07-15');
  assert.equal(addMonths('2026-07-15', 1), '2026-08-15');
  assert.equal(addMonths('2026-07-15', 2), '2026-09-15');
});
