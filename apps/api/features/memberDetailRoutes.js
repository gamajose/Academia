const { recordAudit } = require('../lib/audit');
const { digits, nullable, validEmail } = require('../lib/memberValidation');
const { hashPassword, validatePassword } = require('../lib/security');
const { createPixPayment, getMercadoPagoPayment, createPaypalOrder, capturePaypalOrder } = require('../lib/paymentProviders');
const { confirmEnrollmentPayment, confirmEnrollmentEmail } = require('../lib/enrollmentPayment');

function code() {
  return `ACAD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function handleMemberDetailRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/members/detail') {
    const result = await query(
      `SELECT m.id, m.name, m.email, m.phone, m.phone_country_code, m.status, m.birth_date,
        m.document, m.cpf, m.rg, m.address, m.postal_code, m.street, m.address_number,
        m.address_complement, m.neighborhood, m.city, m.state, m.country,
        m.emergency_contact, m.emergency_contact_name, m.emergency_contact_phone,
        m.allergies, m.medical_notes, m.nutrition_notes, m.objective, m.notes,
        ms.id AS membership_id, ms.status AS membership_status, p.name AS plan_name,
        COALESCE(SUM(pay.amount_cents) FILTER (WHERE pay.status = 'pending'), 0) AS pending_amount_cents
       FROM members m
       LEFT JOIN memberships ms ON ms.member_id = m.id AND ms.gym_id = m.gym_id AND ms.status = 'active'
       LEFT JOIN plans p ON p.id = ms.plan_id
       LEFT JOIN payments pay ON pay.member_id = m.id AND pay.gym_id = m.gym_id
       WHERE m.gym_id = $1
       GROUP BY m.id, ms.id, p.name
       ORDER BY m.created_at DESC`,
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/members/detail/save') {
    const input = await body(req);
    if (!input.name) return send(res, 400, { error: 'nome_obrigatorio' });
    if (!validEmail(input.email)) return send(res, 400, { error: 'email_invalido' });

    const cpf = digits(input.cpf, 11) || null;
    if (input.cpf && (!cpf || cpf.length !== 11)) return send(res, 400, { error: 'cpf_invalido' });

    if (cpf) {
      const duplicate = await query(
        'SELECT id FROM members WHERE gym_id = $1 AND cpf = $2 AND ($3::uuid IS NULL OR id <> $3::uuid) LIMIT 1',
        [user.gym_id, cpf, input.member_id || null]
      );
      if (duplicate.rowCount) return send(res, 409, { error: 'cpf_ja_cadastrado' });
    }

    const values = {
      name: String(input.name).trim(),
      email: nullable(input.email)?.toLowerCase() || null,
      phone: digits(input.phone, 24) || null,
      phone_country_code: nullable(input.phone_country_code) || '+55',
      birth_date: input.birth_date || null,
      document: nullable(input.document),
      cpf,
      rg: nullable(input.rg),
      address: nullable(input.address),
      postal_code: digits(input.postal_code, 8) || null,
      street: nullable(input.street),
      address_number: nullable(input.address_number),
      address_complement: nullable(input.address_complement),
      neighborhood: nullable(input.neighborhood),
      city: nullable(input.city),
      state: nullable(input.state),
      country: nullable(input.country) || 'Brasil',
      emergency_contact: nullable(input.emergency_contact),
      emergency_contact_name: nullable(input.emergency_contact_name),
      emergency_contact_phone: digits(input.emergency_contact_phone, 24) || null,
      allergies: nullable(input.allergies),
      medical_notes: nullable(input.medical_notes),
      nutrition_notes: nullable(input.nutrition_notes),
      objective: nullable(input.objective),
      notes: nullable(input.notes)
    };

    const params = [
      user.gym_id, values.name, values.email, values.phone, values.phone_country_code,
      values.birth_date, values.document, values.cpf, values.rg, values.address,
      values.postal_code, values.street, values.address_number, values.address_complement,
      values.neighborhood, values.city, values.state, values.country, values.emergency_contact,
      values.emergency_contact_name, values.emergency_contact_phone, values.allergies,
      values.medical_notes, values.nutrition_notes, values.objective, values.notes
    ];

    let result;
    if (input.member_id) {
      result = await query(
        `UPDATE members SET
          name=$3,email=$4,phone=$5,phone_country_code=$6,birth_date=$7,document=$8,cpf=$9,rg=$10,
          address=$11,postal_code=$12,street=$13,address_number=$14,address_complement=$15,
          neighborhood=$16,city=$17,state=$18,country=$19,emergency_contact=$20,
          emergency_contact_name=$21,emergency_contact_phone=$22,allergies=$23,medical_notes=$24,
          nutrition_notes=$25,objective=$26,notes=$27,updated_at=now()
         WHERE id=$1 AND gym_id=$2
         RETURNING id,name,email,phone,status,cpf,rg`,
        [input.member_id, ...params]
      );
    } else {
      result = await query(
        `INSERT INTO members (
          gym_id,name,email,phone,phone_country_code,birth_date,document,cpf,rg,address,
          postal_code,street,address_number,address_complement,neighborhood,city,state,country,
          emergency_contact,emergency_contact_name,emergency_contact_phone,allergies,medical_notes,
          nutrition_notes,objective,notes
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
        ) RETURNING id,name,email,phone,status,cpf,rg`,
        params
      );
    }

    if (!result.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    await recordAudit(user, input.member_id ? 'update' : 'create', 'member', result.rows[0].id, { name: result.rows[0].name });
    return send(res, input.member_id ? 200 : 201, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/public/plans') {
    const result = await query(
      `SELECT id,name,price_cents,duration_days,description,benefits,rules
       FROM plans WHERE is_active=true AND price_cents>0
       ORDER BY price_cents ASC LIMIT 20`
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/public/enrollments') {
    const input = await body(req);
    const email = String(input.email || '').trim().toLowerCase();
    const paymentMethod = String(input.payment_method || '').toLowerCase();
    if (!input.name || !input.plan_id || !email || !input.password) return send(res, 400, { error: 'dados_invalidos' });
    if (!validEmail(email)) return send(res, 400, { error: 'email_invalido' });
    if (!['pix', 'paypal'].includes(paymentMethod)) return send(res, 400, { error: 'metodo_pagamento_invalido' });
    const passwordCheck = validatePassword(input.password);
    if (!passwordCheck.valid) return send(res, 400, { error: passwordCheck.error });
    if (String(input.password) !== String(input.password_confirmation || '')) return send(res, 400, { error: 'senhas_nao_conferem' });
    const plan = await query('SELECT gym_id, name, price_cents, duration_days FROM plans WHERE id = $1 AND is_active = true AND price_cents > 0 LIMIT 1', [input.plan_id]);
    if (!plan.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });
    const existing = await query('SELECT id FROM member_accounts WHERE lower(email) = lower($1) LIMIT 1', [email]);
    if (existing.rowCount) return send(res, 409, { error: 'email_ja_cadastrado' });
    const pending = await query("SELECT id FROM public_enrollments WHERE lower(email) = lower($1) AND status IN ('pending_payment','pending') LIMIT 1", [email]);
    if (pending.rowCount) return send(res, 409, { error: 'matricula_em_andamento' });
    const enrollmentCode = code();
    const qrPayload = `ACADEMIA:${enrollmentCode}`;
    const result = await query(
      `INSERT INTO public_enrollments (
        gym_id, plan_id, name, email, phone, payment_method, enrollment_code, qr_payload,
        password_hash, status, payment_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_payment','pending')
      RETURNING id, status, payment_status, enrollment_code, qr_payload`,
      [plan.rows[0].gym_id, input.plan_id, String(input.name).trim(), email, input.phone || null,
        paymentMethod, enrollmentCode, qrPayload, hashPassword(input.password)]
    );
    let checkout;
    try {
      checkout = paymentMethod === 'pix'
        ? await createPixPayment({ enrollmentId: result.rows[0].id, email, planName: plan.rows[0].name, amountCents: plan.rows[0].price_cents })
        : await createPaypalOrder({ enrollmentId: result.rows[0].id, planName: plan.rows[0].name, amountCents: plan.rows[0].price_cents });
    } catch (error) {
      await query("UPDATE public_enrollments SET status = 'cancelled', payment_status = 'failed' WHERE id = $1", [result.rows[0].id]);
      return send(res, error.statusCode || 503, { error: error.code || error.message || 'falha_no_pagamento', provider: error.provider });
    }
    const updated = await query(
      `UPDATE public_enrollments SET payment_provider=$2, provider_payment_id=$3,
        payment_status=$4, payment_checkout_url=$5, payment_qr_code=$6,
        payment_qr_code_base64=$7, payment_expires_at=$8
       WHERE id=$1
       RETURNING id, status, payment_status, enrollment_code, qr_payload`,
      [result.rows[0].id, checkout.provider, checkout.providerPaymentId, checkout.status, checkout.checkoutUrl || null,
        checkout.qrCode || null, checkout.qrCodeBase64 || null, checkout.expiresAt || null]
    );
    return send(res, 201, {
      ...updated.rows[0],
      payment_method: paymentMethod,
      payment: {
        provider: checkout.provider,
        payment_id: checkout.providerPaymentId,
        status: checkout.status,
        approval_url: checkout.checkoutUrl || null,
        qr_code: checkout.qrCode || null,
        qr_code_base64: checkout.qrCodeBase64 || null,
        expires_at: checkout.expiresAt || null
      }
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/public/enrollments/status') {
    const enrollmentId = url.searchParams.get('enrollment_id') || '';
    if (!enrollmentId) return send(res, 400, { error: 'id_obrigatorio' });
    const result = await query(
      `SELECT id, status, payment_method, payment_status, payment_provider,
              payment_checkout_url, payment_qr_code, payment_qr_code_base64,
              payment_expires_at, payment_confirmed_at, email_confirmation_sent_at,
              email_confirmed_at, confirmed_at
       FROM public_enrollments WHERE id = $1 LIMIT 1`,
      [enrollmentId]
    );
    if (!result.rowCount) return send(res, 404, { error: 'matricula_nao_encontrada' });
    let item = result.rows[0];
    if (item.payment_method === 'pix' && item.payment_provider === 'mercadopago' && item.payment_status !== 'paid' && item.provider_payment_id) {
      try {
        const providerPayment = await getMercadoPagoPayment(item.provider_payment_id);
        if (providerPayment.status === 'approved') {
          const confirmation = await confirmEnrollmentPayment({ enrollmentId: item.id, provider: 'mercadopago', providerPaymentId: providerPayment.id, providerStatus: providerPayment.status });
          item = { ...item, payment_status: 'paid', email_confirmation_sent_at: confirmation.emailDelivery === 'sent' ? new Date().toISOString() : null, payment_confirmed_at: new Date().toISOString() };
        }
      } catch (error) {
        if (error.code !== 'pagamento_nao_configurado') console.warn(`[payments] consulta Pix falhou: ${error.message}`);
      }
    }
    return send(res, 200, {
      id: item.id,
      status: item.status,
      payment_method: item.payment_method,
      payment_status: item.payment_status,
      payment_provider: item.payment_provider,
      payment: { checkout_url: item.payment_checkout_url, qr_code: item.payment_qr_code, qr_code_base64: item.payment_qr_code_base64, expires_at: item.payment_expires_at },
      email_delivery: item.email_confirmation_sent_at ? 'sent' : item.payment_status === 'paid' ? 'pending' : null,
      email_confirmed: Boolean(item.email_confirmed_at),
      confirmed: Boolean(item.confirmed_at)
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/public/payments/paypal/capture') {
    const input = await body(req);
    const orderId = String(input.order_id || '').trim();
    if (!input.enrollment_id || !/^[A-Za-z0-9_-]{5,100}$/.test(orderId)) return send(res, 400, { error: 'dados_invalidos' });
    const enrollment = await query(
      `SELECT id, payment_method, provider_payment_id, payment_status
       FROM public_enrollments WHERE id = $1 LIMIT 1`,
      [input.enrollment_id]
    );
    if (!enrollment.rowCount || enrollment.rows[0].payment_method !== 'paypal' || enrollment.rows[0].provider_payment_id !== orderId) return send(res, 404, { error: 'pagamento_nao_encontrado' });
    if (enrollment.rows[0].payment_status === 'paid') return send(res, 200, { status: 'paid', email_delivery: 'pending' });
    const capture = await capturePaypalOrder(orderId);
    if (capture.status !== 'COMPLETED') return send(res, 202, { status: capture.status || 'pending' });
    const confirmation = await confirmEnrollmentPayment({ enrollmentId: input.enrollment_id, provider: 'paypal', providerPaymentId: orderId, providerStatus: capture.status });
    return send(res, 200, { status: 'paid', email_delivery: confirmation.emailDelivery });
  }

  if (req.method === 'GET' && url.pathname === '/api/public/enrollments/confirm-email') {
    const token = url.searchParams.get('token') || '';
    if (!token) return send(res, 400, { error: 'token_invalido' });
    const result = await confirmEnrollmentEmail(token);
    return send(res, 200, { status: 'email_confirmado', enrollment: result });
  }

  return false;
}

module.exports = { handleMemberDetailRoutes };

