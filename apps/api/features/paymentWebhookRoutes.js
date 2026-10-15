const { getMercadoPagoPayment } = require('../lib/paymentProviders');
const { confirmEnrollmentPayment } = require('../lib/enrollmentPayment');
const { settleInvoicePayment } = require('../lib/invoicePayment');
const { pool, query } = require('../lib/db');

async function handlePaymentWebhookRoutes(req, res, url, helpers) {
  const { send, body } = helpers;

  // Webhook Pix genérico / automático (para confirmação instantânea de gateways bancários ou simulador)
  if (['GET', 'POST'].includes(req.method) && url.pathname === '/api/webhooks/pix') {
    let input = {};
    if (req.method === 'POST') input = await body(req);
    const paymentId = url.searchParams.get('payment_id') || input.payment_id || input.id;
    const txid = url.searchParams.get('txid') || input.txid;

    let targetPaymentId = paymentId;
    if (!targetPaymentId && txid) {
      // Tenta achar pagamento por txid ou formato FAT<id_sem_tracos>
      const rawHex = String(txid).replace(/^FAT/i, '');
      const match = await query(
        "SELECT id FROM payments WHERE replace(id::text, '-', '') ILIKE $1 LIMIT 1",
        [`${rawHex}%`]
      );
      if (match.rowCount) targetPaymentId = match.rows[0].id;
    }

    if (!targetPaymentId) return send(res, 202, { received: true, message: 'payment_id_nao_encontrado' });

    try {
      const settled = await settleInvoicePayment({
        pool,
        paymentId: targetPaymentId,
        method: 'pix',
        notes: `Pix confirmado via webhook (${input.provider || 'banco'})`
      });
      return send(res, 200, { received: true, status: 'paid', payment_id: targetPaymentId, receipt: settled.receipt });
    } catch (err) {
      return send(res, err.statusCode || 500, { error: err.message });
    }
  }

  // Webhook Mercado Pago
  if (!['GET', 'POST'].includes(req.method) || url.pathname !== '/api/webhooks/mercadopago') return false;
  let input = {};
  if (req.method === 'POST') input = await body(req);
  const paymentId = url.searchParams.get('data.id') || url.searchParams.get('id') || input.data?.id || input.id;
  if (!paymentId) return send(res, 202, { received: true });

  const payment = await getMercadoPagoPayment(paymentId);
  if (payment.status !== 'approved') return send(res, 200, { received: true, status: payment.status || 'pending' });
  const reference = payment.external_reference;
  if (!reference) return send(res, 202, { received: true });

  // 1. Tenta como matrícula pública
  try {
    const confirmation = await confirmEnrollmentPayment({
      enrollmentId: reference,
      provider: 'mercadopago',
      providerPaymentId: payment.id,
      providerStatus: payment.status
    });
    return send(res, 200, { received: true, status: 'paid', type: 'enrollment', email_delivery: confirmation.emailDelivery });
  } catch (enrollmentErr) {
    if (enrollmentErr.statusCode !== 404 && enrollmentErr.message !== 'matricula_nao_encontrada') {
      // Pode ser fatura de aluno
    }
  }

  // 2. Tenta como pagamento/fatura de aluno
  try {
    const settled = await settleInvoicePayment({
      pool,
      paymentId: reference,
      method: 'pix',
      notes: `Confirmado via Mercado Pago (${payment.id})`
    });
    return send(res, 200, { received: true, status: 'paid', type: 'student_invoice', receipt: settled.receipt });
  } catch (invoiceErr) {
    return send(res, 202, { received: true, status: 'reference_not_processed' });
  }
}

module.exports = { handlePaymentWebhookRoutes };
