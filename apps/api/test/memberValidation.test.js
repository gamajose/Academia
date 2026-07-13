const test = require('node:test');
const assert = require('node:assert/strict');
const { digits, validEmail, validPhone } = require('../lib/memberValidation');

test('digits mantém somente números e respeita o limite', () => {
  assert.equal(digits('(32) 9 9919-2233', 11), '32999192233');
});
test('validEmail valida formato básico', () => {
  assert.equal(validEmail('nome@email.com'), true);
  assert.equal(validEmail('nome-sem-arroba'), false);
});
test('validPhone exige onze dígitos no Brasil', () => {
  assert.equal(validPhone('(32) 9 9919-2233', '+55'), true);
  assert.equal(validPhone('(32) 9991-9223', '+55'), false);
  assert.equal(validPhone('(32) 9 9919-22334', '+55'), false);
});
