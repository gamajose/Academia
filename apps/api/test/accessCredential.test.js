const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5432/test';
const { normalizeAccessCode } = require('../features/accessRoutes');

test('normaliza codigo dinamico com espaco ou hifen', () => {
  assert.equal(normalizeAccessCode('483 921'), '483921');
  assert.equal(normalizeAccessCode('483-921'), '483921');
});

test('rejeita codigo com quantidade incorreta de digitos', () => {
  assert.equal(normalizeAccessCode('12345'), '');
  assert.equal(normalizeAccessCode('1234567'), '');
  assert.equal(normalizeAccessCode(''), '');
});
