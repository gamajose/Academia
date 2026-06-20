const { recordAudit } = require('../lib/audit');

function code() {
  return `ACAD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function handleMemberDetailRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/members/detail') {
    const result = await query(
      `SELECT m.id, m.name, m.email, m.phone, m.status, m.birth_date, m.document, m.address, m.emergency_contact, m.allergies, m.medical_notes, m.nutrition_notes, m.objective, m.notes,
        ms.id AS membership_id, ms.status AS membership_status, p.name AS plan_name,
        COALESCE(SUM(pay.amount_cents) FILTER (WHERE pay.status = 'pending'), 0) AS pending_amount_cents
       FROM members m
       LEFT JOIN memberships ms ON ms.member_id = m.id AND ms.gym_id = m.gym_id AND ms.status = 'active'
       LEFT JOIN plans p ON p.id = ms.plan_id
       LEFT JOIN payments pay ON pay.member_id = m.id AND pay.gym_id = m.gym_id
       WHERE m.gym_id = $1
       GROUP BY m.id, ms.id, p.name
       ORDER BY m.created_at DESC`,
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/members/detail/save') {
    const input = await body(req);
    if (!input.name) return send(res, 400, { error: 'nome_obrigatorio' });
    let result;
    if (input.member_id) {
      result = await query(
        `UPDATE members SET name=$3, email=$4, phone=$5, birth_date=$6, document=$7, address=$8, emergency_contact=$9, allergies=$10, medical_notes=$11, nutrition_notes=$12, objective=$13, notes=$14, updated_at=now()
         WHERE id=$1 AND gym_id=$2
         RETURNING id, name, email, phone, status`,
        [input.member_id, user.gym_id, input.name, input.email || null, input.phone || null, input.birth_date || null, input.document || null, input.address || null, input.emergency_contact || null, input.allergies || null, input.medical_notes || null, input.nutrition_notes || null, input.objective || null, input.notes || null]
      );
    } else {
      result = await query(
        `INSERT INTO members (gym_id, name, email, phone, birth_date, document, address, emergency_contact, allergies, medical_notes, nutrition_notes, objective, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id, name, email, phone, status`,
        [user.gym_id, input.name, input.email || null, input.phone || null, input.birth_date || null, input.document || null, input.address || null, input.emergency_contact || null, input.allergies || null, input.medical_notes || null, input.nutrition_notes || null, input.objective || null, input.notes || null]
      );
    }
    if (!result.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    await recordAudit(user, input.member_id ? 'update' : 'create', 'member', result.rows[0].id, { name: result.rows[0].name });
    return send(res, input.member_id ? 200 : 201, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/public/plans') {
    const result = await query('SELECT id, name, price_cents, duration_days FROM plans WHERE is_active = true ORDER BY price_cents ASC LIMIT 20');
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/public/enrollments') {
    const input = await body(req);
    if (!input.name || !input.plan_id) return send(res, 400, { error: 'dados_invalidos' });
    const plan = await query('SELECT gym_id FROM plans WHERE id = $1 AND is_active = true LIMIT 1', [input.plan_id]);
    if (!plan.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });
    const enrollmentCode = code();
    const qrPayload = `ACADEMIA:${enrollmentCode}`;
    const result = await query(
      `INSERT INTO public_enrollments (gym_id, plan_id, name, email, phone, payment_method, enrollment_code, qr_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, status, enrollment_code, qr_payload`,
      [plan.rows[0].gym_id, input.plan_id, input.name, input.email || null, input.phone || null, input.payment_method || null, enrollmentCode, qrPayload]
    );
    return send(res, 201, result.rows[0]);
  }

  return false;
}

module.exports = { handleMemberDetailRoutes };
