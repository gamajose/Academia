function configError(provider) {
  const error = new Error('pagamento_nao_configurado');
  error.code = 'pagamento_nao_configurado';
  error.provider = provider;
  return error;
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.name || `payment_provider_${response.status}`);
    error.statusCode = 502;
    error.providerResponse = data;
    throw error;
  }
  return data;
}

function publicUrl(path) {
  const base = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_WEB_URL || 'http://192.168.3.200:8084').replace(/\/$/, '');
  return base ? `${base}${path}` : '';
}

function mercadoPagoConfig() {
  const token = String(process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '').trim();
  if (!token) throw configError('mercadopago');
  return {
    token,
    baseUrl: String(process.env.MERCADOPAGO_API_URL || 'https://api.mercadopago.com').replace(/\/$/, '')
  };
}

async function createPixPayment({ enrollmentId, email, planName, amountCents }) {
  const config = mercadoPagoConfig();
  const response = await fetch(`${config.baseUrl}/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': String(enrollmentId)
    },
    body: JSON.stringify({
      transaction_amount: Number(amountCents) / 100,
      description: `Academia Lobo - ${planName}`,
      payment_method_id: 'pix',
      payer: { email },
      external_reference: String(enrollmentId),
      notification_url: publicUrl('/api/webhooks/mercadopago') || undefined
    })
  });
  const payment = await readJson(response);
  const transaction = payment.point_of_interaction?.transaction_data || {};
  return {
    provider: 'mercadopago',
    providerPaymentId: String(payment.id),
    status: payment.status || 'pending',
    qrCode: transaction.qr_code || null,
    qrCodeBase64: transaction.qr_code_base64 || null,
    checkoutUrl: payment.transaction_details?.external_resource_url || null,
    expiresAt: payment.date_of_expiration || null
  };
}

async function getMercadoPagoPayment(paymentId) {
  const config = mercadoPagoConfig();
  const response = await fetch(`${config.baseUrl}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${config.token}` }
  });
  return readJson(response);
}

function paypalConfig() {
  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) throw configError('paypal');
  const environment = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  const defaultBase = environment === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  return { clientId, clientSecret, baseUrl: String(process.env.PAYPAL_API_URL || defaultBase).replace(/\/$/, '') };
}

async function paypalAccessToken(config) {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await readJson(response);
  return data.access_token;
}

async function createPaypalOrder({ enrollmentId, planName, amountCents }) {
  const config = paypalConfig();
  const token = await paypalAccessToken(config);
  const response = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': String(enrollmentId)
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: String(enrollmentId),
        custom_id: String(enrollmentId),
        description: `Academia Lobo - ${planName}`,
        amount: { currency_code: 'BRL', value: (Number(amountCents) / 100).toFixed(2) }
      }],
      application_context: {
        brand_name: 'Academia Lobo',
        user_action: 'PAY_NOW',
        return_url: publicUrl(`/payment-return.html?enrollment_id=${encodeURIComponent(enrollmentId)}`),
        cancel_url: publicUrl(`/matricula-publica.html?payment=cancelled&enrollment_id=${encodeURIComponent(enrollmentId)}`)
      }
    })
  });
  const order = await readJson(response);
  const approval = (order.links || []).find((link) => link.rel === 'approve');
  return {
    provider: 'paypal',
    providerPaymentId: order.id,
    status: order.status || 'CREATED',
    checkoutUrl: approval?.href || null
  };
}

async function capturePaypalOrder(orderId) {
  const config = paypalConfig();
  const token = await paypalAccessToken(config);
  const response = await fetch(`${config.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  return readJson(response);
}

module.exports = { createPixPayment, getMercadoPagoPayment, createPaypalOrder, capturePaypalOrder };
