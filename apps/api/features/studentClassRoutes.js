const { pool } = require('../lib/db');

function isStudent(user) {
  return user && user.role === 'student' && user.member_id;
}

async function studentClasses(res, user, helpers) {
  if (!isStudent(user)) return false;
  const result = await helpers.query(
    `SELECT cs.id AS session_id, cs.starts_at, cs.ends_at, cs.capacity, cs.status,
            gc.id AS class_id, gc.name, gc.description, gc.room, gc.level,
            gc.required_plan_id, u.name AS instructor_name,
            count(cr.id) FILTER (WHERE cr.status IN ('confirmed','attended'))::integer AS reserved,
            own.status AS reservation_status,
            current_membership.plan_id AS member_plan_id,
            (gc.required_plan_id IS NULL OR gc.required_plan_id = current_membership.plan_id) AS plan_allowed,
            (count(cr.id) FILTER (WHERE cr.status IN ('confirmed','attended')) < cs.capacity) AS has_spots
     FROM class_sessions cs
     INNER JOIN gym_classes gc ON gc.id = cs.class_id
     LEFT JOIN users u ON u.id = COALESCE(cs.instructor_id, gc.instructor_id)
     LEFT JOIN class_reservations cr ON cr.session_id = cs.id
     LEFT JOIN class_reservations own ON own.session_id = cs.id AND own.member_id = $2
     LEFT JOIN LATERAL (
       SELECT plan_id FROM memberships
       WHERE gym_id = $1 AND member_id = $2 AND status = 'active' AND ends_at >= current_date
       ORDER BY ends_at DESC LIMIT 1
     ) current_membership ON true
     WHERE cs.gym_id = $1 AND cs.starts_at >= now() - interval '2 hours' AND cs.status = 'scheduled'
     GROUP BY cs.id, gc.id, u.name, own.status, current_membership.plan_id
     ORDER BY cs.starts_at
     LIMIT 100`,
    [user.gym_id, user.member_id]
  );
  return helpers.send(res, 200, { data: result.rows });
}

async function reserveClass(req, res, user, helpers) {
  if (!isStudent(user)) return false;
  const input = await helpers.body(req);
  if (!input.session_id) return helpers.send(res, 400, { error: 'session_id_obrigatorio' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = await client.query(
      `SELECT cs.id, cs.capacity, cs.starts_at, gc.required_plan_id,
              membership.plan_id AS member_plan_id
       FROM class_sessions cs
       INNER JOIN gym_classes gc ON gc.id = cs.class_id
       LEFT JOIN LATERAL (
         SELECT plan_id FROM memberships
         WHERE gym_id = cs.gym_id AND member_id = $3 AND status = 'active' AND ends_at >= current_date
         ORDER BY ends_at DESC LIMIT 1
       ) membership ON true
       WHERE cs.id = $1 AND cs.gym_id = $2 AND cs.status = 'scheduled' AND cs.starts_at > now()
       FOR UPDATE OF cs`,
      [input.session_id, user.gym_id, user.member_id]
    );
    if (!session.rowCount) {
      await client.query('ROLLBACK');
      return helpers.send(res, 404, { error: 'horario_indisponivel' });
    }
    const item = session.rows[0];
    if (!item.member_plan_id) {
      await client.query('ROLLBACK');
      return helpers.send(res, 403, { error: 'matricula_ativa_obrigatoria' });
    }
    if (item.required_plan_id && item.required_plan_id !== item.member_plan_id) {
      await client.query('ROLLBACK');
      return helpers.send(res, 403, { error: 'aula_nao_incluida_no_plano' });
    }

    const count = await client.query(
      `SELECT count(*)::integer AS total FROM class_reservations
       WHERE session_id = $1 AND status IN ('confirmed','attended')`,
      [input.session_id]
    );
    const status = Number(count.rows[0].total) < item.capacity ? 'confirmed' : 'waitlist';
    const result = await client.query(
      `INSERT INTO class_reservations (gym_id, session_id, member_id, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id, member_id) DO UPDATE SET
         status = EXCLUDED.status, cancelled_at = NULL, updated_at = now()
       RETURNING *`,
      [user.gym_id, input.session_id, user.member_id, status]
    );
    await client.query('COMMIT');
    return helpers.send(res, 200, result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function cancelReservation(req, res, user, helpers) {
  if (!isStudent(user)) return false;
  const input = await helpers.body(req);
  if (!input.session_id) return helpers.send(res, 400, { error: 'session_id_obrigatorio' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = await client.query(
      'SELECT id FROM class_sessions WHERE id = $1 AND gym_id = $2 FOR UPDATE',
      [input.session_id, user.gym_id]
    );
    if (!session.rowCount) {
      await client.query('ROLLBACK');
      return helpers.send(res, 404, { error: 'aula_nao_encontrada' });
    }
    const cancelled = await client.query(
      `UPDATE class_reservations
       SET status = 'cancelled', cancelled_at = now(), updated_at = now()
       WHERE session_id = $1 AND member_id = $2 AND gym_id = $3
         AND status IN ('confirmed','waitlist')
       RETURNING id, status, cancelled_at`,
      [input.session_id, user.member_id, user.gym_id]
    );
    if (!cancelled.rowCount) {
      await client.query('ROLLBACK');
      return helpers.send(res, 404, { error: 'reserva_nao_encontrada' });
    }
    const promoted = await client.query(
      `UPDATE class_reservations SET status = 'confirmed', updated_at = now()
       WHERE id = (
         SELECT id FROM class_reservations
         WHERE session_id = $1 AND status = 'waitlist'
         ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
       )
       RETURNING id, member_id`,
      [input.session_id]
    );
    if (promoted.rowCount) {
      await client.query(
        `INSERT INTO member_notifications (gym_id, member_id, type, title, message, action_route)
         VALUES ($1, $2, 'class', 'Vaga confirmada', 'Uma vaga foi liberada e sua reserva de aula foi confirmada.', '/classes')`,
        [user.gym_id, promoted.rows[0].member_id]
      );
    }
    await client.query('COMMIT');
    return helpers.send(res, 200, { ...cancelled.rows[0], promoted_member_id: promoted.rows[0]?.member_id || null });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function handleStudentClassRoutes(req, res, user, url, helpers) {
  if (!isStudent(user)) return false;
  if (req.method === 'GET' && url.pathname === '/api/student/classes') return studentClasses(res, user, helpers);
  if (req.method === 'POST' && url.pathname === '/api/student/classes/reserve') return reserveClass(req, res, user, helpers);
  if (req.method === 'POST' && url.pathname === '/api/student/classes/cancel') return cancelReservation(req, res, user, helpers);
  return false;
}

module.exports = { handleStudentClassRoutes };
