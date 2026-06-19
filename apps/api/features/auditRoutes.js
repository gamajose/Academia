async function handleAuditRoutes(req, res, user, url, helpers) {
  const { send, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/audit/recent') {
    const result = await query(
      'SELECT id, action, entity, entity_id, metadata, created_at FROM audit_logs WHERE gym_id = $1 ORDER BY created_at DESC LIMIT 100',
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  return false;
}

module.exports = { handleAuditRoutes };
