const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5432/test';
process.env.AUTH_SECRET ||= 'test-secret-with-more-than-thirty-two-characters';

const {
  deriveOfflinePin,
  normalizeOfflinePin,
  normalizeRegistrationNumber
} = require('../features/accessRoutes');

test('normaliza matricula de seis digitos', () => {
  assert.equal(normalizeRegistrationNumber('123-456'), '123456');
  assert.equal(normalizeRegistrationNumber('12345'), '');
});

test('normaliza PIN offline de quatro digitos', () => {
  assert.equal(normalizeOfflinePin('12 34'), '1234');
  assert.equal(normalizeOfflinePin('123'), '');
  assert.equal(normalizeOfflinePin('12345'), '');
});

test('gera PIN deterministico de quatro digitos', () => {
  const first = deriveOfflinePin('seed-fixo', 'gym-1', 'member-1');
  const second = deriveOfflinePin('seed-fixo', 'gym-1', 'member-1');
  assert.match(first, /^\d{4}$/);
  assert.equal(first, second);
  assert.notEqual(first, deriveOfflinePin('seed-diferente', 'gym-1', 'member-1'));
});
