const test = require('node:test');
const assert = require('node:assert/strict');

const { digits, validEmail } = require('../features/memberDetailRoutes');

test('digits mantém somente números e respeita o limite', () => {
  assert.equal(digits('166.233.555-55', 11), '16623355555');
  assert.equal(digits('(32) 9 9919-2233', 11), '32999192233');
});

test('validEmail aceita vazio e valida formato básico', () => {
  assert.equal(validEmail(''), true);
  assert.equal(validEmail('nome@email.com'), true);
  assert.equal(validEmail('nome-sem-arroba'), false);
});
