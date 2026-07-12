const { hashPassword, verifyPassword, signToken, randomToken, hashToken, validatePassword } = require('../lib/security');
const { recordAudit } = require('../lib/audit');
const { sendTransactionalEmail } = require('../lib/mailer');

function appUrl(path) {
  const base = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_WEB_URL || 'http://192.168.3.200:8084').replace(/\/$/, '');
  return `${base}${path}`;
}

function isStudent(user) {
  return user && user.role === 'student' && user.member_id;
}

function canManageStudentAccount(user) {
  return user && ['owner', 'admin', 'staff'].includes(user.role);
}

async function handleStudentRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'POST' && url.pathname === '/api/student/auth/login') {
    const input = await body(req);
    const identifier = String(input.identifier || input.email || '').trim();
    const phoneDigits = identifier.replace(/\D/g, '');
    if (!identifier || !input.password) return send(res, 400, { error: 'dados_invalidos' });
    const result = await query(
      `SELECT ma.id, ma.gym_id, ma.member_id, ma.email, ma.secret_hash, ma.is_active,
              m.name AS member_name, m.phone
       FROM member_accounts ma INNER JOIN members m ON m.id = ma.member_id
       WHERE lower(ma.email) = lower($1)
          OR ($2 <> '' AND regexp_replace(COALESCE(m.phone, ''), '[^0-9]', '', 'g') = $2)
       LIMIT 1`,
      [identifier, phoneDigits]
    );
    const account = result.rows[0];
    if (!account || !account.is_active || !verifyPassword(input.password, account.secret_hash)) return send(res, 401, { error: 'credenciais_invalidas' });
    await query('UPDATE member_accounts SET last_login_at = now(), updated_at = now() WHERE id = $1', [account.id]);
    const token = signToken({ sub: account.id, gym_id: account.gym_id, role: 'student', member_id: account.member_id });
    return send(res, 200, { token, student: { id: account.member_id, name: account.member_name, email: account.email, role: 'student', gym_id: account.gym_id } });
  }

  if (req.method === 'POST' && url.pathname === '/api/student/auth/forgot-password') {
    const input = await body(req);
    const identifier = String(input.identifier || input.email || '').trim();
    const phoneDigits = identifier.replace(/\D/g, '');
    const generic = { status: 'recovery_requested', message: 'Se os dados estiverem cadastrados, enviaremos as instruções para o e-mail da conta.' };
    if (!identifier) return send(res, 202, generic);
    const account = await query(
      `SELECT ma.id, ma.email, ma.member_id
       FROM member_accounts ma INNER JOIN members m ON m.id = ma.member_id
       WHERE ma.is_active = true
         AND (lower(ma.email) = lower($1)
              OR ($2 <> '' AND regexp_replace(COALESCE(m.phone, ''), '[^0-9]', '', 'g') = $2))
       LIMIT 1`,
      [identifier, phoneDigits]
    );
    if (!account.rowCount) return send(res, 202, generic);
    const token = randomToken();
    await query('UPDATE member_password_reset_tokens SET used_at = now() WHERE member_account_id = $1 AND used_at IS NULL', [account.rows[0].id]);
    await query(
      `INSERT INTO member_password_reset_tokens (member_account_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '30 minutes')`,
      [account.rows[0].id, hashToken(token)]
    );
    const resetUrl = appUrl(`/student-reset.html?token=${encodeURIComponent(token)}`);
    await sendTransactionalEmail({
      to: account.rows[0].email,
      subject: 'Recuperação de acesso - Academia Lobo',
      text: `Use este link para criar uma nova senha: ${resetUrl}`,
      html: `<p>Recebemos um pedido para redefinir sua senha.</p><p><a href="${resetUrl}">Criar nova senha</a></p><p>O link expira em 30 minutos.</p>`
    });
    return send(res, 202, generic);
  }

  if (req.method === 'POST' && url.pathname === '/api/student/auth/reset-password') {
    const input = await body(req);
    const passwordCheck = validatePassword(input.new_password);
    if (!input.token || !passwordCheck.valid) return send(res, 400, { error: passwordCheck.error || 'token_invalido' });
    const token = await query(
      `SELECT id, member_account_id FROM member_password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() LIMIT 1`,
      [hashToken(input.token)]
    );
    if (token.rowCount) {
      await query('UPDATE member_accounts SET secret_hash = $2, updated_at = now() WHERE id = $1', [token.rows[0].member_account_id, hashPassword(input.new_password)]);
      await query('UPDATE member_password_reset_tokens SET used_at = now() WHERE id = $1', [token.rows[0].id]);
      return send(res, 200, { status: 'senha_redefinida' });
    }
    const staffToken = await query(
      `SELECT id, user_id FROM user_password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() LIMIT 1`,
      [hashToken(input.token)]
    );
    if (!staffToken.rowCount) return send(res, 400, { error: 'token_invalido_ou_expirado' });
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [staffToken.rows[0].user_id, hashPassword(input.new_password)]);
    await query('UPDATE user_password_reset_tokens SET used_at = now() WHERE id = $1', [staffToken.rows[0].id]);
    return send(res, 200, { status: 'senha_redefinida' });
  }

  if (!url.pathname.startsWith('/api/student')) return false;
  if (!user) return send(res, 401, { error: 'nao_autorizado' });

  if (req.method === 'POST' && url.pathname === '/api/student/accounts') {
    if (!canManageStudentAccount(user)) return send(res, 403, { error: 'sem_permissao' });
    const input = await body(req);
    const accessKey = input.password || input.secret || input.access_key;
    if (!input.member_id || !input.email || !accessKey) return send(res, 400, { error: 'dados_invalidos' });
    const member = await query('SELECT id, name FROM members WHERE id = $1 AND gym_id = $2', [input.member_id, user.gym_id]);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    const result = await query(
      `INSERT INTO member_accounts (gym_id, member_id, email, secret_hash, is_active)
       VALUES ($1, $2, lower($3), $4, true)
       ON CONFLICT (gym_id, member_id) DO UPDATE SET email = EXCLUDED.email, secret_hash = EXCLUDED.secret_hash, is_active = true, updated_at = now()
       RETURNING id, member_id, email, is_active, created_at, updated_at`,
      [user.gym_id, input.member_id, input.email, hashPassword(accessKey)]
    );
    await recordAudit(user, 'upsert', 'member_account', result.rows[0].id, { member_id: input.member_id });
    return send(res, 200, result.rows[0]);
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/me') {
    const result = await query(
      'SELECT m.id, m.name, m.email, m.phone, m.status, ma.email AS account_email FROM members m INNER JOIN member_accounts ma ON ma.member_id = m.id WHERE m.id = $1 AND m.gym_id = $2 LIMIT 1',
      [user.member_id, user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/progress') {
    const assessments = await query('SELECT * FROM member_assessments WHERE gym_id = $1 AND member_id = $2 ORDER BY assessment_date DESC, created_at DESC LIMIT 20', [user.gym_id, user.member_id]);
    const goals = await query('SELECT * FROM member_goals WHERE gym_id = $1 AND member_id = $2 ORDER BY status, target_date NULLS LAST, created_at DESC LIMIT 20', [user.gym_id, user.member_id]);
    return send(res, 200, { assessments: assessments.rows, goals: goals.rows });
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/training/current') {
    const plan = await query(
      `SELECT wp.id, wp.member_id, wp.name, wp.level, wp.goal, wp.status, wp.starts_at, current_date - wp.starts_at AS age_days
       FROM workout_plans wp WHERE wp.gym_id = $1 AND wp.member_id = $2 AND wp.status = 'active'
       ORDER BY wp.starts_at DESC LIMIT 1`,
      [user.gym_id, user.member_id]
    );
    if (!plan.rowCount) return send(res, 404, { error: 'ficha_nao_encontrada' });
    const exercises = await query(
      `SELECT we.id, we.sets, we.reps, we.rest_seconds, we.load_hint, we.notes, wd.id AS workout_day_id, wd.weekday, wd.title AS day_title, e.name AS exercise_name, e.muscle_group, e.video_url, e.instructions
       FROM workout_exercises we
       INNER JOIN workout_days wd ON wd.id = we.workout_day_id
       INNER JOIN exercise_library e ON e.id = we.exercise_id
       WHERE we.gym_id = $1 AND wd.plan_id = $2
       ORDER BY wd.weekday, we.order_index`,
      [user.gym_id, plan.rows[0].id]
    );
    return send(res, 200, { plan: plan.rows[0], exercises: exercises.rows });
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/training/logs') {
    const result = await query(
      `SELECT l.id, l.plan_id, p.name AS plan_name, l.workout_day_id, d.title AS day_title, l.status, l.feedback, l.perceived_effort, l.completed_at
       FROM workout_day_logs l
       INNER JOIN workout_plans p ON p.id = l.plan_id
       INNER JOIN workout_days d ON d.id = l.workout_day_id
       WHERE l.gym_id = $1 AND l.member_id = $2 ORDER BY l.completed_at DESC LIMIT 50`,
      [user.gym_id, user.member_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/complete') {
    const input = await body(req);
    if (!input.plan_id || !input.workout_day_id) return send(res, 400, { error: 'dados_invalidos' });
    const valid = await query(
      `SELECT wd.id FROM workout_days wd INNER JOIN workout_plans wp ON wp.id = wd.plan_id
       WHERE wd.id = $1 AND wd.gym_id = $2 AND wp.id = $3 AND wp.member_id = $4`,
      [input.workout_day_id, user.gym_id, input.plan_id, user.member_id]
    );
    if (!valid.rowCount) return send(res, 404, { error: 'treino_nao_encontrado' });
    const result = await query(
      `INSERT INTO workout_day_logs (gym_id, member_id, plan_id, workout_day_id, status, feedback, perceived_effort)
       VALUES ($1, $2, $3, $4, 'completed', $5, $6)
       RETURNING id, member_id, plan_id, workout_day_id, status, feedback, perceived_effort, completed_at`,
      [user.gym_id, user.member_id, input.plan_id, input.workout_day_id, input.feedback || null, input.perceived_effort == null ? null : Number(input.perceived_effort)]
    );
    return send(res, 201, result.rows[0]);
  }

  return false;
}

module.exports = { handleStudentRoutes };
