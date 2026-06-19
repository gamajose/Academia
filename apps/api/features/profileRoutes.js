const { hashPassword, verifyPassword } = require('../lib/security');
const { recordAudit } = require('../lib/audit');

async function handleProfileRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const result = await query(
      'SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, g.id AS gym_id, g.name AS gym_name, g.slug AS gym_slug FROM users u INNER JOIN gyms g ON g.id = u.gym_id WHERE u.id = $1 AND u.gym_id = $2 LIMIT 1',
      [user.sub, user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'usuario_nao_encontrado' });
    return send(res, 200, result.rows[0]);
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
