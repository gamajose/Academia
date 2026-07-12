const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';

const { integerInRange } = require('../features/memberWorkspaceRoutes');

test('integerInRange aceita valores dentro do intervalo', () => {
  assert.equal(integerInRange('3', 1, 7, null), 3);
  assert.equal(integerInRange(10, 0, 10, null), 10);
});

test('integerInRange rejeita valores fora do intervalo', () => {
  assert.equal(integerInRange('0', 1, 7, 3), 3);
  assert.equal(integerInRange('11', 1, 10, null), null);
  assert.equal(integerInRange('texto', 1, 10, 5), 5);
});

test('integerInRange preserva campos opcionais vazios', () => {
  assert.equal(integerInRange('', 1, 10, null), null);
  assert.equal(integerInRange(undefined, 1, 10, 4), 4);
});
