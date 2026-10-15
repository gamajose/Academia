const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test';

const { generatePixPayload, crc16, cleanString } = require('../lib/pixUtils');
const { receiptNumber } = require('../lib/invoicePayment');
const { handleStudentInvoiceRoutes } = require('../features/studentInvoiceRoutes');

test('cleanString normalizes diacritics and removes special characters', () => {
  assert.equal(cleanString('Academia LOBO - São Paulo!'), 'Academia LOBO  Sao Paulo');
  assert.equal(cleanString('São Paulo', 15), 'Sao Paulo');
});

test('crc16 generates 4-character uppercase hexadecimal checksum', () => {
  const code = crc16('00020126360014br.gov.bcb.pix0114financeiro@lobo5204000053039865406119.905802BR5913ACADEMIA LOBO6009SAO PAULO62110507FAT12346304');
  assert.equal(code.length, 4);
  assert.match(code, /^[0-9A-F]{4}$/);
});

test('generatePixPayload creates EMVCo standard BACEN Pix code', () => {
  const payload = generatePixPayload({
    pixKey: '12345678000199',
    merchantName: 'Academia LOBO',
    merchantCity: 'SAO PAULO',
    amount: 119.90,
    txid: 'FAT123456789'
  });

  assert.ok(payload.startsWith('000201'));
  assert.ok(payload.includes('br.gov.bcb.pix'));
  assert.ok(payload.includes('12345678000199'));
  assert.ok(payload.includes('5303986')); // Currency 986 (BRL)
  assert.ok(payload.includes('5406119.90')); // Amount 119.90
  assert.ok(payload.includes('5802BR')); // Country BR
  assert.ok(payload.includes('FAT123456789')); // TXID
  assert.ok(payload.includes('6304')); // CRC tag
  assert.equal(payload.length > 50, true);
});

test('receiptNumber creates formatted receipt identifier', () => {
  const number = receiptNumber();
  assert.match(number, /^REC-\d{8}-\d{4}$/);
});

test('handleStudentInvoiceRoutes rejects unauthenticated student', async () => {
  let sentStatus = 0;
  let sentData = null;
  const helpers = {
    send: (res, status, data) => {
      sentStatus = status;
      sentData = data;
    }
  };

  const handled = await handleStudentInvoiceRoutes(
    { method: 'GET' },
    {},
    null,
    new URL('http://localhost/api/student/invoices'),
    helpers
  );

  assert.equal(sentStatus, 401);
  assert.equal(sentData.error, 'nao_autorizado');
});

test('handleStudentInvoiceRoutes rejects non-student role', async () => {
  let sentStatus = 0;
  let sentData = null;
  const helpers = {
    send: (res, status, data) => {
      sentStatus = status;
      sentData = data;
    }
  };

  const handled = await handleStudentInvoiceRoutes(
    { method: 'GET' },
    {},
    { role: 'staff', sub: 'user-1' },
    new URL('http://localhost/api/student/invoices'),
    helpers
  );

  assert.equal(sentStatus, 401);
  assert.equal(sentData.error, 'nao_autorizado');
});

test('perfil do aluno não contém botão de tema redundante na interface', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const profileHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'student-profile.html'), 'utf8');
  const profileJs = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'student-profile.js'), 'utf8');

  assert.doesNotMatch(profileHtml, /student-quick-theme-btn/);
  assert.doesNotMatch(profileHtml, /profile-tab-btn-theme/);
  assert.doesNotMatch(profileHtml, /profile-panel-theme/);
  assert.doesNotMatch(profileJs, /student-quick-theme-btn/);
  assert.doesNotMatch(profileJs, /'theme'/);
});

test('barra de navegação móvel e desktop inclui opção de Faturas', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const shellJs = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'student-shell.js'), 'utf8');
  const shellCss = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'student-shell.css'), 'utf8');

  assert.match(shellJs, /\['invoices',\s*'\.\/student-invoices\.html',\s*'invoice',\s*'Faturas'\]/);
  assert.match(shellCss, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
});

test('página de faturas do aluno implementa resumo, lista e modal Pix com validação automática', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const invoicesHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'student-invoices.html'), 'utf8');
  const invoicesJs = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'student-invoices.js'), 'utf8');

  assert.match(invoicesHtml, /id="invoices-summary-grid"/);
  assert.match(invoicesHtml, /id="pix-payment-modal"/);
  assert.match(invoicesHtml, /id="pix-modal-qr-canvas"/);
  assert.match(invoicesHtml, /id="pix-copy-code"/);
  assert.match(invoicesHtml, /id="pix-check-now-btn"/);
  assert.match(invoicesJs, /\/api\/student\/invoices/);
  assert.match(invoicesJs, /\/api\/student\/invoices\/.*\/pix/);
  assert.match(invoicesJs, /\/api\/student\/invoices\/.*\/confirm-pix/);
  assert.match(invoicesJs, /\/api\/student\/invoices\/.*\/status/);
});

