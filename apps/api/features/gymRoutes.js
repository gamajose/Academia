const { recordAudit } = require('../lib/audit');
const { hasModulePermission } = require('../lib/accessControl');

function canManageGym(user) {
  return hasModulePermission(user, 'settings');
}

async function handleGymRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/gym/profile') {
    const result = await query(
      'SELECT id, name, slug, status, phone, email, address, document_number, timezone, logo_url, pix_key, created_at, updated_at FROM gyms WHERE id = $1 LIMIT 1',
      [user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'academia_nao_encontrada' });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/gym/profile') {
    if (!canManageGym(user)) return send(res, 403, { error: 'sem_permissao' });
    const input = await body(req);
    const result = await query(
      'UPDATE gyms SET name = COALESCE($2, name), phone = COALESCE($3, phone), email = COALESCE($4, email), address = COALESCE($5, address), document_number = COALESCE($6, document_number), timezone = COALESCE($7, timezone), logo_url = CASE WHEN $8::boolean THEN $9 ELSE logo_url END, pix_key = CASE WHEN $10::boolean THEN $11 ELSE pix_key END, updated_at = now() WHERE id = $1 RETURNING id, name, slug, status, phone, email, address, document_number, timezone, logo_url, pix_key, updated_at',
      [
        user.gym_id,
        input.name || null,
        input.phone || null,
        input.email || null,
        input.address || null,
        input.document_number || null,
        input.timezone || null,
        input.logo_url !== undefined,
        input.logo_url || null,
        input.pix_key !== undefined,
        input.pix_key || null
      ]
    );
    if (!result.rowCount) return send(res, 404, { error: 'academia_nao_encontrada' });
    await recordAudit(user, 'update', 'gym', user.gym_id, { name: result.rows[0].name });
    return send(res, 200, result.rows[0]);
  }

  return false;
}

module.exports = { handleGymRoutes };
