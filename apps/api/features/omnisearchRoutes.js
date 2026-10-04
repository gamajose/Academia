async function handleOmnisearchRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;
  if (!user?.gym_id) return false;

  if (req.method === 'GET' && url.pathname === '/api/admin/omnisearch') {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) {
      return send(res, 200, { members: [], exercises: [], plans: [] });
    }

    const pattern = `%${q}%`;
    const prefix = `${q}%`;

    const [members, exercises, plans] = await Promise.all([
      query(
        `SELECT id, name, email, phone, status, created_at
         FROM members
         WHERE gym_id = $1 AND (name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)
         ORDER BY (name ILIKE $3) DESC, name ASC
         LIMIT 8`,
        [user.gym_id, pattern, prefix]
      ),
      query(
        `SELECT id, name, muscle_group, muscle_group_primary, equipment, is_active
         FROM exercise_library
         WHERE (gym_id = $1 OR gym_id IS NULL) AND is_active = true AND (name ILIKE $2 OR muscle_group ILIKE $2 OR muscle_group_primary ILIKE $2)
         ORDER BY (name ILIKE $3) DESC, name ASC
         LIMIT 6`,
        [user.gym_id, pattern, prefix]
      ),
      query(
        `SELECT id, name, price_cents, duration_days, is_active
         FROM plans
         WHERE gym_id = $1 AND name ILIKE $2
         ORDER BY name ASC
         LIMIT 5`,
        [user.gym_id, pattern]
      )
    ]);

    return send(res, 200, {
      members: members.rows,
      exercises: exercises.rows,
      plans: plans.rows
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard/cockpit') {
    const [weekAttendance, recentList, churnRisk] = await Promise.all([
      query(
        `SELECT
           to_char(d.day, 'YYYY-MM-DD') AS date,
           extract(isodow from d.day)::int AS weekday_num,
           to_char(d.day, 'Dy') AS weekday_name,
           COUNT(c.id)::int AS count
         FROM generate_series(
           date_trunc('week', current_date),
           date_trunc('week', current_date) + interval '6 days',
           interval '1 day'
         ) d(day)
         LEFT JOIN checkins c ON c.gym_id = $1 AND c.checked_at::date = d.day::date
         GROUP BY d.day
         ORDER BY d.day ASC`,
        [user.gym_id]
      ),
      query(
        `SELECT c.id, c.checked_at, c.source, m.id AS member_id, m.name AS member_name, m.phone AS member_phone
         FROM checkins c
         INNER JOIN members m ON m.id = c.member_id
         WHERE c.gym_id = $1
         ORDER BY c.checked_at DESC
         LIMIT 8`,
        [user.gym_id]
      ),
      query(
        `SELECT m.id, m.name, m.phone, m.email,
           COALESCE(current_date - MAX(c.checked_at)::date, current_date - m.created_at::date) AS days_absent
         FROM members m
         LEFT JOIN checkins c ON c.gym_id = m.gym_id AND c.member_id = m.id
         WHERE m.gym_id = $1 AND m.status = 'active'
         GROUP BY m.id, m.name, m.phone, m.email, m.created_at
         HAVING (MAX(c.checked_at) IS NULL AND current_date - m.created_at::date >= 10)
             OR (MAX(c.checked_at) <= current_date - 10)
         ORDER BY days_absent DESC
         LIMIT 5`,
        [user.gym_id]
      )
    ]);

    return send(res, 200, {
      week_attendance: weekAttendance.rows,
      recent_checkins: recentList.rows,
      churn_risk: churnRisk.rows
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/checkins/quick') {
    const input = await body(req);
    const search = String(input.query || input.member_id || '').trim();
    if (!search) return send(res, 400, { error: 'informe_aluno' });

    let memberQuery;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
    if (isUuid) {
      memberQuery = await query('SELECT id, name, status, phone FROM members WHERE id = $1 AND gym_id = $2', [search, user.gym_id]);
    } else {
      memberQuery = await query(
        `SELECT id, name, status, phone FROM members
         WHERE gym_id = $1 AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
         ORDER BY (name ILIKE $3) DESC, name ASC LIMIT 1`,
        [user.gym_id, `%${search}%`, `${search}%`]
      );
    }

    if (!memberQuery.rowCount) {
      return send(res, 404, { error: 'aluno_nao_encontrado' });
    }

    const member = memberQuery.rows[0];
    if (member.status !== 'active') {
      return send(res, 400, {
        error: 'aluno_inativo',
        message: `Aluno(a) ${member.name} está com status "${member.status}". Verifique a matrícula antes de liberar o acesso.`
      });
    }

    const checkin = await query(
      'INSERT INTO checkins (gym_id, member_id, source, created_by) VALUES ($1, $2, $3, $4) RETURNING id, member_id, checked_at, source',
      [user.gym_id, member.id, input.source || 'quick_reception', user.sub]
    );

    return send(res, 201, {
      member,
      checkin: checkin.rows[0],
      message: `Presença de ${member.name} confirmada!`
    });
  }

  return false;
}

module.exports = { handleOmnisearchRoutes };
