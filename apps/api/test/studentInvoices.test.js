const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test';

const { generatePixPayload, crc16, cleanString } = require('../lib/pixUtils');
const { receiptNumber } = require('../lib/invoicePayment');
const {
  handleStudentInvoiceRoutes,
  extractDueDay,
  calculateCycleDueDate,
  buildWhatsAppInvoiceUrl,
  syncMembershipInvoices
} = require('../features/studentInvoiceRoutes');

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

test('extrai o dia da matrícula para fixar o vencimento mensal (ex: dia 10)', () => {
  assert.equal(extractDueDay('2026-08-10'), 10);
  assert.equal(extractDueDay('2026-10-10'), 10);
  assert.equal(extractDueDay('2026-12-25'), 25);
  assert.equal(extractDueDay('2026-01-31'), 31);
  assert.equal(extractDueDay(null), 10);
});

test('calcula a data de vencimento recorrente mantendo o dia X com ajuste para meses curtos', () => {
  // Matrícula dia 10: todo dia 10 em qualquer mês
  assert.equal(calculateCycleDueDate(10, 2026, 9), '2026-10-10'); // Outubro
  assert.equal(calculateCycleDueDate(10, 2026, 1), '2026-02-10'); // Fevereiro
  assert.equal(calculateCycleDueDate(10, 2026, 3), '2026-04-10'); // Abril

  // Matrícula dia 31: ajusta para o último dia em meses com menos de 31 dias
  assert.equal(calculateCycleDueDate(31, 2026, 9), '2026-10-31'); // Outubro (31)
  assert.equal(calculateCycleDueDate(31, 2027, 1), '2027-02-28'); // Fevereiro não-bissexto (28)
  assert.equal(calculateCycleDueDate(31, 2028, 1), '2028-02-29'); // Fevereiro bissexto (29)
  assert.equal(calculateCycleDueDate(31, 2026, 3), '2026-04-30'); // Abril (30)
});

test('buildWhatsAppInvoiceUrl formata mensagem completa com opções de pagamento online e local', () => {
  const url = buildWhatsAppInvoiceUrl({
    phone: '11999998888',
    memberName: 'João Silva',
    planName: 'Plano Black',
    amountFormatted: 'R$ 119,90',
    dueDateFormatted: '10/10/2026',
    dueDay: 10,
    isOverdue: false,
    daysOverdue: 0,
    pixKey: '12345678000199',
    receiverName: 'Academia LOBO',
    pixPayload: '00020126...6304ABCD',
    publicAppUrl: 'http://192.168.3.200:8084'
  });

  assert.ok(url.startsWith('https://wa.me/5511999998888?text='));
  const decoded = decodeURIComponent(url);
  assert.ok(decoded.includes('João Silva'));
  assert.ok(decoded.includes('Plano Black'));
  assert.ok(decoded.includes('R$ 119,90'));
  assert.ok(decoded.includes('Vencimento todo dia 10'));
  assert.ok(decoded.includes('PAGAMENTO VIA PIX'));
  assert.ok(decoded.includes('PAGAMENTO EM DINHEIRO'));
  assert.ok(decoded.includes('12345678000199'));
  assert.ok(decoded.includes('00020126...6304ABCD'));
  assert.ok(decoded.includes('student-invoices.html'));
});

test('interface de faturas remove textos antigos, exibe apenas dois cards lado a lado sem seção de método', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const invoicesHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'student-invoices.html'), 'utf8');
  const invoicesCss = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'student-invoices.css'), 'utf8');

  // Textos removidos conforme solicitado pelo usuário
  assert.doesNotMatch(invoicesHtml, /Financeiro & Mensalidades/);
  assert.doesNotMatch(invoicesHtml, /Acompanhe suas mensalidades/);
  assert.doesNotMatch(invoicesHtml, /Histórico de Pagamentos/);
  assert.doesNotMatch(invoicesHtml, /invoices-payment-info-box/);
  assert.doesNotMatch(invoicesHtml, /Escolha como deseja pagar sua fatura/);

  // Cards mantidos lado a lado
  assert.match(invoicesHtml, /Situação Geral/);
  assert.match(invoicesHtml, /Próximo Vencimento/);

  // Botão de envio no WhatsApp no modal
  assert.match(invoicesHtml, /pix-modal-wa-btn/);

  // CSS: 2 colunas lado a lado no desktop e no mobile
  assert.match(invoicesCss, /\.invoices-summary-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(invoicesCss, /@media\s*\(max-width:\s*600px\)[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
});

test('syncMembershipInvoices gera todas as mensalidades intermediarias em atraso e a proxima fatura futura', async () => {
  const inserted = [];
  const fakeDb = [
    {
      id: 'p-1',
      due_date: '2026-07-13',
      status: 'paid',
      amount_cents: 11990,
      paid_at: '2026-07-13T10:00:00Z',
      notes: 'Matricula'
    }
  ];

  const fakeQuery = async (sql, params) => {
    if (sql.includes('SELECT id, amount_cents, status, due_date')) {
      return { rows: [...fakeDb, ...inserted] };
    }
    if (sql.includes('INSERT INTO payments')) {
      const row = {
        id: `p-${inserted.length + 2}`,
        amount_cents: params[3],
        status: 'pending',
        due_date: params[4],
        notes: params[5]
      };
      inserted.push(row);
      return { rowCount: 1, rows: [row] };
    }
    return { rowCount: 0, rows: [] };
  };

  const activeMem = {
    id: 'mem-1',
    starts_at: '2026-07-13',
    plan_name: 'Plano Black',
    price_cents: 11990
  };

  // Hoje sendo 15/10/2026
  const simulatedToday = new Date('2026-10-15T12:00:00Z');
  await syncMembershipInvoices({
    query: fakeQuery,
    gymId: 'gym-1',
    memberId: 'mem-1',
    activeMem,
    dueDay: 13,
    today: simulatedToday
  });

  // Deve gerar:
  // 1. 2026-08-13 (em atraso)
  // 2. 2026-09-13 (em atraso)
  // 3. 2026-10-13 (em atraso)
  // 4. 2026-11-13 (próximo mês / a vencer)
  assert.equal(inserted.length, 4);
  assert.equal(inserted[0].due_date, '2026-08-13');
  assert.equal(inserted[1].due_date, '2026-09-13');
  assert.equal(inserted[2].due_date, '2026-10-13');
  assert.equal(inserted[3].due_date, '2026-11-13');
  assert.ok(inserted[0].notes.includes('Vencimento todo dia 13'));
});



