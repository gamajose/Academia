const { hashPassword, randomToken, signToken } = require('../lib/security');

function googleClientIds() {
  return [process.env.GOOGLE_WEB_CLIENT_ID, process.env.GOOGLE_MOBILE_CLIENT_ID, process.env.GOOGLE_CLIENT_ID]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

async function verifyGoogleToken(idToken) {
  const token = String(idToken || '').trim();
  if (!token) throw new Error('token_google_obrigatorio');
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.iss !== 'https://accounts.google.com' || data.email_verified !== 'true' || !data.email) throw new Error('token_google_invalido');
  const clientIds = googleClientIds();
  if (!clientIds.length) throw new Error('google_nao_configurado');
  if (!clientIds.includes(data.aud)) throw new Error('token_google_invalido');
  return data;
}

function authResponse(account, accountType) {
  if (accountType === 'admin') {
    const token = signToken({ sub: account.id, gym_id: account.gym_id, role: account.role, access_profile: account.access_profile });
    return { token, account_type: 'admin', user: { id: account.id, name: account.name, email: account.email, phone: account.phone, role: account.role, access_profile: account.access_profile, gym_id: account.gym_id } };
  }
  if (accountType === 'student') {
    const token = signToken({ sub: account.id, gym_id: account.gym_id, role: 'student', member_id: account.member_id });
    return { token, account_type: 'student', must_change_password: false, student: { id: account.member_id, name: account.member_name, email: account.email, role: 'student', gym_id: account.gym_id } };
  }
  const token = signToken({ sub: account.id, gym_id: account.gym_id, role: 'visitor', visitor_id: account.id });
  return { token, account_type: 'visitor', student: { id: account.id, name: account.name, email: account.email, phone: account.phone, role: 'visitor', gym_id: account.gym_id } };
}

async function handleGoogleAuthRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;
  if (req.method === 'GET' && url.pathname === '/api/auth/google/config') {
    return send(res, 200, { enabled: Boolean(process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID), client_id: process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || null });
  }
  if (req.method !== 'POST' || url.pathname !== '/api/auth/google') return false;
  if (!googleClientIds().length) return send(res, 503, { error: 'google_nao_configurado' });

  let identity;
  try { identity = await verifyGoogleToken((await body(req)).id_token); } catch (error) {
    return send(res, error.message === 'google_nao_configurado' ? 503 : 401, { error: error.message || 'token_google_invalido' });
  }
  const email = String(identity.email).trim().toLowerCase();

  const staff = await query('SELECT id, gym_id, name, email, phone, role, access_profile, is_active FROM users WHERE lower(email) = $1 LIMIT 1', [email]);
  if (staff.rowCount && staff.rows[0].is_active) return send(res, 200, authResponse(staff.rows[0], 'admin'));

  const student = await query(
    `SELECT ma.id, ma.gym_id, ma.member_id, ma.email, ma.is_active, ma.must_change_password, m.name AS member_name
     FROM member_accounts ma INNER JOIN members m ON m.id = ma.member_id
     WHERE lower(ma.email) = $1 LIMIT 1`,
    [email]
  );
  if (student.rowCount && student.rows[0].is_active) return send(res, 200, authResponse(student.rows[0], 'student'));

  const visitor = await query('SELECT id, gym_id, name, email, phone, is_active FROM visitor_accounts WHERE lower(email) = $1 LIMIT 1', [email]);
  if (visitor.rowCount && visitor.rows[0].is_active) return send(res, 200, authResponse(visitor.rows[0], 'visitor'));
  if (staff.rowCount || student.rowCount || visitor.rowCount) return send(res, 403, { error: 'conta_inativa' });

  const gym = await query("SELECT id FROM gyms WHERE status = 'active' ORDER BY created_at ASC LIMIT 1");
  if (!gym.rowCount) return send(res, 503, { error: 'academia_indisponivel' });
  const created = await query(
    `INSERT INTO visitor_accounts (gym_id, name, email, phone, secret_hash)
     VALUES ($1, $2, $3, NULL, $4)
     RETURNING id, gym_id, name, email, phone, is_active`,
    [gym.rows[0].id, String(identity.name || email.split('@')[0]).trim(), email, hashPassword(randomToken())]
  );
  return send(res, 201, authResponse(created.rows[0], 'visitor'));
}

module.exports = { handleGoogleAuthRoutes, verifyGoogleToken };
