const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';

const { integer, extractChallenge } = require('../features/engagementRoutes');

test('integer limita campos numericos', () => {
  assert.equal(integer('20', 10, 1, 100), 20);
  assert.equal(integer('0', 10, 1, 100), 10);
  assert.equal(integer('200', 10, 1, 100), 10);
  assert.equal(integer('texto', 10, 1, 100), 10);
});

test('extractChallenge aceita token simples', () => {
  assert.equal(extractChallenge('abc123'), 'abc123');
});

test('extractChallenge extrai token de QR da academia', () => {
  assert.equal(
    extractChallenge('academia://access/challenge?token=seguro-123'),
    'seguro-123'
  );
});

test('extractChallenge rejeita URL invalida', () => {
  assert.equal(extractChallenge('academia://%'), '');
});
