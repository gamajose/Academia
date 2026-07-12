const test = require('node:test');
const assert = require('node:assert/strict');
const { canAccess, accessProfile } = require('../lib/accessControl');

test('perfil de recepcao nao acessa financeiro ou usuarios', () => {
  const user = { role: 'staff', access_profile: 'reception' };
  assert.equal(accessProfile(user), 'reception');
  assert.equal(canAccess(user, 'GET', '/api/members'), true);
  assert.equal(canAccess(user, 'GET', '/api/finance/overview'), false);
  assert.equal(canAccess(user, 'GET', '/api/users'), false);
});

test('perfil de personal acessa treinos e evolucao, sem financeiro', () => {
  const user = { role: 'staff', access_profile: 'trainer' };
  assert.equal(canAccess(user, 'GET', '/api/training/exercises'), true);
  assert.equal(canAccess(user, 'POST', '/api/assessments'), true);
  assert.equal(canAccess(user, 'GET', '/api/finance/overview'), false);
});

test('administrador mantem acesso total', () => {
  assert.equal(canAccess({ role: 'admin' }, 'GET', '/api/users'), true);
  assert.equal(canAccess({ role: 'owner' }, 'GET', '/api/finance/overview'), true);
});
