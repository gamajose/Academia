async function handleMemberActions(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'POST' && url.pathname === '/api/members/update') {
    const input = await body(req);
    if (!input.member_id) return send(res, 400, { error: 'member_id_obrigatorio' });
    const result = await query(
      'UPDATE members SET name = COALESCE($3, name), email = COALESCE($4, email), phone = COALESCE($5, phone), updated_at = now() WHERE id = $1 AND gym_id = $2 RETURNING id, name, email, phone, status, updated_at',
      [input.member_id, user.gym_id, input.name || null, input.email || null, input.phone || null]
    );
    if (!result.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/members/deactivate') {
    const input = await body(req);
    if (!input.member_id) return send(res, 400, { error: 'member_id_obrigatorio' });
    const result = await query("UPDATE members SET status = 'inactive', updated_at = now() WHERE id = $1 AND gym_id = $2 RETURNING id, name, status, updated_at", [input.member_id, user.gym_id]);
    if (!result.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/members/activate') {
    const input = await body(req);
    if (!input.member_id) return send(res, 400, { error: 'member_id_obrigatorio' });
    const result = await query("UPDATE members SET status = 'active', updated_at = now() WHERE id = $1 AND gym_id = $2 RETURNING id, name, status, updated_at", [input.member_id, user.gym_id]);
    if (!result.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  return false;
}

module.exports = { handleMemberActions };
