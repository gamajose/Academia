const { pool } = require('./db');
const { randomToken, hashToken } = require('./security');
const { sendTransactionalEmail } = require('./mailer');

function appUrl(path) {
  const base = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_WEB_URL || 'http://192.168.3.200:8084').replace(/\/$/, '');
  return `${base}${path}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function confirmEnrollmentPayment({ enrollmentId, provider, providerPaymentId, providerStatus }) {
  const client = await pool.connect();
  let enrollment;
  let confirmationToken;
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT e.*, p.name AS plan_name, p.price_cents, p.duration_days
       FROM public_enrollments e
       LEFT JOIN plans p ON p.id = e.plan_id
       WHERE e.id = $1
       FOR UPDATE`,
      [enrollmentId]
    );
    if (!found.rowCount) {
      const error = new Error('matricula_nao_encontrada');
      error.statusCode = 404;
      throw error;
    }
    enrollment = found.rows[0];
    if (enrollment.payment_status === 'paid' && enrollment.created_member_id) {
      await client.query('COMMIT');
      return { enrollment, alreadyConfirmed: true, emailDelivery: enrollment.email_confirmation_sent_at ? 'sent' : 'pending' };
    }

    const duplicate = await client.query(
      'SELECT id FROM member_accounts WHERE lower(email) = lower($1) LIMIT 1',
      [enrollment.email]
    );
    if (duplicate.rowCount) {
      const error = new Error('email_ja_cadastrado');
      error.statusCode = 409;
      throw error;
    }

    const member = await client.query(
      `INSERT INTO members (gym_id, name, email, phone, status)
       VALUES ($1, $2, $3, $4, 'inactive')
       RETURNING id`,
      [enrollment.gym_id, enrollment.name, enrollment.email || null, enrollment.phone || null]
    );
    const membership = await client.query(
      `INSERT INTO memberships (gym_id, member_id, plan_id, starts_at, ends_at, status)
       VALUES ($1, $2, $3, current_date, current_date + ($4 || ' days')::interval, 'active')
       RETURNING id`,
      [enrollment.gym_id, member.rows[0].id, enrollment.plan_id, Number(enrollment.duration_days || 30)]
    );
    await client.query(
      `INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, method, notes, due_date, paid_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, current_date, now(), 'paid')`,
      [enrollment.gym_id, member.rows[0].id, membership.rows[0].id, Number(enrollment.price_cents || 0), enrollment.payment_method, `Pagamento confirmado por ${provider}`]
    );
    await client.query(
      `INSERT INTO member_accounts (gym_id, member_id, email, secret_hash, is_active)
       VALUES ($1, $2, lower($3), $4, false)`,
      [enrollment.gym_id, member.rows[0].id, enrollment.email, enrollment.password_hash]
    );
    confirmationToken = randomToken();
    const updated = await client.query(
      `UPDATE public_enrollments
       SET payment_provider = $2, provider_payment_id = $3, payment_status = 'paid',
           payment_confirmed_at = now(), status = 'pending', created_member_id = $4,
           confirmation_token_hash = $5, confirmation_expires_at = now() + interval '48 hours'
       WHERE id = $1
       RETURNING id, status, enrollment_code, qr_payload, created_member_id, payment_status`,
      [enrollment.id, provider, String(providerPaymentId || ''), member.rows[0].id, hashToken(confirmationToken)]
    );
    enrollment = { ...enrollment, ...updated.rows[0], created_member_id: member.rows[0].id };
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const confirmationUrl = appUrl(`/student-confirm.html?token=${encodeURIComponent(confirmationToken)}`);
  const emailResult = await sendTransactionalEmail({
    to: enrollment.email,
    subject: 'Pagamento confirmado: confirme seu cadastro na Academia Lobo',
    text: `Olá, ${enrollment.name}! Seu pagamento foi confirmado. Confirme seu cadastro neste link: ${confirmationUrl}`,
    html: `<p>Olá, ${escapeHtml(enrollment.name)}!</p><p>Seu pagamento do plano <strong>${escapeHtml(enrollment.plan_name)}</strong> foi confirmado.</p><p><a href="${confirmationUrl}">Confirmar meu cadastro</a></p><p>Depois da confirmação, sua conta estará pronta para acesso.</p>`
  });
  if (emailResult.sent) {
    await pool.query('UPDATE public_enrollments SET email_confirmation_sent_at = now() WHERE id = $1', [enrollment.id]);
  }
  return { enrollment, alreadyConfirmed: false, emailDelivery: emailResult.sent ? 'sent' : 'pending' };
}

async function confirmEnrollmentEmail(token) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, created_member_id, status, email_confirmed_at
       FROM public_enrollments
       WHERE confirmation_token_hash = $1 AND confirmation_expires_at > now()
       FOR UPDATE`,
      [hashToken(token)]
    );
    if (!found.rowCount || found.rows[0].email_confirmed_at) {
      const error = new Error('token_invalido_ou_expirado');
      error.statusCode = 400;
      throw error;
    }
    const enrollment = found.rows[0];
    const updated = await client.query(
      `UPDATE public_enrollments
       SET email_confirmed_at = now(), status = 'confirmed', confirmed_at = now()
       WHERE id = $1
       RETURNING id, status, name, created_member_id`,
      [enrollment.id]
    );
    await client.query('UPDATE members SET status = \'active\', updated_at = now() WHERE id = $1', [enrollment.created_member_id]);
    await client.query('UPDATE member_accounts SET is_active = true, updated_at = now() WHERE member_id = $1', [enrollment.created_member_id]);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { confirmEnrollmentPayment, confirmEnrollmentEmail };
