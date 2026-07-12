const { hashPassword, validatePassword } = require('../lib/security');
const { recordAudit } = require('../lib/audit');
const { digits, nullable, validEmail } = require('../lib/memberValidation');
const { hasModulePermission } = require('../lib/accessControl');

function isOwner(user) {
  return user.role === 'owner';
}

function canManageUsers(user) {
  return hasModulePermission(user, 'users');
}

function canManageRole(user, role) {
  return isOwner(user) || !['owner', 'admin'].includes(role);
}

function normalizeAccessProfile(role, value) {
  if (role === 'owner' || role === 'admin') return 'admin';
  if (role === 'operator') return 'operator';
  return ['reception', 'trainer'].includes(value) ? value : 'reception';
}

async function resolveAccessProfile(query, gymId, role, value) {
  const requested = String(value || '').trim();
  if (requested) {
    const result = await query('SELECT slug, role_key, is_active FROM access_profiles WHERE gym_id = $1 AND slug = $2 LIMIT 1', [gymId, requested]);
    if (result.rowCount && result.rows[0].is_active) return { slug: result.rows[0].slug, role: result.rows[0].role_key };
  }
  const fallbackRole = ['owner', 'admin', 'staff', 'operator'].includes(role) ? role : 'staff';
  return { slug: normalizeAccessProfile(fallbackRole, requested), role: fallbackRole };
}

async function handleUserRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (!url.pathname.startsWith('/api/users')) return false;
  if (!canManageUsers(user)) return send(res, 403, { error: 'sem_permissao' });

  if (req.method === 'GET' && url.pathname === '/api/users') {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.cpf, u.rg, u.birth_date, u.job_title,
              u.access_profile, ap.name AS access_profile_name, u.role, u.is_active, u.address_details, u.created_at
       FROM users u LEFT JOIN access_profiles ap ON ap.gym_id = u.gym_id AND ap.slug = u.access_profile
       WHERE u.gym_id = $1 ORDER BY u.created_at DESC LIMIT 100`,
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/users') {
    const input = await body(req);
    if (!input.name || !input.email || !input.password || !validEmail(input.email)) return send(res, 400, { error: 'dados_invalidos' });
    const passwordCheck = validatePassword(input.password);
    if (!passwordCheck.valid) return send(res, 400, { error: passwordCheck.error });
    const allowedRoles = ['admin', 'staff', 'operator'];
    const access = await resolveAccessProfile(query, user.gym_id, input.role, input.access_profile);
    const role = access.role;
    if (!canManageRole(user, role)) return send(res, 403, { error: 'sem_permissao' });
    const exists = await query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [input.email]);
    if (exists.rowCount) return send(res, 409, { error: 'email_ja_cadastrado' });

    const result = await query(
      `INSERT INTO users (gym_id, name, email, password_hash, role, access_profile, phone, cpf, rg, birth_date, job_title, address_details)
       VALUES ($1, $2, lower($3), $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       RETURNING id, name, email, phone, cpf, rg, birth_date, job_title, access_profile, role, is_active, address_details, created_at`,
      [user.gym_id, String(input.name).trim(), input.email, hashPassword(input.password), role, access.slug, digits(input.phone, 24) || null, digits(input.cpf, 11) || null, nullable(input.rg), input.birth_date || null, nullable(input.job_title), JSON.stringify(input.address_details || {})]
    );
    await recordAudit(user, 'create', 'user', result.rows[0].id, { email: result.rows[0].email, role });
    return send(res, 201, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/users/update') {
    const input = await body(req);
    if (!input.user_id || !input.name || !validEmail(input.email)) return send(res, 400, { error: 'dados_invalidos' });
    const existing = await query('SELECT id, role FROM users WHERE id = $1 AND gym_id = $2 LIMIT 1', [input.user_id, user.gym_id]);
    if (!existing.rowCount) return send(res, 404, { error: 'usuario_nao_encontrado' });
    const access = await resolveAccessProfile(query, user.gym_id, input.role || existing.rows[0].role, input.access_profile);
    const role = access.role;
    if (!canManageRole(user, role) || (!isOwner(user) && existing.rows[0].role === 'owner')) return send(res, 403, { error: 'sem_permissao' });
    const duplicate = await query('SELECT id FROM users WHERE lower(email) = lower($1) AND id <> $2 LIMIT 1', [input.email, input.user_id]);
    if (duplicate.rowCount) return send(res, 409, { error: 'email_ja_cadastrado' });
    const result = await query(
      `UPDATE users SET name = $3, email = lower($4), phone = $5, cpf = $6, rg = $7,
              birth_date = $8, job_title = $9, role = $10, access_profile = $11,
              address_details = $12::jsonb
       WHERE id = $1 AND gym_id = $2
       RETURNING id, name, email, phone, cpf, rg, birth_date, job_title, access_profile, role, is_active, address_details, created_at`,
      [input.user_id, user.gym_id, String(input.name).trim(), input.email, digits(input.phone, 24) || null, digits(input.cpf, 11) || null, nullable(input.rg), input.birth_date || null, nullable(input.job_title), role, access.slug, JSON.stringify(input.address_details || {})]
    );
    await recordAudit(user, 'update', 'user', result.rows[0].id, { role, access_profile: result.rows[0].access_profile });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/users/reset-password') {
    const input = await body(req);
    if (!input.user_id || !input.new_password) return send(res, 400, { error: 'dados_invalidos' });
    const target = await query('SELECT role FROM users WHERE id = $1 AND gym_id = $2 LIMIT 1', [input.user_id, user.gym_id]);
    if (!target.rowCount || (!isOwner(user) && ['owner', 'admin'].includes(target.rows[0].role))) return send(res, 403, { error: 'sem_permissao' });
    const passwordCheck = validatePassword(input.new_password);
    if (!passwordCheck.valid) return send(res, 400, { error: passwordCheck.error });
    const result = await query(
      'UPDATE users SET password_hash = $3 WHERE id = $1 AND gym_id = $2 RETURNING id, name, email, role, is_active',
      [input.user_id, user.gym_id, hashPassword(input.new_password)]
    );
    if (!result.rowCount) return send(res, 404, { error: 'usuario_nao_encontrado' });
    await recordAudit(user, 'reset_password', 'user', result.rows[0].id, { email: result.rows[0].email });
    return send(res, 200, { status: 'senha_redefinida', user: result.rows[0] });
  }

  if (req.method === 'POST' && url.pathname === '/api/users/deactivate') {
    const input = await body(req);
    if (!input.user_id) return send(res, 400, { error: 'user_id_obrigatorio' });
    if (input.user_id === user.sub) return send(res, 400, { error: 'nao_pode_desativar_proprio_usuario' });
    const result = await query(
      'UPDATE users SET is_active = false WHERE id = $1 AND gym_id = $2 RETURNING id, name, email, role, is_active',
      [input.user_id, user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'usuario_nao_encontrado' });
    await recordAudit(user, 'deactivate', 'user', result.rows[0].id, { email: result.rows[0].email });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/users/activate') {
    const input = await body(req);
    if (!input.user_id) return send(res, 400, { error: 'user_id_obrigatorio' });
    const result = await query(
      'UPDATE users SET is_active = true WHERE id = $1 AND gym_id = $2 RETURNING id, name, email, role, is_active',
      [input.user_id, user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'usuario_nao_encontrado' });
    await recordAudit(user, 'activate', 'user', result.rows[0].id, { email: result.rows[0].email });
    return send(res, 200, result.rows[0]);
  }

  return false;
}

module.exports = { handleUserRoutes };
