const { getMercadoPagoPayment } = require('../lib/paymentProviders');
const { confirmEnrollmentPayment } = require('../lib/enrollmentPayment');

async function handlePaymentWebhookRoutes(req, res, url, helpers) {
  const { send, body } = helpers;

  if (!['GET', 'POST'].includes(req.method) || url.pathname !== '/api/webhooks/mercadopago') return false;
  let input = {};
  if (req.method === 'POST') input = await body(req);
  const paymentId = url.searchParams.get('data.id') || url.searchParams.get('id') || input.data?.id || input.id;
  if (!paymentId) return send(res, 202, { received: true });

  const payment = await getMercadoPagoPayment(paymentId);
  if (payment.status !== 'approved') return send(res, 200, { received: true, status: payment.status || 'pending' });
  const enrollmentId = payment.external_reference;
  if (!enrollmentId) return send(res, 202, { received: true });
  const confirmation = await confirmEnrollmentPayment({
    enrollmentId,
    provider: 'mercadopago',
    providerPaymentId: payment.id,
    providerStatus: payment.status
  });
  return send(res, 200, { received: true, status: 'paid', email_delivery: confirmation.emailDelivery });
}

module.exports = { handlePaymentWebhookRoutes };
