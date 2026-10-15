process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { handlePublicInvoiceRoutes, getPublicAppUrl } = require('../features/publicInvoiceRoutes');
const { sendWhatsAppMessage } = require('../lib/whatsappGateway');

test('getPublicAppUrl returns external IP 45.162.245.7:8084 and ignores internal 192.168.3.200', () => {
  const oldEnv = process.env.APP_PUBLIC_URL;
  try {
    delete process.env.APP_PUBLIC_URL;
    assert.equal(getPublicAppUrl(), 'http://45.162.245.7:8084');

    process.env.APP_PUBLIC_URL = 'http://192.168.3.200:8084';
    assert.equal(getPublicAppUrl(), 'http://45.162.245.7:8084');

    process.env.APP_PUBLIC_URL = 'http://45.162.245.7:8084';
    assert.equal(getPublicAppUrl(), 'http://45.162.245.7:8084');

    process.env.APP_PUBLIC_URL = 'https://academialobo.com.br';
    assert.equal(getPublicAppUrl(), 'https://academialobo.com.br');
  } finally {
    if (oldEnv !== undefined) process.env.APP_PUBLIC_URL = oldEnv;
    else delete process.env.APP_PUBLIC_URL;
  }
});

test('sendWhatsAppMessage handles missing phone and unconfigured gateway gracefully', async () => {
  const noPhone = await sendWhatsAppMessage({ phone: '', message: 'Teste' });
  assert.equal(noPhone.success, false);
  assert.equal(noPhone.error, 'telefone_invalido');

  const oldUrl = process.env.WHATSAPP_API_URL;
  delete process.env.WHATSAPP_API_URL;
  try {
    const res = await sendWhatsAppMessage({ phone: '(32) 99919-2233', message: 'Fatura LOBO' });
    assert.equal(res.success, true);
    assert.equal(res.delivered, false);
    assert.equal(res.gateway_configured, false);
    assert.equal(res.phone, '5532999192233');
  } finally {
    if (oldUrl !== undefined) process.env.WHATSAPP_API_URL = oldUrl;
  }
});

test('sendWhatsAppMessage sends HTTP request when WHATSAPP_API_URL is configured', async () => {
  const originalFetch = global.fetch;
  let calledUrl = null;
  let calledOptions = null;

  global.fetch = async (url, options) => {
    calledUrl = url;
    calledOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => ({ messageId: 'msg-123', status: 'sent' }),
      text: async () => '{"messageId":"msg-123"}'
    };
  };

  const oldUrl = process.env.WHATSAPP_API_URL;
  const oldKey = process.env.WHATSAPP_API_KEY;
  process.env.WHATSAPP_API_URL = 'http://localhost:8080/message/sendText';
  process.env.WHATSAPP_API_KEY = 'secret-api-key';

  try {
    const res = await sendWhatsAppMessage({ phone: '32999192233', message: 'Sua fatura' });
    assert.equal(res.success, true);
    assert.equal(res.delivered, true);
    assert.equal(res.gateway_configured, true);
    assert.ok(calledUrl.includes('/message/sendText'));
    assert.equal(calledOptions.headers.apikey, 'secret-api-key');
    const parsedBody = JSON.parse(calledOptions.body);
    assert.equal(parsedBody.number, '5532999192233');
    assert.equal(parsedBody.text, 'Sua fatura');
  } finally {
    global.fetch = originalFetch;
    if (oldUrl !== undefined) process.env.WHATSAPP_API_URL = oldUrl;
    else delete process.env.WHATSAPP_API_URL;
    if (oldKey !== undefined) process.env.WHATSAPP_API_KEY = oldKey;
    else delete process.env.WHATSAPP_API_KEY;
  }
});

test('handlePublicInvoiceRoutes GET /api/public/invoices/:id returns public invoice without login', async () => {
  let capturedStatus = null;
  let capturedData = null;

  const fakeSend = (res, status, data) => {
    capturedStatus = status;
    capturedData = data;
    return data;
  };

  const fakePayment = {
    id: 'pay-001',
    gym_id: 'gym-1',
    member_id: 'mem-1',
    amount_cents: 11990,
    due_date: '2026-11-13',
    status: 'pending',
    paid_at: null,
    member_name: 'Carlos Oliveira',
    member_phone: '3299192233',
    plan_name: 'Plano Black',
    gym_name: 'Academia LOBO',
    gym_phone: '3232110000',
    pix_key: 'lobo@pix.com.br',
    payment_settings: { pix: { key: 'lobo@pix.com.br', receiver_name: 'Academia LOBO' } }
  };

  const mockQuery = async (sql) => {
    if (sql.includes('FROM payments')) {
      return { rowCount: 1, rows: [fakePayment] };
    }
    return { rowCount: 0, rows: [] };
  };

  const req = { method: 'GET', headers: {} };
  const res = {};
  const url = new URL('http://45.162.245.7:8084/api/public/invoices/pay-001');

  await handlePublicInvoiceRoutes(req, res, null, url, { send: fakeSend, query: mockQuery });

  assert.equal(capturedStatus, 200);
  assert.equal(capturedData.id, 'pay-001');
  assert.equal(capturedData.member_name, 'Carlos Oliveira');
  assert.equal(capturedData.plan_name, 'Plano Black');
  assert.equal(capturedData.amount_cents, 11990);
  assert.equal(capturedData.amount_formatted, 'R$\u00a0119,90');
  assert.equal(capturedData.due_date, '2026-11-13');
  assert.equal(capturedData.due_date_formatted, '13/11/2026');
  assert.ok(capturedData.public_url.includes('/fatura.html?id=pay-001'));
  assert.ok(capturedData.pix_payload.startsWith('00020126'));
  assert.ok(capturedData.qr_data_url.startsWith('data:image/png;base64,'));
});

test('handlePublicInvoiceRoutes returns 404 when invoice does not exist', async () => {
  let capturedStatus = null;
  const fakeSend = (res, status, data) => {
    capturedStatus = status;
    return data;
  };

  const emptyQuery = async () => ({ rowCount: 0, rows: [] });

  const req = { method: 'GET', headers: {} };
  const res = {};
  const url = new URL('http://45.162.245.7:8084/api/public/invoices/pay-nonexistent');

  await handlePublicInvoiceRoutes(req, res, null, url, { send: fakeSend, query: emptyQuery });
  assert.equal(capturedStatus, 404);
});

test('POST /api/finance/invoices/:id/send-whatsapp returns false when unauthenticated to allow auth()', async () => {
  const req = { method: 'POST', headers: {} };
  const res = {};
  const url = new URL('http://45.162.245.7:8084/api/finance/invoices/pay-001/send-whatsapp');

  const result = await handlePublicInvoiceRoutes(req, res, null, url, { send: () => {} });
  assert.equal(result, false);
});

test('site_server.py includes fatura.html in PUBLIC_HTML', () => {
  const serverPy = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'site_server.py'), 'utf8');
  assert.ok(serverPy.includes("'fatura.html'"));
});

test('fatura.html and fatura.js files exist and have correct elements', () => {
  const htmlPath = path.join(__dirname, '..', '..', 'web', 'fatura.html');
  const jsPath = path.join(__dirname, '..', '..', 'web', 'fatura.js');

  assert.ok(fs.existsSync(htmlPath));
  assert.ok(fs.existsSync(jsPath));

  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes('id="fatura-amount"'));
  assert.ok(html.includes('id="fatura-due-date"'));
  assert.ok(html.includes('id="pix-copia-cola"'));
  assert.ok(html.includes('id="btn-confirm-pix"'));
  assert.ok(html.includes('id="paid-section"'));
  assert.ok(html.includes('src="./fatura.js'));
});
