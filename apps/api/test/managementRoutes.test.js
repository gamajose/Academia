const test = require('node:test');
const assert = require('node:assert/strict');

const { reportDays } = require('../features/managementRoutes');

test('reportDays uses safe defaults and bounds', () => {
  assert.equal(reportDays(undefined), 30);
  assert.equal(reportDays('1'), 7);
  assert.equal(reportDays('30'), 30);
  assert.equal(reportDays('999'), 365);
  assert.equal(reportDays('invalid'), 30);
});
