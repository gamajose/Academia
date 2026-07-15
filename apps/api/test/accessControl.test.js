const test = require('node:test');
const assert = require('node:assert/strict');
const { canAccess, accessProfile, hasModulePermission, moduleForPath } = require('../lib/accessControl');

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

test('perfil configuravel libera somente os modulos marcados', () => {
  const user = { role: 'staff', access_profile: 'atendimento' };
  const permissions = { dashboard: true, members: true, finance: true, training: false };
  assert.equal(moduleForPath('/api/finance/receivables'), 'finance');
  assert.equal(canAccess(user, 'GET', '/api/finance/receivables', permissions), true);
  assert.equal(canAccess(user, 'GET', '/api/training/exercises', permissions), false);
  assert.equal(hasModulePermission({ ...user, access_permissions: permissions }, 'finance'), true);
  assert.equal(hasModulePermission({ ...user, access_permissions: permissions }, 'training'), false);
});

test('perfil de administrador tambem pode ser restringido pelo cadastro', () => {
  const permissions = { dashboard: true, users: false };
  assert.equal(canAccess({ role: 'admin' }, 'GET', '/api/users'), true);
  assert.equal(canAccess({ role: 'admin' }, 'GET', '/api/users', permissions), false);
  assert.equal(canAccess({ role: 'owner' }, 'GET', '/api/users', permissions), true);
});

test('aluno pode enviar foto de evolucao sem acessar rotas administrativas', () => {
  const user = { role: 'student', member_id: 'member-1' };
  assert.equal(canAccess(user, 'POST', '/api/editor/images'), true);
  assert.equal(canAccess(user, 'POST', '/api/student/progress/photos'), true);
  assert.equal(canAccess(user, 'GET', '/api/finance/overview'), false);
});

test('aluno pode gerenciar apenas as proprias metas', () => {
  const user = { role: 'student', member_id: 'member-1' };
  assert.equal(canAccess(user, 'GET', '/api/student/goals'), true);
  assert.equal(canAccess(user, 'POST', '/api/student/goals'), true);
  assert.equal(canAccess(user, 'PATCH', '/api/student/goals/goal-1'), true);
  assert.equal(canAccess(user, 'DELETE', '/api/student/goals/goal-1'), true);
  assert.equal(canAccess(user, 'PATCH', '/api/goals/goal-1'), false);
});
