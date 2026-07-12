const { recordAudit } = require('../lib/audit');
const { digits, nullable, validEmail } = require('../lib/memberValidation');
const { hashPassword, randomToken, hashToken, validatePassword } = require('../lib/security');
const { sendTransactionalEmail } = require('../lib/mailer');

function code() {
  return `ACAD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function appUrl(path) {
  const base = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_WEB_URL || 'http://192.168.3.200:8084').replace(/\/$/, '');
  return `${base}${path}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
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
    if (!input.name || !input.plan_id || !email || !input.password) return send(res, 400, { error: 'dados_invalidos' });
    if (!validEmail(email)) return send(res, 400, { error: 'email_invalido' });
    const passwordCheck = validatePassword(input.password);
    if (!passwordCheck.valid) return send(res, 400, { error: passwordCheck.error });
    if (String(input.password) !== String(input.password_confirmation || '')) return send(res, 400, { error: 'senhas_nao_conferem' });
    const plan = await query('SELECT gym_id, name, price_cents FROM plans WHERE id = $1 AND is_active = true LIMIT 1', [input.plan_id]);
    if (!plan.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });
    const existing = await query('SELECT id FROM member_accounts WHERE lower(email) = lower($1) LIMIT 1', [email]);
    if (existing.rowCount) return send(res, 409, { error: 'email_ja_cadastrado' });
    const enrollmentCode = code();
    const qrPayload = `ACADEMIA:${enrollmentCode}`;
    const confirmationToken = randomToken();
    const confirmationUrl = appUrl(`/student-confirm.html?token=${encodeURIComponent(confirmationToken)}`);
    const result = await query(
      `INSERT INTO public_enrollments (
        gym_id, plan_id, name, email, phone, payment_method, enrollment_code, qr_payload,
        password_hash, confirmation_token_hash, confirmation_expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+interval '48 hours')
      RETURNING id, status, enrollment_code, qr_payload`,
      [plan.rows[0].gym_id, input.plan_id, String(input.name).trim(), email, input.phone || null,
        input.payment_method || 'pix', enrollmentCode, qrPayload, hashPassword(input.password), hashToken(confirmationToken)]
    );
    const emailResult = await sendTransactionalEmail({
      to: email,
      subject: 'Confirme seu pré-cadastro na Academia Lobo',
      text: `Olá, ${String(input.name).trim()}! Confirme seu e-mail para acompanhar sua matrícula: ${confirmationUrl}`,
      html: `<p>Olá, ${escapeHtml(input.name).trim()}!</p><p>Confirme seu e-mail para acompanhar a matrícula do plano <strong>${escapeHtml(plan.rows[0].name)}</strong>.</p><p><a href="${confirmationUrl}">Confirmar meu e-mail</a></p><p>A conta só será liberada após a confirmação do pagamento.</p>`
    });
    if (emailResult.sent) await query('UPDATE public_enrollments SET email_confirmation_sent_at = now() WHERE id = $1', [result.rows[0].id]);
    return send(res, 201, { ...result.rows[0], email_delivery: emailResult.sent ? 'sent' : 'pending' });
  }

  if (req.method === 'GET' && url.pathname === '/api/public/enrollments/confirm-email') {
    const token = url.searchParams.get('token') || '';
    if (!token) return send(res, 400, { error: 'token_invalido' });
    const result = await query(
      `UPDATE public_enrollments
       SET email_confirmed_at = now()
       WHERE confirmation_token_hash = $1
         AND confirmation_expires_at > now()
         AND email_confirmed_at IS NULL
       RETURNING id, status, name`,
      [hashToken(token)]
    );
    if (!result.rowCount) return send(res, 400, { error: 'token_invalido_ou_expirado' });
    return send(res, 200, { status: 'email_confirmado', enrollment: result.rows[0] });
  }

  return false;
}

module.exports = { handleMemberDetailRoutes };
