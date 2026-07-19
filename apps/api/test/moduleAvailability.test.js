const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeModules, moduleForRequest } = require('../lib/moduleAvailability');

test('all academy modules are enabled by default', () => {
  const modules = normalizeModules();
  assert.equal(Object.values(modules).every(Boolean), true);
});

test('normalization only disables explicit false values', () => {
  const modules = normalizeModules({ access: false, finance: 0, training: null });
  assert.equal(modules.access, false);
  assert.equal(modules.finance, true);
  assert.equal(modules.training, true);
});

test('request paths resolve to the global academy module', () => {
  assert.equal(moduleForRequest('/api/student/admin-community/feed'), 'community');
  assert.equal(moduleForRequest('/api/student/access/status'), 'access');
  assert.equal(moduleForRequest('/api/access-profiles'), 'users');
  assert.equal(moduleForRequest('/api/student/progress'), 'assessments');
  assert.equal(moduleForRequest('/api/student/me'), null);
});
