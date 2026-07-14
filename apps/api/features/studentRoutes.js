const { hashPassword, verifyPassword, signToken, randomToken, hashToken, validatePassword } = require('../lib/security');
const { recordAudit } = require('../lib/audit');
const { sendTransactionalEmail } = require('../lib/mailer');

const ADMIN_DEFAULT_STUDENT_PASSWORD = process.env.ADMIN_DEFAULT_STUDENT_PASSWORD || 'Lobo1234';
const STUDENT_WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function validPhotoSource(value) {
  const text = String(value || '').trim();
  if (text.startsWith('/uploads/')) {
    const relative = text.slice('/uploads/'.length);
    return relative.length <= 240 && /^[A-Za-z0-9._/-]+$/.test(relative) && !relative.split('/').includes('..');
  }
  try {
    return ['http:', 'https:'].includes(new URL(text).protocol);
  } catch (_) {
    return false;
  }
}

function appUrl(path) {
  const base = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_WEB_URL || 'http://192.168.28.10:8084').replace(/\/$/, '');
  return `${base}${path}`;
}

function isStudent(user) {
  return user && user.role === 'student' && user.member_id;
}

function isVisitor(user) {
  return user && user.role === 'visitor' && user.visitor_id;
}

function canManageStudentAccount(user) {
  return user && ['owner', 'admin', 'staff'].includes(user.role);
}

function validStudentVideoSource(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (text.startsWith('/uploads/')) {
    const relative = text.slice('/uploads/'.length);
    return relative.length <= 240 && /^[A-Za-z0-9._/-]+$/.test(relative) && !relative.split('/').includes('..');
  }
  try {
    return ['http:', 'https:'].includes(new URL(text).protocol);
  } catch (_) {
    return false;
  }
}

function studentInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) return fallback;
  return number;
}

function studentText(value, fallback = '', maximum = 2000) {
  return String(value ?? fallback).trim().slice(0, maximum);
}

async function studentCustomDetail(query, user, customPlan) {
  const days = await query(
    'SELECT id, plan_id, weekday, title, notes FROM student_workout_days WHERE gym_id = $1 AND plan_id = $2 ORDER BY weekday',
    [user.gym_id, customPlan.id]
  );
  const exercises = await query(
    `SELECT swe.id, swe.plan_day_id AS workout_day_id, swe.order_index, swe.sets, swe.reps, swe.rest_seconds, swe.notes,
            swe.exercise_library_id, swe.private_exercise_id,
            swd.weekday, swd.title AS day_title,
            COALESCE(el.name, pe.name) AS exercise_name,
            COALESCE(el.muscle_group, pe.muscle_group) AS muscle_group,
            el.muscle_group_primary, el.muscle_group_secondary,
            COALESCE(el.equipment, pe.equipment) AS equipment,
            COALESCE(el.video_url, pe.video_url) AS video_url,
            COALESCE(el.instructions, pe.instructions) AS instructions,
            (swe.private_exercise_id IS NOT NULL) AS is_private
     FROM student_workout_exercises swe
     INNER JOIN student_workout_days swd ON swd.id = swe.plan_day_id
     LEFT JOIN exercise_library el ON el.id = swe.exercise_library_id
     LEFT JOIN student_private_exercises pe ON pe.id = swe.private_exercise_id
     WHERE swe.gym_id = $1 AND swd.plan_id = $2
     ORDER BY swd.weekday, swe.order_index, swe.created_at`,
    [user.gym_id, customPlan.id]
  );
  return {
    plan: { ...customPlan, source: 'student', editable: true },
    days: days.rows,
    exercises: exercises.rows
  };
}

async function handleStudentRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'POST' && url.pathname === '/api/student/auth/login') {
    const input = await body(req);
    const identifier = String(input.identifier || input.email || '').trim();
    const phoneDigits = identifier.replace(/\D/g, '');
    if (!identifier || !input.password) return send(res, 400, { error: 'dados_invalidos' });
    const result = await query(
      `SELECT ma.id, ma.gym_id, ma.member_id, ma.email, ma.secret_hash, ma.is_active, ma.must_change_password,
              m.name AS member_name, m.phone
       FROM member_accounts ma INNER JOIN members m ON m.id = ma.member_id
       WHERE lower(ma.email) = lower($1)
          OR ($2 <> '' AND regexp_replace(COALESCE(m.phone, ''), '[^0-9]', '', 'g') = $2)
       LIMIT 1`,
      [identifier, phoneDigits]
    );
    const account = result.rows[0];
    if (account && account.is_active && verifyPassword(input.password, account.secret_hash)) {
      await query('UPDATE member_accounts SET last_login_at = now(), updated_at = now() WHERE id = $1', [account.id]);
      const token = signToken({ sub: account.id, gym_id: account.gym_id, role: 'student', member_id: account.member_id });
      return send(res, 200, { token, account_type: 'student', must_change_password: Boolean(account.must_change_password), student: { id: account.member_id, name: account.member_name, email: account.email, role: 'student', gym_id: account.gym_id } });
    }

    const visitor = await query(
      `SELECT id, gym_id, name, email, phone, secret_hash, is_active
       FROM visitor_accounts
       WHERE lower(email) = lower($1)
          OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = $2)
       LIMIT 1`,
      [identifier, phoneDigits]
    );
    const visitorAccount = visitor.rows[0];
    if (!visitorAccount || !visitorAccount.is_active || !verifyPassword(input.password, visitorAccount.secret_hash)) return send(res, 401, { error: 'credenciais_invalidas' });
    await query('UPDATE visitor_accounts SET last_login_at = now(), updated_at = now() WHERE id = $1', [visitorAccount.id]);
    const token = signToken({ sub: visitorAccount.id, gym_id: visitorAccount.gym_id, role: 'visitor', visitor_id: visitorAccount.id });
    return send(res, 200, { token, account_type: 'visitor', student: { id: visitorAccount.id, name: visitorAccount.name, email: visitorAccount.email, phone: visitorAccount.phone, role: 'visitor', gym_id: visitorAccount.gym_id } });
  }

  if (req.method === 'POST' && url.pathname === '/api/student/auth/register-visitor') {
    const input = await body(req);
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const phone = String(input.phone || '').trim();
    const passwordCheck = validatePassword(input.password);
    if (name.length < 3 || !/^\S+@\S+\.\S+$/.test(email) || !passwordCheck.valid || input.password !== input.password_confirmation) return send(res, 400, { error: 'dados_invalidos' });
    const duplicate = await query(
      `SELECT 1 FROM users WHERE lower(email) = $1
       UNION ALL SELECT 1 FROM member_accounts WHERE lower(email) = $1
       UNION ALL SELECT 1 FROM visitor_accounts WHERE lower(email) = $1
       LIMIT 1`,
      [email]
    );
    if (duplicate.rowCount) return send(res, 409, { error: 'email_ja_cadastrado' });
    const gym = await query("SELECT id FROM gyms WHERE status = 'active' ORDER BY created_at ASC LIMIT 1");
    if (!gym.rowCount) return send(res, 503, { error: 'academia_indisponivel' });
    const result = await query(
      `INSERT INTO visitor_accounts (gym_id, name, email, phone, secret_hash)
       VALUES ($1, $2, $3, NULLIF($4, ''), $5)
       RETURNING id, gym_id, name, email, phone`,
      [gym.rows[0].id, name, email, phone, hashPassword(input.password)]
    );
    const visitorAccount = result.rows[0];
    const token = signToken({ sub: visitorAccount.id, gym_id: visitorAccount.gym_id, role: 'visitor', visitor_id: visitorAccount.id });
    return send(res, 201, { token, account_type: 'visitor', student: { ...visitorAccount, role: 'visitor' } });
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
      subject: 'Recuperação de acesso - BlueREC Academia',
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
      await query('UPDATE member_accounts SET secret_hash = $2, must_change_password = false, updated_at = now() WHERE id = $1', [token.rows[0].member_account_id, hashPassword(input.new_password)]);
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

  const isPasswordChangeRequest = isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/change-password';
  const isStudentProfileRequest = isStudent(user) && ((req.method === 'GET' && ['/api/student/me', '/api/student/profile'].includes(url.pathname)) || (req.method === 'POST' && url.pathname === '/api/student/profile'));
  if (isStudent(user) && !isPasswordChangeRequest && !isStudentProfileRequest) {
    const accountState = await query('SELECT must_change_password FROM member_accounts WHERE id = $1 AND member_id = $2 AND gym_id = $3 LIMIT 1', [user.sub, user.member_id, user.gym_id]);
    if (accountState.rows[0]?.must_change_password) return send(res, 403, { error: 'troca_senha_obrigatoria' });
  }

  if (req.method === 'POST' && url.pathname === '/api/student/accounts') {
    if (!canManageStudentAccount(user)) return send(res, 403, { error: 'sem_permissao' });
    const input = await body(req);
    if (!input.member_id || !input.email) return send(res, 400, { error: 'dados_invalidos' });
    const member = await query('SELECT id, name FROM members WHERE id = $1 AND gym_id = $2', [input.member_id, user.gym_id]);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    const result = await query(
      `INSERT INTO member_accounts (gym_id, member_id, email, secret_hash, is_active, must_change_password)
       VALUES ($1, $2, lower($3), $4, true, true)
       ON CONFLICT (gym_id, member_id) DO UPDATE SET email = EXCLUDED.email, secret_hash = EXCLUDED.secret_hash, is_active = true, must_change_password = true, updated_at = now()
       RETURNING id, member_id, email, is_active, must_change_password, created_at, updated_at`,
      [user.gym_id, input.member_id, input.email, hashPassword(ADMIN_DEFAULT_STUDENT_PASSWORD)]
    );
    await recordAudit(user, 'upsert', 'member_account', result.rows[0].id, { member_id: input.member_id });
    return send(res, 200, { ...result.rows[0], initial_password: ADMIN_DEFAULT_STUDENT_PASSWORD });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/change-password') {
    const input = await body(req);
    const currentPassword = String(input.current_password || '');
    const newPassword = String(input.new_password || '');
    const passwordCheck = validatePassword(newPassword);
    if (!currentPassword || !passwordCheck.valid || newPassword !== String(input.password_confirmation || '')) {
      return send(res, 400, { error: passwordCheck.error || 'senhas_nao_conferem' });
    }
    const account = await query('SELECT id, secret_hash FROM member_accounts WHERE id = $1 AND member_id = $2 AND gym_id = $3 AND is_active = true LIMIT 1', [user.sub, user.member_id, user.gym_id]);
    if (!account.rowCount || !verifyPassword(currentPassword, account.rows[0].secret_hash)) return send(res, 401, { error: 'senha_atual_invalida' });
    await query('UPDATE member_accounts SET secret_hash = $2, must_change_password = false, updated_at = now() WHERE id = $1', [user.sub, hashPassword(newPassword)]);
    return send(res, 200, { status: 'senha_atualizada' });
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/me') {
    const result = await query(
      'SELECT m.id, m.name, m.email, m.phone, m.status, ma.email AS account_email, ma.must_change_password FROM members m INNER JOIN member_accounts ma ON ma.member_id = m.id WHERE m.id = $1 AND m.gym_id = $2 LIMIT 1',
      [user.member_id, user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/profile') {
    const result = await query(
      `SELECT m.id, m.name, m.email, m.phone, m.phone_country_code, m.cpf, m.rg, m.birth_date,
              m.address, m.postal_code, m.street, m.address_number, m.address_complement,
              m.neighborhood, m.city, m.state, m.country, m.objective, m.allergies, m.notes,
              ma.email AS account_email
       FROM members m INNER JOIN member_accounts ma ON ma.member_id = m.id
       WHERE m.id = $1 AND m.gym_id = $2 AND ma.id = $3 LIMIT 1`,
      [user.member_id, user.gym_id, user.sub]
    );
    if (!result.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/profile') {
    const input = await body(req);
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    if (!name || name.length > 160) return send(res, 400, { error: 'nome_invalido' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) return send(res, 400, { error: 'email_invalido' });
    const duplicate = await query('SELECT id FROM member_accounts WHERE lower(email) = lower($1) AND id <> $2 LIMIT 1', [email, user.sub]);
    if (duplicate.rowCount) return send(res, 409, { error: 'email_ja_cadastrado' });
    const result = await query(
      `UPDATE members SET name = $3, email = $4, phone = $5, phone_country_code = $6,
       cpf = $7, rg = $8, birth_date = $9, address = $10, postal_code = $11,
       street = $12, address_number = $13, address_complement = $14, neighborhood = $15,
       city = $16, state = $17, country = $18, objective = $19, allergies = $20, notes = $21,
       updated_at = now()
       WHERE id = $1 AND gym_id = $2
       RETURNING id, name, email, phone, phone_country_code, cpf, rg, birth_date,
                 address, postal_code, street, address_number, address_complement,
                 neighborhood, city, state, country, objective, allergies, notes`,
      [user.member_id, user.gym_id, name, email, String(input.phone || '').trim() || null,
        String(input.phone_country_code || '+55').trim(), String(input.cpf || '').trim() || null,
        String(input.rg || '').trim() || null, input.birth_date || null, String(input.address || '').trim() || null,
        String(input.postal_code || '').trim() || null, String(input.street || '').trim() || null,
        String(input.address_number || '').trim() || null, String(input.address_complement || '').trim() || null,
        String(input.neighborhood || '').trim() || null, String(input.city || '').trim() || null,
        String(input.state || '').trim() || null, String(input.country || 'Brasil').trim() || 'Brasil',
        String(input.objective || '').slice(0, 5000) || null, String(input.allergies || '').slice(0, 5000) || null,
        String(input.notes || '').slice(0, 5000) || null]
    );
    if (!result.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    await query('UPDATE member_accounts SET email = $2, updated_at = now() WHERE id = $1 AND member_id = $3 AND gym_id = $4', [user.sub, email, user.member_id, user.gym_id]);
    return send(res, 200, result.rows[0]);
  }

  if (isVisitor(user) && req.method === 'GET' && url.pathname === '/api/student/visitor/me') {
    const result = await query('SELECT id, name, email, phone, created_at FROM visitor_accounts WHERE id = $1 AND gym_id = $2 AND is_active = true LIMIT 1', [user.visitor_id, user.gym_id]);
    if (!result.rowCount) return send(res, 404, { error: 'conta_nao_encontrada' });
    return send(res, 200, { ...result.rows[0], role: 'visitor', account_type: 'visitor' });
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/progress') {
    const assessments = await query('SELECT * FROM member_assessments WHERE gym_id = $1 AND member_id = $2 ORDER BY assessment_date DESC, created_at DESC LIMIT 20', [user.gym_id, user.member_id]);
    const goals = await query('SELECT * FROM member_goals WHERE gym_id = $1 AND member_id = $2 ORDER BY status, target_date NULLS LAST, created_at DESC LIMIT 20', [user.gym_id, user.member_id]);
    return send(res, 200, { assessments: assessments.rows, goals: goals.rows });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/progress/photos') {
    const input = await body(req);
    const photoUrl = String(input.photo_url || '').trim();
    if (!photoUrl || photoUrl.length > 1000 || !validPhotoSource(photoUrl)) return send(res, 400, { error: 'foto_invalida' });
    const result = await query(
      `INSERT INTO member_assessments (gym_id, member_id, assessment_date, photo_url, notes)
       VALUES ($1, $2, COALESCE($3::date, current_date), $4, $5)
       RETURNING id, assessment_date, photo_url, notes, created_at`,
      [user.gym_id, user.member_id, input.assessment_date || null, photoUrl, String(input.notes || '').trim() || null]
    );
    return send(res, 201, result.rows[0]);
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/training/catalog') {
    const [publicExercises, privateExercises] = await Promise.all([
      query(
        `SELECT id, name, muscle_group, muscle_group_primary, muscle_group_secondary, equipment, level, instructions, video_url
         FROM exercise_library WHERE gym_id = $1 AND is_active = true
         ORDER BY muscle_group_primary NULLS LAST, muscle_group, name`,
        [user.gym_id]
      ),
      query(
        `SELECT id, name, muscle_group, equipment, instructions, video_url
         FROM student_private_exercises WHERE gym_id = $1 AND member_id = $2 AND is_active = true
         ORDER BY name`,
        [user.gym_id, user.member_id]
      )
    ]);
    return send(res, 200, { public: publicExercises.rows, private: privateExercises.rows });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/custom/plan') {
    const input = await body(req);
    const existing = await query(
      `SELECT id, member_id, name, goal, status, created_at, updated_at
       FROM student_workout_plans WHERE gym_id = $1 AND member_id = $2 AND status = 'active' LIMIT 1`,
      [user.gym_id, user.member_id]
    );
    if (existing.rowCount) return send(res, 200, await studentCustomDetail(query, user, existing.rows[0]));

    const basePlan = await query(
      `SELECT id, name, goal FROM workout_plans
       WHERE gym_id = $1 AND member_id = $2 AND status = 'active'
       ORDER BY starts_at DESC, created_at DESC LIMIT 1`,
      [user.gym_id, user.member_id]
    );
    const custom = await query(
      `INSERT INTO student_workout_plans (gym_id, member_id, name, goal)
       VALUES ($1, $2, $3, $4)
       RETURNING id, member_id, name, goal, status, created_at, updated_at`,
      [user.gym_id, user.member_id, studentText(input.name, basePlan.rows[0]?.name || 'Minha ficha', 160), studentText(input.goal, basePlan.rows[0]?.goal || '', 500) || null]
    );
    const customPlan = custom.rows[0];
    for (let weekday = 1; weekday <= 7; weekday += 1) {
      await query(
        `INSERT INTO student_workout_days (gym_id, plan_id, weekday, title)
         VALUES ($1, $2, $3, $4) ON CONFLICT (plan_id, weekday) DO NOTHING`,
        [user.gym_id, customPlan.id, weekday, STUDENT_WEEKDAYS[weekday - 1]]
      );
    }

    if (basePlan.rowCount && input.clone_current !== false) {
      const baseDays = await query('SELECT id, weekday, title, notes FROM workout_days WHERE gym_id = $1 AND plan_id = $2 ORDER BY weekday', [user.gym_id, basePlan.rows[0].id]);
      for (const day of baseDays.rows) {
        await query(
          `UPDATE student_workout_days SET title = $3, notes = $4, updated_at = now()
           WHERE gym_id = $1 AND plan_id = $2 AND weekday = $5`,
          [user.gym_id, customPlan.id, studentText(day.title, STUDENT_WEEKDAYS[day.weekday - 1], 120), studentText(day.notes, '', 2000) || null, day.weekday]
        );
      }
      const baseExercises = await query(
        `SELECT we.exercise_id, wd.weekday, we.order_index, we.sets, we.reps, we.rest_seconds, we.notes
         FROM workout_exercises we INNER JOIN workout_days wd ON wd.id = we.workout_day_id
         WHERE we.gym_id = $1 AND wd.plan_id = $2 ORDER BY wd.weekday, we.order_index`,
        [user.gym_id, basePlan.rows[0].id]
      );
      for (const exercise of baseExercises.rows) {
        const day = await query('SELECT id FROM student_workout_days WHERE gym_id = $1 AND plan_id = $2 AND weekday = $3 LIMIT 1', [user.gym_id, customPlan.id, exercise.weekday]);
        if (!day.rowCount) continue;
        await query(
          `INSERT INTO student_workout_exercises
             (gym_id, plan_day_id, exercise_library_id, order_index, sets, reps, rest_seconds, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [user.gym_id, day.rows[0].id, exercise.exercise_id, studentInteger(exercise.order_index, 1, 1, 999), studentInteger(exercise.sets, 3, 1, 30), studentText(exercise.reps, '10-12', 60), studentInteger(exercise.rest_seconds, 60, 0, 3600), studentText(exercise.notes, '', 2000) || null]
        );
      }
    }
    await recordAudit(user, 'create', 'student_workout_plan', customPlan.id, { member_id: user.member_id });
    return send(res, 201, await studentCustomDetail(query, user, customPlan));
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/custom/day') {
    const input = await body(req);
    const weekday = studentInteger(input.weekday, null, 1, 7);
    if (!input.plan_id || !weekday) return send(res, 400, { error: 'dados_invalidos' });
    const ownsPlan = await query("SELECT id FROM student_workout_plans WHERE id = $1 AND gym_id = $2 AND member_id = $3 AND status = 'active' LIMIT 1", [input.plan_id, user.gym_id, user.member_id]);
    if (!ownsPlan.rowCount) return send(res, 404, { error: 'ficha_personalizada_nao_encontrada' });
    const result = await query(
      `INSERT INTO student_workout_days (gym_id, plan_id, weekday, title, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (plan_id, weekday) DO UPDATE SET title = EXCLUDED.title, notes = EXCLUDED.notes, updated_at = now()
       RETURNING id, plan_id, weekday, title, notes`,
      [user.gym_id, input.plan_id, weekday, studentText(input.title, STUDENT_WEEKDAYS[weekday - 1], 120) || STUDENT_WEEKDAYS[weekday - 1], studentText(input.notes, '', 2000) || null]
    );
    return send(res, 200, result.rows[0]);
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/custom/private-exercise') {
    const input = await body(req);
    const name = studentText(input.name, '', 120);
    const videoUrl = studentText(input.video_url, '', 1000);
    if (name.length < 2 || !validStudentVideoSource(videoUrl)) return send(res, 400, { error: 'exercicio_invalido' });
    const duplicate = await query('SELECT id FROM student_private_exercises WHERE gym_id = $1 AND member_id = $2 AND lower(name) = lower($3) LIMIT 1', [user.gym_id, user.member_id, name]);
    if (duplicate.rowCount) return send(res, 409, { error: 'exercicio_privado_ja_cadastrado' });
    const result = await query(
      `INSERT INTO student_private_exercises (gym_id, member_id, name, muscle_group, equipment, instructions, video_url)
       VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''))
       RETURNING id, name, muscle_group, equipment, instructions, video_url`,
      [user.gym_id, user.member_id, name, studentText(input.muscle_group, 'Personalizado', 120), studentText(input.equipment, '', 120) || null, studentText(input.instructions, '', 2000) || null, videoUrl]
    );
    return send(res, 201, result.rows[0]);
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/custom/exercise') {
    const input = await body(req);
    if (!input.plan_day_id || (!input.exercise_id && !input.private_exercise_id)) return send(res, 400, { error: 'dados_invalidos' });
    const day = await query(
      `SELECT swd.id FROM student_workout_days swd INNER JOIN student_workout_plans swp ON swp.id = swd.plan_id
       WHERE swd.id = $1 AND swd.gym_id = $2 AND swp.member_id = $3 AND swp.status = 'active' LIMIT 1`,
      [input.plan_day_id, user.gym_id, user.member_id]
    );
    if (!day.rowCount) return send(res, 404, { error: 'dia_nao_encontrado' });
    let publicId = null;
    let privateId = null;
    if (input.private_exercise_id) {
      const privateExercise = await query('SELECT id FROM student_private_exercises WHERE id = $1 AND gym_id = $2 AND member_id = $3 AND is_active = true LIMIT 1', [input.private_exercise_id, user.gym_id, user.member_id]);
      if (!privateExercise.rowCount) return send(res, 404, { error: 'exercicio_privado_nao_encontrado' });
      privateId = privateExercise.rows[0].id;
    } else {
      const publicExercise = await query('SELECT id FROM exercise_library WHERE id = $1 AND gym_id = $2 AND is_active = true LIMIT 1', [input.exercise_id, user.gym_id]);
      if (!publicExercise.rowCount) return send(res, 404, { error: 'exercicio_nao_encontrado' });
      publicId = publicExercise.rows[0].id;
    }
    const order = await query('SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM student_workout_exercises WHERE gym_id = $1 AND plan_day_id = $2', [user.gym_id, input.plan_day_id]);
    const result = await query(
      `INSERT INTO student_workout_exercises
         (gym_id, plan_day_id, exercise_library_id, private_exercise_id, order_index, sets, reps, rest_seconds, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, plan_day_id, exercise_library_id, private_exercise_id, order_index, sets, reps, rest_seconds, notes`,
      [user.gym_id, input.plan_day_id, publicId, privateId, Number(order.rows[0]?.next_order || 1), studentInteger(input.sets, 3, 1, 30), studentText(input.reps, '10-12', 60) || '10-12', studentInteger(input.rest_seconds, 60, 0, 3600), studentText(input.notes, '', 2000) || null]
    );
    return send(res, 201, result.rows[0]);
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/custom/exercise/update') {
    const input = await body(req);
    if (!input.id) return send(res, 400, { error: 'exercicio_id_obrigatorio' });
    const result = await query(
      `UPDATE student_workout_exercises swe SET sets = $3, reps = $4, rest_seconds = $5, notes = $6, updated_at = now()
       FROM student_workout_days swd INNER JOIN student_workout_plans swp ON swp.id = swd.plan_id
       WHERE swe.id = $1 AND swe.plan_day_id = swd.id AND swe.gym_id = $2 AND swp.member_id = $7 AND swp.status = 'active'
       RETURNING swe.id, swe.plan_day_id, swe.sets, swe.reps, swe.rest_seconds, swe.notes`,
      [input.id, user.gym_id, studentInteger(input.sets, 3, 1, 30), studentText(input.reps, '10-12', 60) || '10-12', studentInteger(input.rest_seconds, 60, 0, 3600), studentText(input.notes, '', 2000) || null, user.member_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'exercicio_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/custom/exercise/delete') {
    const input = await body(req);
    if (!input.id) return send(res, 400, { error: 'exercicio_id_obrigatorio' });
    const result = await query(
      `DELETE FROM student_workout_exercises swe USING student_workout_days swd, student_workout_plans swp
       WHERE swe.id = $1 AND swe.plan_day_id = swd.id AND swd.plan_id = swp.id AND swe.gym_id = $2 AND swp.member_id = $3 AND swp.status = 'active'
       RETURNING swe.id`,
      [input.id, user.gym_id, user.member_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'exercicio_nao_encontrado' });
    return send(res, 200, { status: 'exercicio_removido' });
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/training/current') {
    const customPlan = await query(
      `SELECT id, member_id, name, goal, status, created_at, updated_at
       FROM student_workout_plans WHERE gym_id = $1 AND member_id = $2 AND status = 'active' LIMIT 1`,
      [user.gym_id, user.member_id]
    );
    if (customPlan.rowCount) return send(res, 200, await studentCustomDetail(query, user, customPlan.rows[0]));
    const plan = await query(
      `SELECT wp.id, wp.member_id, wp.name, wp.level, wp.goal, wp.status, wp.starts_at, current_date - wp.starts_at AS age_days
       FROM workout_plans wp WHERE wp.gym_id = $1 AND wp.member_id = $2 AND wp.status = 'active'
       ORDER BY wp.starts_at DESC LIMIT 1`,
      [user.gym_id, user.member_id]
    );
    if (!plan.rowCount) return send(res, 404, { error: 'ficha_nao_encontrada' });
    const exercises = await query(
      `SELECT we.id, we.sets, we.reps, we.rest_seconds, we.load_hint, we.notes, wd.id AS workout_day_id, wd.weekday, wd.title AS day_title, e.name AS exercise_name, e.muscle_group, e.muscle_group_primary, e.muscle_group_secondary, e.equipment, e.video_url, e.instructions
       FROM workout_exercises we
       INNER JOIN workout_days wd ON wd.id = we.workout_day_id
       INNER JOIN exercise_library e ON e.id = we.exercise_id
       WHERE we.gym_id = $1 AND wd.plan_id = $2
       ORDER BY wd.weekday, we.order_index`,
      [user.gym_id, plan.rows[0].id]
    );
    const days = await query('SELECT id, plan_id, weekday, title, notes FROM workout_days WHERE gym_id = $1 AND plan_id = $2 ORDER BY weekday', [user.gym_id, plan.rows[0].id]);
    return send(res, 200, { plan: { ...plan.rows[0], source: 'admin', editable: false }, days: days.rows, exercises: exercises.rows });
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/training/logs') {
    const result = await query(
      `SELECT l.id, l.plan_id, p.name AS plan_name, l.workout_day_id, d.title AS day_title, l.status, l.feedback, l.perceived_effort, l.completed_at
       FROM workout_day_logs l
       INNER JOIN workout_plans p ON p.id = l.plan_id
       INNER JOIN workout_days d ON d.id = l.workout_day_id
       WHERE l.gym_id = $1 AND l.member_id = $2
       UNION ALL
       SELECT sl.id, sl.plan_id, sp.name AS plan_name, sl.plan_day_id AS workout_day_id, sd.title AS day_title, sl.status, sl.feedback, sl.perceived_effort, sl.completed_at
       FROM student_workout_day_logs sl
       INNER JOIN student_workout_plans sp ON sp.id = sl.plan_id
       INNER JOIN student_workout_days sd ON sd.id = sl.plan_day_id
       WHERE sl.gym_id = $1 AND sl.member_id = $2
       ORDER BY completed_at DESC LIMIT 50`,
      [user.gym_id, user.member_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/complete') {
    const input = await body(req);
    if (!input.plan_id || !input.workout_day_id) return send(res, 400, { error: 'dados_invalidos' });
    const customValid = await query(
      `SELECT sd.id FROM student_workout_days sd INNER JOIN student_workout_plans sp ON sp.id = sd.plan_id
       WHERE sd.id = $1 AND sd.gym_id = $2 AND sp.id = $3 AND sp.member_id = $4 AND sp.status = 'active' LIMIT 1`,
      [input.workout_day_id, user.gym_id, input.plan_id, user.member_id]
    );
    if (customValid.rowCount) {
      const result = await query(
        `INSERT INTO student_workout_day_logs (gym_id, member_id, plan_id, plan_day_id, status, feedback, perceived_effort)
         VALUES ($1, $2, $3, $4, 'completed', $5, $6)
         RETURNING id, member_id, plan_id, plan_day_id AS workout_day_id, status, feedback, perceived_effort, completed_at`,
        [user.gym_id, user.member_id, input.plan_id, input.workout_day_id, studentText(input.feedback, '', 2000) || null, input.perceived_effort == null ? null : studentInteger(input.perceived_effort, null, 1, 10)]
      );
      return send(res, 201, result.rows[0]);
    }
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
