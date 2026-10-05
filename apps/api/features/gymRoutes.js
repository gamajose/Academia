const { recordAudit } = require('../lib/audit');
const { hasModulePermission } = require('../lib/accessControl');

function canManageGym(user) {
  return hasModulePermission(user, 'settings');
}

async function handleGymRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/gym/profile') {
    const result = await query(
      'SELECT id, name, slug, status, phone, email, address, document_number, timezone, logo_url, pix_key, payment_settings, site_settings, created_at, updated_at FROM gyms WHERE id = $1 LIMIT 1',
      [user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'academia_nao_encontrada' });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/gym/site-settings') {
    const result = await query(
      'SELECT site_settings, name, logo_url FROM gyms WHERE id = $1 LIMIT 1',
      [user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'academia_nao_encontrada' });
    return send(res, 200, { name: result.rows[0].name, logo_url: result.rows[0].logo_url, site_settings: result.rows[0].site_settings || {} });
  }

  if (req.method === 'POST' && url.pathname === '/api/gym/site-settings') {
    if (!canManageGym(user)) return send(res, 403, { error: 'sem_permissao' });
    const input = await body(req);
    const settings = input.site_settings !== undefined ? input.site_settings : input;
    const result = await query(
      'UPDATE gyms SET site_settings = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING site_settings',
      [user.gym_id, JSON.stringify(settings || {})]
    );
    if (!result.rowCount) return send(res, 404, { error: 'academia_nao_encontrada' });
    await recordAudit(user, 'update', 'gym_site_settings', user.gym_id, { site_settings: result.rows[0].site_settings });
    return send(res, 200, { site_settings: result.rows[0].site_settings });
  }

  if (req.method === 'POST' && url.pathname === '/api/gym/profile') {
    if (!canManageGym(user)) return send(res, 403, { error: 'sem_permissao' });
    const input = await body(req);
    const pixFromSettings = input.payment_settings?.pix?.key;
    const finalPixKey = input.pix_key !== undefined ? input.pix_key : pixFromSettings;
    const result = await query(
      `UPDATE gyms SET
         name = COALESCE($2, name),
         phone = COALESCE($3, phone),
         email = COALESCE($4, email),
         address = COALESCE($5, address),
         document_number = COALESCE($6, document_number),
         timezone = COALESCE($7, timezone),
         logo_url = CASE WHEN $8::boolean THEN $9 ELSE logo_url END,
         pix_key = CASE WHEN $10::boolean THEN $11 ELSE pix_key END,
         payment_settings = CASE WHEN $12::boolean THEN $13::jsonb ELSE payment_settings END,
         site_settings = CASE WHEN $14::boolean THEN $15::jsonb ELSE site_settings END,
         updated_at = now()
       WHERE id = $1
       RETURNING id, name, slug, status, phone, email, address, document_number, timezone, logo_url, pix_key, payment_settings, site_settings, updated_at`,
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
        finalPixKey !== undefined,
        finalPixKey || null,
        input.payment_settings !== undefined,
        JSON.stringify(input.payment_settings || {}),
        input.site_settings !== undefined,
        JSON.stringify(input.site_settings || {})
      ]
    );
    if (!result.rowCount) return send(res, 404, { error: 'academia_nao_encontrada' });
    await recordAudit(user, 'update', 'gym', user.gym_id, { name: result.rows[0].name });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/gym/payment-settings') {
    const result = await query(
      'SELECT pix_key, payment_settings FROM gyms WHERE id = $1 LIMIT 1',
      [user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'academia_nao_encontrada' });
    const row = result.rows[0];
    const settings = row.payment_settings || {};
    if (!settings.pix) settings.pix = {};
    if (!settings.pix.key && row.pix_key) settings.pix.key = row.pix_key;
    return send(res, 200, { payment_settings: settings, pix_key: row.pix_key });
  }

  if ((req.method === 'PUT' || req.method === 'POST') && url.pathname === '/api/gym/payment-settings') {
    if (!canManageGym(user)) return send(res, 403, { error: 'sem_permissao' });
    const input = await body(req);
    const settings = input.payment_settings || input;
    const pixKey = settings.pix?.key || input.pix_key || null;
    const result = await query(
      'UPDATE gyms SET payment_settings = $2::jsonb, pix_key = COALESCE($3, pix_key), updated_at = now() WHERE id = $1 RETURNING payment_settings, pix_key',
      [user.gym_id, JSON.stringify(settings), pixKey]
    );
    if (!result.rowCount) return send(res, 404, { error: 'academia_nao_encontrada' });
    await recordAudit(user, 'update', 'gym_payment_settings', user.gym_id, { pix_key: pixKey });
    return send(res, 200, result.rows[0]);
  }

  return false;
}

module.exports = { handleGymRoutes };
