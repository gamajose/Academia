const test = require('node:test');
const assert = require('node:assert/strict');

const { smtpConfigured } = require('../lib/mailer');

test('SMTP exige host, usuario e senha', () => {
  assert.equal(smtpConfigured({ host: '', port: 465, user: 'user@example.com', pass: 'app-password' }), false);
  assert.equal(smtpConfigured({ host: 'smtp.gmail.com', port: 465, user: '', pass: 'app-password' }), false);
  assert.equal(smtpConfigured({ host: 'smtp.gmail.com', port: 465, user: 'user@example.com', pass: '' }), false);
  assert.equal(smtpConfigured({ host: 'smtp.gmail.com', port: 465, user: 'user@example.com', pass: 'app-password' }), true);
});
