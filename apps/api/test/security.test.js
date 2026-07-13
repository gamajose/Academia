const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET = 'test-secret-with-more-than-thirty-two-characters';

const {
  hashPassword,
  verifyPassword,
  validatePassword,
  signToken,
  verifyToken
} = require('../lib/security');

test('hash de senha valida somente a senha correta', () => {
  const stored = hashPassword('SenhaForte123');
  assert.equal(verifyPassword('SenhaForte123', stored), true);
  assert.equal(verifyPassword('SenhaErrada123', stored), false);
});

test('politica de senha exige oito caracteres, maiuscula e numero', () => {
  assert.equal(validatePassword('curta').valid, false);
  assert.equal(validatePassword('senhasemnumero').valid, false);
  assert.equal(validatePassword('ABCDEFG1').valid, true);
  assert.equal(validatePassword('Senha123').valid, true);
});

test('token assinado pode ser verificado e adulteracao e rejeitada', () => {
  const token = signToken({ sub: 'usuario-1', role: 'admin' });
  const payload = verifyToken(token);
  assert.equal(payload.sub, 'usuario-1');
  assert.equal(payload.role, 'admin');

  const adulterado = `${token.slice(0, -1)}x`;
  assert.equal(verifyToken(adulterado), null);
});
