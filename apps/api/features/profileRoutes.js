const { hashPassword, verifyPassword } = require('../lib/security');
const { recordAudit } = require('../lib/audit');
const { digits, nullable, validEmail } = require('../lib/memberValidation');

function profileData(row) {
  return {
    id: row.id, name: row.name, email: row.email, phone: row.phone,
    cpf: row.cpf, rg: row.rg, birth_date: row.birth_date, job_title: row.job_title,
    access_profile: row.access_profile, role: row.role, is_active: row.is_active,
    address_details: row.address_details || {}, created_at: row.created_at,
    gym_id: row.gym_id, gym_name: row.gym_name, gym_slug: row.gym_slug
  };
}

async function handleProfileRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.cpf, u.rg, u.birth_date, u.job_title,
              u.access_profile, u.role, u.is_active, u.address_details, u.created_at,
              g.id AS gym_id, g.name AS gym_name, g.slug AS gym_slug
       FROM users u INNER JOIN gyms g ON g.id = u.gym_id
       WHERE u.id = $1 AND u.gym_id = $2 LIMIT 1`,
      [user.sub, user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'usuario_nao_encontrado' });
    return send(res, 200, profileData(result.rows[0]));
  }

  if (req.method === 'POST' && url.pathname === '/api/me/profile') {
    const input = await body(req);
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    if (name.length < 2 || !validEmail(email)) return send(res, 400, { error: 'dados_invalidos' });
    const duplicate = await query('SELECT id FROM users WHERE lower(email) = lower($1) AND id <> $2 LIMIT 1', [email, user.sub]);
    if (duplicate.rowCount) return send(res, 409, { error: 'email_ja_cadastrado' });
    const cpf = digits(input.cpf, 11) || null;
    if (input.cpf && cpf.length !== 11) return send(res, 400, { error: 'cpf_invalido' });
    if (cpf) {
      const duplicateCpf = await query('SELECT id FROM users WHERE gym_id = $1 AND cpf = $2 AND id <> $3 LIMIT 1', [user.gym_id, cpf, user.sub]);
      if (duplicateCpf.rowCount) return send(res, 409, { error: 'cpf_ja_cadastrado' });
    }
    const result = await query(
      `UPDATE users SET name = $3, email = $4, phone = $5, cpf = $6, rg = $7,
              birth_date = $8, address_details = $9::jsonb
       WHERE id = $1 AND gym_id = $2
       RETURNING id, name, email, phone, cpf, rg, birth_date, job_title,
                 access_profile, role, is_active, address_details, created_at`,
      [user.sub, user.gym_id, name, email, digits(input.phone, 24) || null, cpf, nullable(input.rg), input.birth_date || null, JSON.stringify(input.address_details || {})]
    );
    if (!result.rowCount) return send(res, 404, { error: 'usuario_nao_encontrado' });
    await recordAudit(user, 'update', 'user_profile', user.sub, { email });
    return send(res, 200, profileData({ ...result.rows[0], gym_id: user.gym_id }));
  }

  if (req.method === 'POST' && url.pathname === '/api/me/change-password') {
    const input = await body(req);
    if (!input.current_password || !input.new_password) return send(res, 400, { error: 'dados_invalidos' });
    if (String(input.new_password).length < 8) return send(res, 400, { error: 'senha_muito_curta' });

    const current = await query('SELECT id, password_hash FROM users WHERE id = $1 AND gym_id = $2 LIMIT 1', [user.sub, user.gym_id]);
    if (!current.rowCount) return send(res, 404, { error: 'usuario_nao_encontrado' });
    if (!verifyPassword(input.current_password, current.rows[0].password_hash)) return send(res, 401, { error: 'senha_atual_invalida' });

    await query('UPDATE users SET password_hash = $3 WHERE id = $1 AND gym_id = $2', [user.sub, user.gym_id, hashPassword(input.new_password)]);
    await recordAudit(user, 'change_password', 'user', user.sub, {});
    return send(res, 200, { status: 'senha_alterada' });
  }

  return false;
}

module.exports = { handleProfileRoutes };
