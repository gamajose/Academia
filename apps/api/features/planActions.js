const { sanitizeRichFields } = require('../lib/richContent');

async function handlePlanActions(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/plans/detail') {
    const result = await query(
      'SELECT id, name, price_cents, duration_days, is_active, description, benefits, rules, public_highlight, created_at, updated_at FROM plans WHERE gym_id = $1 ORDER BY price_cents ASC, name ASC',
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/plans/detail') {
    const input = await body(req);
    if (!input.name) return send(res, 400, { error: 'nome_obrigatorio' });
    let rich;
    try { rich = sanitizeRichFields(input, ['description', 'benefits', 'rules']); } catch (error) { return send(res, 400, { error: error.code || 'conteudo_invalido', field: error.field }); }
    const result = await query(
      `INSERT INTO plans (gym_id, name, price_cents, duration_days, description, benefits, rules, public_highlight)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, name, price_cents, duration_days, is_active, description, benefits, rules, public_highlight, created_at`,
      [user.gym_id, input.name, Number(input.price_cents || 0), Number(input.duration_days || 30), rich.description || null, rich.benefits || null, rich.rules || null, input.public_highlight || null]
    );
    return send(res, 201, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/plans/update') {
    const input = await body(req);
    if (!input.plan_id) return send(res, 400, { error: 'plan_id_obrigatorio' });
    let rich;
    try { rich = sanitizeRichFields(input, ['description', 'benefits', 'rules']); } catch (error) { return send(res, 400, { error: error.code || 'conteudo_invalido', field: error.field }); }
    const result = await query(
      `UPDATE plans SET name = COALESCE($3, name), price_cents = COALESCE($4, price_cents), duration_days = COALESCE($5, duration_days), description = COALESCE($6, description), benefits = COALESCE($7, benefits), rules = COALESCE($8, rules), public_highlight = COALESCE($9, public_highlight), updated_at = now()
       WHERE id = $1 AND gym_id = $2
       RETURNING id, name, price_cents, duration_days, is_active, description, benefits, rules, public_highlight, updated_at`,
      [input.plan_id, user.gym_id, input.name || null, input.price_cents == null ? null : Number(input.price_cents), input.duration_days == null ? null : Number(input.duration_days), Object.prototype.hasOwnProperty.call(rich, 'description') ? rich.description : null, Object.prototype.hasOwnProperty.call(rich, 'benefits') ? rich.benefits : null, Object.prototype.hasOwnProperty.call(rich, 'rules') ? rich.rules : null, input.public_highlight || null]
    );
    if (!result.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/plans/deactivate') {
    const input = await body(req);
    if (!input.plan_id) return send(res, 400, { error: 'plan_id_obrigatorio' });
    const result = await query('UPDATE plans SET is_active = false, updated_at = now() WHERE id = $1 AND gym_id = $2 RETURNING id, name, is_active, updated_at', [input.plan_id, user.gym_id]);
    if (!result.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/plans/activate') {
    const input = await body(req);
    if (!input.plan_id) return send(res, 400, { error: 'plan_id_obrigatorio' });
    const result = await query('UPDATE plans SET is_active = true, updated_at = now() WHERE id = $1 AND gym_id = $2 RETURNING id, name, is_active, updated_at', [input.plan_id, user.gym_id]);
    if (!result.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && (url.pathname === '/api/plans/delete' || url.pathname === '/api/plans/remove')) {
    const input = await body(req);
    const planId = input.plan_id || input.id;
    if (!planId) return send(res, 400, { error: 'plan_id_obrigatorio' });

    const checkMemberships = await query('SELECT count(*) FROM memberships WHERE plan_id = $1', [planId]);
    if (Number(checkMemberships.rows[0].count) > 0) {
      await query('UPDATE plans SET is_active = false, updated_at = now() WHERE id = $1 AND gym_id = $2', [planId, user.gym_id]);
      return send(res, 400, { error: 'plano_com_matriculas', message: 'Este plano possui matrículas vinculadas. Ele foi desativado em vez de excluído para preservar o histórico financeiro.' });
    }

    const result = await query('DELETE FROM plans WHERE id = $1 AND gym_id = $2 RETURNING id, name', [planId, user.gym_id]);
    if (!result.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });
    return send(res, 200, { ok: true, deleted: true, plan: result.rows[0] });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/plans')) {
    const segments = url.pathname.split('/').filter(Boolean);
    const planId = segments[2] || url.searchParams.get('id');
    if (!planId) return send(res, 400, { error: 'plan_id_obrigatorio' });

    const checkMemberships = await query('SELECT count(*) FROM memberships WHERE plan_id = $1', [planId]);
    if (Number(checkMemberships.rows[0].count) > 0) {
      await query('UPDATE plans SET is_active = false, updated_at = now() WHERE id = $1 AND gym_id = $2', [planId, user.gym_id]);
      return send(res, 400, { error: 'plano_com_matriculas', message: 'Este plano possui matrículas vinculadas. Ele foi desativado em vez de excluído para preservar o histórico financeiro.' });
    }

    const result = await query('DELETE FROM plans WHERE id = $1 AND gym_id = $2 RETURNING id, name', [planId, user.gym_id]);
    if (!result.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });
    return send(res, 200, { ok: true, deleted: true, plan: result.rows[0] });
  }

  return false;
}

module.exports = { handlePlanActions };
