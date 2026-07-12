const test = require('node:test');
const assert = require('node:assert/strict');

const { createPixPayment, createPaypalOrder } = require('../lib/paymentProviders');

test('Pix exige credencial do Mercado Pago', async () => {
  const previous = process.env.MERCADOPAGO_ACCESS_TOKEN;
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  delete process.env.MP_ACCESS_TOKEN;
  await assert.rejects(
    createPixPayment({ enrollmentId: 'test', email: 'aluno@example.com', planName: 'Essencial', amountCents: 8990 }),
    (error) => error.code === 'pagamento_nao_configurado' && error.provider === 'mercadopago'
  );
  if (previous) process.env.MERCADOPAGO_ACCESS_TOKEN = previous;
});

test('PayPal exige client id e segredo', async () => {
  const previousId = process.env.PAYPAL_CLIENT_ID;
  const previousSecret = process.env.PAYPAL_CLIENT_SECRET;
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  await assert.rejects(
    createPaypalOrder({ enrollmentId: 'test', planName: 'Essencial', amountCents: 8990 }),
    (error) => error.code === 'pagamento_nao_configurado' && error.provider === 'paypal'
  );
  if (previousId) process.env.PAYPAL_CLIENT_ID = previousId;
  if (previousSecret) process.env.PAYPAL_CLIENT_SECRET = previousSecret;
});
