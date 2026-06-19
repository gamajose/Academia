const { hashPassword } = require('../lib/security');
const { recordAudit } = require('../lib/audit');

function isOwner(user) {
  return user.role === 'owner';
}

async function handleUserRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (!url.pathname.startsWith('/api/users')) return false;
  if (!isOwner(user)) return send(res, 403, { error: 'sem_permissao' });

  if (req.method === 'GET' && url.pathname === '/api/users') {
    const result = await query(
      'SELECT id, name, email, role, is_active, created_at FROM users WHERE gym_id = $1 ORDER BY created_at DESC LIMIT 100',
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/users') {
    const input = await body(req);
    if (!input.name || !input.email || !input.password) return send(res, 400, { error: 'dados_invalidos' });
    const allowedRoles = ['owner', 'admin', 'staff'];
    const role = allowedRoles.includes(input.role) ? input.role : 'staff';
    const exists = await query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [input.email]);
    if (exists.rowCount) return send(res, 409, { error: 'email_ja_cadastrado' });

    const result = await query(
      'INSERT INTO users (gym_id, name, email, password_hash, role) VALUES ($1, $2, lower($3), $4, $5) RETURNING id, name, email, role, is_active, created_at',
      [user.gym_id, input.name, input.email, hashPassword(input.password), role]
    );
    await recordAudit(user, 'create', 'user', result.rows[0].id, { email: result.rows[0].email, role });
    return send(res, 201, result.rows[0]);
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
