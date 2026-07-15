const { hashPassword, verifyPassword, signToken, randomToken, hashToken, validatePassword } = require('../lib/security');
const { recordAudit } = require('../lib/audit');
const { sendTransactionalEmail } = require('../lib/mailer');
const { pool } = require('../lib/db');
const { buildProgressAnalysis } = require('../lib/progressAnalysis');

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

function studentNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function studentText(value, fallback = '', maximum = 2000) {
  return String(value ?? fallback).trim().slice(0, maximum);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function validSocialTheme(value) {
  return ['light', 'dark', 'system'].includes(String(value || ''));
}

function validSocialMediaType(value) {
  return ['image', 'video', 'link'].includes(String(value || ''));
}

async function socialProfileDetail(query, user, memberId) {
  const result = await query(
    `SELECT m.id, m.name, m.status,
            COALESCE(sp.bio, '') AS bio,
            COALESCE(sp.website_url, '') AS website_url,
            COALESCE(sp.profile_photo_url, '') AS profile_photo_url,
            COALESCE(sp.is_private, false) AS is_private,
            COALESCE(sp.weight_unit, 'kg') AS weight_unit,
            COALESCE(sp.distance_unit, 'km') AS distance_unit,
            COALESCE(sp.theme, 'light') AS theme,
            COALESCE(sp.language, 'pt-BR') AS language,
            (SELECT count(*) FROM student_social_posts p WHERE p.gym_id = $1 AND p.member_id = m.id AND p.is_active = true) AS posts_count,
            (SELECT count(*) FROM student_social_follows f WHERE f.gym_id = $1 AND f.following_member_id = m.id AND f.status = 'accepted') AS followers_count,
            (SELECT count(*) FROM student_social_follows f WHERE f.gym_id = $1 AND f.follower_member_id = m.id AND f.status = 'accepted') AS following_count,
            EXISTS (SELECT 1 FROM student_social_follows f WHERE f.gym_id = $1 AND f.follower_member_id = $2 AND f.following_member_id = m.id AND f.status = 'accepted') AS viewer_follows,
            (SELECT f.status FROM student_social_follows f WHERE f.gym_id = $1 AND f.follower_member_id = $2 AND f.following_member_id = m.id LIMIT 1) AS viewer_follow_status
     FROM members m
     LEFT JOIN student_social_profiles sp ON sp.gym_id = m.gym_id AND sp.member_id = m.id
     WHERE m.gym_id = $1 AND m.id = $3 AND m.status = 'active'
     LIMIT 1`,
    [user.gym_id, user.member_id, memberId]
  );
  if (!result.rowCount) return null;
  const profile = result.rows[0];
  const canViewPrivate = String(memberId) === String(user.member_id) || profile.viewer_follows;
  if (profile.is_private && !canViewPrivate) {
    return { ...profile, bio: '', website_url: '', restricted: true, posts: [] };
  }
  return profile;
}

async function socialPosts(query, user, memberId = null) {
  const params = [user.gym_id, user.member_id];
  let targetClause = '';
  if (memberId) {
    params.push(memberId);
    targetClause = 'AND p.member_id = $3';
  }
  const posts = await query(
    `SELECT p.id, p.member_id, p.caption, p.media_url, p.media_type, p.created_at,
            m.name AS author_name,
            COALESCE(sp.profile_photo_url, '') AS author_photo,
            (SELECT count(*) FROM student_social_post_likes l WHERE l.post_id = p.id) AS likes_count,
            (SELECT count(*) FROM student_social_comments c WHERE c.post_id = p.id) AS comments_count,
            EXISTS (SELECT 1 FROM student_social_post_likes l WHERE l.post_id = p.id AND l.member_id = $2) AS viewer_liked
     FROM student_social_posts p
     INNER JOIN members m ON m.id = p.member_id AND m.gym_id = p.gym_id AND m.status = 'active'
     LEFT JOIN student_social_profiles sp ON sp.gym_id = p.gym_id AND sp.member_id = p.member_id
     WHERE p.gym_id = $1 AND p.is_active = true
       ${targetClause}
       AND (
         p.member_id = $2
         OR COALESCE(sp.is_private, false) = false
         OR EXISTS (
           SELECT 1 FROM student_social_follows f
           WHERE f.gym_id = $1 AND f.follower_member_id = $2
             AND f.following_member_id = p.member_id AND f.status = 'accepted'
         )
       )
     ORDER BY p.created_at DESC
     LIMIT 40`,
    params
  );
  if (!posts.rowCount) return [];
  const postIds = posts.rows.map((post) => post.id);
  const comments = await query(
    `SELECT c.id, c.post_id, c.body, c.created_at, c.member_id, m.name AS author_name,
            COALESCE(sp.profile_photo_url, '') AS author_photo
     FROM student_social_comments c
     INNER JOIN members m ON m.id = c.member_id AND m.gym_id = c.gym_id AND m.status = 'active'
     LEFT JOIN student_social_profiles sp ON sp.gym_id = c.gym_id AND sp.member_id = c.member_id
     WHERE c.gym_id = $1 AND c.post_id = ANY($2::uuid[])
     ORDER BY c.created_at ASC`,
    [user.gym_id, postIds]
  );
  const grouped = new Map(posts.rows.map((post) => [String(post.id), []]));
  comments.rows.forEach((comment) => {
    if (grouped.has(String(comment.post_id)) && grouped.get(String(comment.post_id)).length < 10) grouped.get(String(comment.post_id)).push(comment);
  });
  return posts.rows.map((post) => ({ ...post, comments: grouped.get(String(post.id)) || [] }));
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
            COALESCE(el.muscle_group_primary, pe.muscle_group_primary) AS muscle_group_primary,
            COALESCE(el.muscle_group_secondary, pe.muscle_group_secondary) AS muscle_group_secondary,
            COALESCE(el.equipment, pe.equipment) AS equipment,
            COALESCE(el.video_url, pe.video_url) AS video_url,
            COALESCE(el.image_url, pe.image_url) AS image_url,
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

async function studentCalendarDetail(query, user, month) {
  const events = await query(
    `SELECT id, title, scheduled_date, start_time, end_time, notes, status, created_at, updated_at
     FROM student_training_events
     WHERE gym_id = $1 AND member_id = $2 AND scheduled_date >= $3::date
       AND scheduled_date < ($3::date + interval '1 month')
     ORDER BY scheduled_date, start_time, created_at`,
    [user.gym_id, user.member_id, `${month}-01`]
  );
  if (!events.rowCount) return [];
  const ids = events.rows.map((item) => item.id);
  const exercises = await query(
    `SELECT ste.id, ste.event_id, ste.order_index, ste.sets, ste.reps, ste.rest_seconds, ste.notes,
            ste.exercise_library_id, ste.private_exercise_id,
            COALESCE(el.name, pe.name) AS exercise_name,
            COALESCE(el.muscle_group, pe.muscle_group) AS muscle_group,
            el.muscle_group_primary, el.muscle_group_secondary,
            COALESCE(el.equipment, pe.equipment) AS equipment,
            COALESCE(el.video_url, pe.video_url) AS video_url,
            COALESCE(el.image_url, pe.image_url) AS image_url,
            COALESCE(el.instructions, pe.instructions) AS instructions,
            (ste.private_exercise_id IS NOT NULL) AS is_private
     FROM student_training_event_exercises ste
     LEFT JOIN exercise_library el ON el.id = ste.exercise_library_id
     LEFT JOIN student_private_exercises pe ON pe.id = ste.private_exercise_id
     WHERE ste.gym_id = $1 AND ste.event_id = ANY($2::uuid[])
     ORDER BY ste.event_id, ste.order_index, ste.created_at`,
    [user.gym_id, ids]
  );
  const grouped = new Map(events.rows.map((event) => [String(event.id), []]));
  exercises.rows.forEach((exercise) => grouped.get(String(exercise.event_id))?.push(exercise));
  return events.rows.map((event) => ({ ...event, exercises: grouped.get(String(event.id)) || [] }));
}

function validCalendarDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validCalendarTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
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
    return send(res, 200, { assessments: assessments.rows, goals: goals.rows, analysis: buildProgressAnalysis(assessments.rows[0], assessments.rows[1], goals.rows) });
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/goals') {
    const result = await query(
      `SELECT id, goal_type, target_value, target_date, status, notes, created_at, updated_at
       FROM member_goals
       WHERE gym_id = $1 AND member_id = $2
       ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, target_date NULLS LAST, created_at DESC
       LIMIT 50`,
      [user.gym_id, user.member_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/goals') {
    const input = await body(req);
    const goalType = studentText(input.goal_type, '', 120);
    const targetDate = String(input.target_date || '').trim();
    const targetValue = studentNumber(input.target_value);
    const hasTargetValue = input.target_value !== undefined && input.target_value !== null && input.target_value !== '';
    if (!goalType || (targetDate && !validCalendarDate(targetDate)) || (hasTargetValue && targetValue === null)) return send(res, 400, { error: 'dados_invalidos' });
    const result = await query(
      `INSERT INTO member_goals (gym_id, member_id, goal_type, target_value, target_date, status, notes)
       VALUES ($1, $2, $3, $4, NULLIF($5, '')::date, 'active', $6)
       RETURNING id, goal_type, target_value, target_date, status, notes, created_at, updated_at`,
      [user.gym_id, user.member_id, goalType, targetValue, targetDate, studentText(input.notes, '', 2000) || null]
    );
    return send(res, 201, result.rows[0]);
  }

  const studentGoalMatch = url.pathname.match(/^\/api\/student\/goals\/([0-9a-f-]+)$/i);
  if (isStudent(user) && studentGoalMatch && ['PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    const goalId = studentGoalMatch[1];
    const existing = await query('SELECT id FROM member_goals WHERE id = $1 AND gym_id = $2 AND member_id = $3 LIMIT 1', [goalId, user.gym_id, user.member_id]);
    if (!existing.rowCount) return send(res, 404, { error: 'meta_nao_encontrada' });
    if (req.method === 'DELETE') {
      await query('DELETE FROM member_goals WHERE id = $1 AND gym_id = $2 AND member_id = $3', [goalId, user.gym_id, user.member_id]);
      return send(res, 200, { status: 'meta_excluida' });
    }
    const input = await body(req);
    const goalType = studentText(input.goal_type, '', 120);
    const targetDate = String(input.target_date || '').trim();
    const targetValue = studentNumber(input.target_value);
    const goalStatus = ['active', 'completed'].includes(String(input.status || '')) ? String(input.status) : 'active';
    const hasTargetValue = input.target_value !== undefined && input.target_value !== null && input.target_value !== '';
    if (!goalType || (targetDate && !validCalendarDate(targetDate)) || (hasTargetValue && targetValue === null)) return send(res, 400, { error: 'dados_invalidos' });
    const result = await query(
      `UPDATE member_goals
       SET goal_type = $4, target_value = $5, target_date = NULLIF($6, '')::date,
           status = $7, notes = $8, updated_at = now()
       WHERE id = $1 AND gym_id = $2 AND member_id = $3
       RETURNING id, goal_type, target_value, target_date, status, notes, created_at, updated_at`,
      [goalId, user.gym_id, user.member_id, goalType, targetValue, targetDate, goalStatus, studentText(input.notes, '', 2000) || null]
    );
    return send(res, 200, result.rows[0]);
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/progress/assessment') {
    const input = await body(req);
    const assessmentDate = String(input.assessment_date || '').trim();
    if (assessmentDate && !/^\d{4}-\d{2}-\d{2}$/.test(assessmentDate)) return send(res, 400, { error: 'data_invalida' });
    const photoUrl = studentText(input.photo_url, '', 1000);
    if (photoUrl && !validPhotoSource(photoUrl)) return send(res, 400, { error: 'foto_invalida' });
    const result = await query(
      `INSERT INTO member_assessments (
        gym_id, member_id, assessment_date, weight_kg, height_cm, body_fat_percent, muscle_mass_kg,
        waist_cm, chest_cm, hip_cm, biceps_cm, back_cm, left_arm_cm, right_arm_cm, left_thigh_cm, right_thigh_cm,
        resting_heart_rate, photo_url, notes
      ) VALUES ($1,$2,COALESCE($3::date,current_date),$4,$5,$6,COALESCE($7,(SELECT muscle_mass_kg FROM member_assessments WHERE gym_id = $1 AND member_id = $2 ORDER BY assessment_date DESC, created_at DESC LIMIT 1)),$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
      [user.gym_id, user.member_id, assessmentDate || null, studentNumber(input.weight_kg), studentNumber(input.height_cm), studentNumber(input.body_fat_percent), studentNumber(input.muscle_mass_kg), studentNumber(input.waist_cm), studentNumber(input.chest_cm), studentNumber(input.hip_cm), studentNumber(input.biceps_cm), null, studentNumber(input.thigh_cm), studentNumber(input.thigh_cm), null, null, null, photoUrl || null, studentText(input.notes, '', 5000) || null]
    );
    const history = await query('SELECT * FROM member_assessments WHERE gym_id = $1 AND member_id = $2 ORDER BY assessment_date DESC, created_at DESC LIMIT 2', [user.gym_id, user.member_id]);
    const goals = await query('SELECT * FROM member_goals WHERE gym_id = $1 AND member_id = $2 ORDER BY status, target_date NULLS LAST, created_at DESC LIMIT 20', [user.gym_id, user.member_id]);
    return send(res, 201, { assessment: result.rows[0], analysis: buildProgressAnalysis(history.rows[0], history.rows[1], goals.rows) });
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/social/feed') {
    return send(res, 200, { posts: await socialPosts(query, user) });
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/social/profile') {
    const memberId = String(url.searchParams.get('member_id') || user.member_id);
    if (!isUuid(memberId)) return send(res, 400, { error: 'perfil_invalido' });
    const profile = await socialProfileDetail(query, user, memberId);
    if (!profile) return send(res, 404, { error: 'perfil_nao_encontrado' });
    const posts = profile.restricted ? [] : await socialPosts(query, user, memberId);
    const stats = await query(
      `SELECT
         (SELECT count(*) FROM student_training_events WHERE gym_id = $1 AND member_id = $2 AND status <> 'cancelled') AS scheduled_training_count,
         (SELECT count(*) FROM student_training_event_exercises e INNER JOIN student_training_events t ON t.id = e.event_id WHERE e.gym_id = $1 AND t.member_id = $2 AND t.status <> 'cancelled') AS planned_exercise_count,
         (SELECT count(*) FROM checkins WHERE gym_id = $1 AND member_id = $2) AS checkins_count,
         ((SELECT count(*) FROM workout_day_logs WHERE gym_id = $1 AND member_id = $2 AND status = 'completed') +
          (SELECT count(*) FROM student_workout_day_logs WHERE gym_id = $1 AND member_id = $2 AND status = 'completed')) AS completed_training_count
       `,
      [user.gym_id, memberId]
    );
    return send(res, 200, { profile, posts, stats: stats.rows[0] || {} });
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/social/people') {
    const search = studentText(url.searchParams.get('q'), '', 100).toLowerCase();
    const result = await query(
      `SELECT m.id, m.name, COALESCE(sp.profile_photo_url, '') AS profile_photo_url,
              COALESCE(sp.bio, '') AS bio, COALESCE(sp.is_private, false) AS is_private,
              EXISTS (SELECT 1 FROM student_social_follows f WHERE f.gym_id = $1 AND f.follower_member_id = $2 AND f.following_member_id = m.id AND f.status = 'accepted') AS viewer_follows,
              (SELECT f.status FROM student_social_follows f WHERE f.gym_id = $1 AND f.follower_member_id = $2 AND f.following_member_id = m.id LIMIT 1) AS viewer_follow_status
       FROM members m
       LEFT JOIN student_social_profiles sp ON sp.gym_id = m.gym_id AND sp.member_id = m.id
       WHERE m.gym_id = $1 AND m.status = 'active' AND m.id <> $2
         AND ($3 = '' OR lower(m.name) LIKE '%' || $3 || '%')
       ORDER BY m.name
       LIMIT 20`,
      [user.gym_id, user.member_id, search]
    );
    return send(res, 200, { people: result.rows });
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/social/follow-requests') {
    const result = await query(
      `SELECT f.id, f.created_at, m.id AS member_id, m.name,
              COALESCE(sp.profile_photo_url, '') AS profile_photo_url,
              COALESCE(sp.bio, '') AS bio
       FROM student_social_follows f
       INNER JOIN members m ON m.id = f.follower_member_id AND m.gym_id = f.gym_id AND m.status = 'active'
       LEFT JOIN student_social_profiles sp ON sp.gym_id = f.gym_id AND sp.member_id = f.follower_member_id
       WHERE f.gym_id = $1 AND f.following_member_id = $2 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [user.gym_id, user.member_id]
    );
    return send(res, 200, { requests: result.rows });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/social/follow-request') {
    const input = await body(req);
    const decision = String(input.decision || '');
    if (!isUuid(input.request_id) || !['accepted', 'rejected'].includes(decision)) return send(res, 400, { error: 'solicitacao_invalida' });
    const result = await query(
      `UPDATE student_social_follows SET status = CASE WHEN $3 = 'accepted' THEN 'accepted' ELSE 'pending' END, updated_at = now()
       WHERE id = $1 AND gym_id = $2 AND following_member_id = $4 AND status = 'pending'
       RETURNING id, status`,
      [input.request_id, user.gym_id, decision, user.member_id]
    );
    if (decision === 'rejected' && result.rowCount) await query('DELETE FROM student_social_follows WHERE id = $1 AND gym_id = $2', [input.request_id, user.gym_id]);
    if (!result.rowCount) return send(res, 404, { error: 'solicitacao_nao_encontrada' });
    return send(res, 200, { status: decision });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/social/profile') {
    const input = await body(req);
    const name = studentText(input.name, '', 160);
    const bio = studentText(input.bio, '', 500) || null;
    const website = studentText(input.website_url, '', 500) || null;
    const photo = studentText(input.profile_photo_url, '', 1000) || null;
    const isPrivate = input.is_private === true || input.is_private === 'true';
    const weightUnit = ['kg', 'lb'].includes(String(input.weight_unit)) ? String(input.weight_unit) : 'kg';
    const distanceUnit = ['km', 'mi'].includes(String(input.distance_unit)) ? String(input.distance_unit) : 'km';
    const theme = validSocialTheme(input.theme) ? String(input.theme) : 'light';
    const language = ['pt-BR', 'en', 'es'].includes(String(input.language)) ? String(input.language) : 'pt-BR';
    if (!name || !validPhotoSource(photo || 'https://example.com/placeholder') || (website && !validPhotoSource(website))) return send(res, 400, { error: 'perfil_invalido' });
    await query('UPDATE members SET name = $3 WHERE id = $1 AND gym_id = $2', [user.member_id, user.gym_id, name]);
    const result = await query(
      `INSERT INTO student_social_profiles (gym_id, member_id, bio, website_url, profile_photo_url, is_private, weight_unit, distance_unit, theme, language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (gym_id, member_id) DO UPDATE SET bio = EXCLUDED.bio, website_url = EXCLUDED.website_url,
         profile_photo_url = EXCLUDED.profile_photo_url, is_private = EXCLUDED.is_private, weight_unit = EXCLUDED.weight_unit,
         distance_unit = EXCLUDED.distance_unit, theme = EXCLUDED.theme, language = EXCLUDED.language, updated_at = now()
       RETURNING bio, website_url, profile_photo_url, is_private, weight_unit, distance_unit, theme, language`,
      [user.gym_id, user.member_id, bio, website, photo, isPrivate, weightUnit, distanceUnit, theme, language]
    );
    return send(res, 200, { profile: { ...(result.rows[0] || {}), name } });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/social/posts') {
    const input = await body(req);
    const caption = studentText(input.caption, '', 2000) || null;
    const mediaUrl = studentText(input.media_url, '', 1000) || null;
    const mediaType = String(input.media_type || (mediaUrl ? 'image' : 'link'));
    if (!caption && !mediaUrl) return send(res, 400, { error: 'post_vazio' });
    if (!validSocialMediaType(mediaType) || (mediaUrl && !validPhotoSource(mediaUrl))) return send(res, 400, { error: 'midia_invalida' });
    const result = await query(
      `INSERT INTO student_social_posts (gym_id, member_id, caption, media_url, media_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, member_id, caption, media_url, media_type, created_at`,
      [user.gym_id, user.member_id, caption, mediaUrl, mediaType]
    );
    return send(res, 201, { post: result.rows[0] });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/social/posts/like') {
    const input = await body(req);
    if (!isUuid(input.post_id)) return send(res, 400, { error: 'post_invalido' });
    const removed = await query(
      'DELETE FROM student_social_post_likes WHERE gym_id = $1 AND post_id = $2 AND member_id = $3 RETURNING id',
      [user.gym_id, input.post_id, user.member_id]
    );
    if (removed.rowCount) return send(res, 200, { liked: false });
    const post = await query('SELECT id FROM student_social_posts WHERE id = $1 AND gym_id = $2 AND is_active = true LIMIT 1', [input.post_id, user.gym_id]);
    if (!post.rowCount) return send(res, 404, { error: 'post_nao_encontrado' });
    await query('INSERT INTO student_social_post_likes (gym_id, post_id, member_id) VALUES ($1, $2, $3) ON CONFLICT (post_id, member_id) DO NOTHING', [user.gym_id, input.post_id, user.member_id]);
    return send(res, 200, { liked: true });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/social/posts/comment') {
    const input = await body(req);
    const bodyText = studentText(input.body, '', 800);
    if (!isUuid(input.post_id) || !bodyText) return send(res, 400, { error: 'comentario_invalido' });
    const post = await query('SELECT id, member_id FROM student_social_posts p LEFT JOIN student_social_profiles sp ON sp.gym_id = p.gym_id AND sp.member_id = p.member_id WHERE p.id = $1 AND p.gym_id = $2 AND p.is_active = true AND (p.member_id = $3 OR COALESCE(sp.is_private, false) = false OR EXISTS (SELECT 1 FROM student_social_follows f WHERE f.gym_id = $2 AND f.follower_member_id = $3 AND f.following_member_id = p.member_id AND f.status = \'accepted\')) LIMIT 1', [input.post_id, user.gym_id, user.member_id]);
    if (!post.rowCount) return send(res, 404, { error: 'post_nao_encontrado' });
    const result = await query('INSERT INTO student_social_comments (gym_id, post_id, member_id, body) VALUES ($1, $2, $3, $4) RETURNING id, post_id, member_id, body, created_at', [user.gym_id, input.post_id, user.member_id, bodyText]);
    return send(res, 201, { comment: result.rows[0] });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/social/follow') {
    const input = await body(req);
    if (!isUuid(input.member_id) || String(input.member_id) === String(user.member_id)) return send(res, 400, { error: 'perfil_invalido' });
    const target = await query('SELECT m.id, COALESCE(sp.is_private, false) AS is_private FROM members m LEFT JOIN student_social_profiles sp ON sp.gym_id = m.gym_id AND sp.member_id = m.id WHERE m.id = $1 AND m.gym_id = $2 AND m.status = \'active\' LIMIT 1', [input.member_id, user.gym_id]);
    if (!target.rowCount) return send(res, 404, { error: 'perfil_nao_encontrado' });
    const existing = await query('DELETE FROM student_social_follows WHERE gym_id = $1 AND follower_member_id = $2 AND following_member_id = $3 RETURNING status', [user.gym_id, user.member_id, input.member_id]);
    if (existing.rowCount) return send(res, 200, { following: false, status: null });
    const followStatus = target.rows[0].is_private ? 'pending' : 'accepted';
    await query('INSERT INTO student_social_follows (gym_id, follower_member_id, following_member_id, status) VALUES ($1, $2, $3, $4)', [user.gym_id, user.member_id, input.member_id, followStatus]);
    return send(res, 200, { following: followStatus === 'accepted', status: followStatus });
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
        `SELECT id, name, muscle_group, muscle_group_primary, muscle_group_secondary, equipment, level, instructions, video_url, image_url
         FROM exercise_library WHERE gym_id = $1 AND is_active = true
         ORDER BY muscle_group_primary NULLS LAST, muscle_group, name`,
        [user.gym_id]
      ),
      query(
        `SELECT id, name, muscle_group, muscle_group_primary, muscle_group_secondary, equipment, instructions, video_url, image_url
         FROM student_private_exercises WHERE gym_id = $1 AND member_id = $2 AND is_active = true
         ORDER BY name`,
        [user.gym_id, user.member_id]
      )
    ]);
    return send(res, 200, { public: publicExercises.rows, private: privateExercises.rows });
  }

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/training/calendar') {
    const month = String(url.searchParams.get('month') || '').trim() || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return send(res, 400, { error: 'mes_invalido' });
    return send(res, 200, { month, events: await studentCalendarDetail(query, user, month) });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/calendar/event') {
    const input = await body(req);
    const date = String(input.scheduled_date || '').trim();
    const start = String(input.start_time || '').trim();
    const end = String(input.end_time || '').trim();
    const title = studentText(input.title, '', 160);
    if (!title || !validCalendarDate(date) || !validCalendarTime(start) || (end && !validCalendarTime(end)) || (end && end <= start)) return send(res, 400, { error: 'sessao_invalida' });
    let result;
    if (input.id) {
      result = await query(
        `UPDATE student_training_events SET title = $3, scheduled_date = $4::date, start_time = $5::time, end_time = NULLIF($6::text, '')::time, notes = $7, updated_at = now()
         WHERE id = $1 AND gym_id = $2 AND member_id = $8
         RETURNING id, title, scheduled_date, start_time, end_time, notes, status, created_at, updated_at`,
        [input.id, user.gym_id, title, date, start, end, studentText(input.notes, '', 2000) || null, user.member_id]
      );
    } else {
      result = await query(
        `INSERT INTO student_training_events (gym_id, member_id, title, scheduled_date, start_time, end_time, notes)
         VALUES ($1, $2, $3, $4::date, $5::time, NULLIF($6::text, '')::time, $7)
         RETURNING id, title, scheduled_date, start_time, end_time, notes, status, created_at, updated_at`,
        [user.gym_id, user.member_id, title, date, start, end, studentText(input.notes, '', 2000) || null]
      );
    }
    if (!result.rowCount) return send(res, 404, { error: 'sessao_nao_encontrada' });
    return send(res, input.id ? 200 : 201, { ...result.rows[0], exercises: [] });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/calendar/event/save') {
    const input = await body(req);
    const date = String(input.scheduled_date || '').trim();
    const start = String(input.start_time || '').trim();
    const end = String(input.end_time || '').trim();
    const title = studentText(input.title, '', 160);
    const eventId = String(input.id || '').trim();
    const exercises = Array.isArray(input.exercises) ? input.exercises.slice(0, 50) : [];
    if (eventId && !isUuid(eventId)) return send(res, 400, { error: 'sessao_id_invalido' });
    if (!title || !validCalendarDate(date) || !validCalendarTime(start) || (end && !validCalendarTime(end)) || (end && end <= start)) {
      return send(res, 400, { error: 'sessao_invalida' });
    }
    for (const exercise of exercises) {
      const publicId = String(exercise?.exercise_id || '').trim();
      const privateId = String(exercise?.private_exercise_id || '').trim();
      if ((publicId && privateId) || (!publicId && !privateId) || !isUuid(publicId || privateId)) {
        return send(res, 400, { error: 'exercicio_invalido' });
      }
    }

    const client = await pool.connect();
    let saveStage = 'inicio';
    try {
      await client.query('BEGIN');
      saveStage = 'sessao';
      let result;
      if (eventId) {
        result = await client.query(
          `UPDATE student_training_events SET title = $3, scheduled_date = $4::date, start_time = $5::time, end_time = NULLIF($6::text, '')::time, notes = $7, updated_at = now()
           WHERE id = $1 AND gym_id = $2 AND member_id = $8
           RETURNING id, title, scheduled_date, start_time, end_time, notes, status, created_at, updated_at`,
          [eventId, user.gym_id, title, date, start, end, studentText(input.notes, '', 2000) || null, user.member_id]
        );
      } else {
        result = await client.query(
          `INSERT INTO student_training_events (gym_id, member_id, title, scheduled_date, start_time, end_time, notes)
           VALUES ($1, $2, $3, $4::date, $5::time, NULLIF($6::text, '')::time, $7)
           RETURNING id, title, scheduled_date, start_time, end_time, notes, status, created_at, updated_at`,
          [user.gym_id, user.member_id, title, date, start, end, studentText(input.notes, '', 2000) || null]
        );
      }
      if (!result.rowCount) {
        const error = new Error('sessao_nao_encontrada');
        error.statusCode = 404;
        throw error;
      }

      const savedEventId = result.rows[0].id;
      if (input.replace_exercises === true || !eventId) {
        await client.query('DELETE FROM student_training_event_exercises WHERE gym_id = $1 AND event_id = $2', [user.gym_id, savedEventId]);
      }

      for (const [index, exercise] of exercises.entries()) {
        saveStage = `exercicio_${index + 1}`;
        const publicId = String(exercise.exercise_id || '').trim();
        const privateId = String(exercise.private_exercise_id || '').trim();
        let publicExerciseId = null;
        let privateExerciseId = null;
        if (privateId) {
          const privateExercise = await client.query(
            'SELECT id FROM student_private_exercises WHERE id = $1 AND gym_id = $2 AND member_id = $3 AND is_active = true LIMIT 1',
            [privateId, user.gym_id, user.member_id]
          );
          if (!privateExercise.rowCount) {
            const error = new Error('exercicio_privado_nao_encontrado');
            error.statusCode = 404;
            throw error;
          }
          privateExerciseId = privateExercise.rows[0].id;
        } else {
          const publicExercise = await client.query(
            'SELECT id FROM exercise_library WHERE id = $1 AND gym_id = $2 AND is_active = true LIMIT 1',
            [publicId, user.gym_id]
          );
          if (!publicExercise.rowCount) {
            const error = new Error('exercicio_nao_encontrado');
            error.statusCode = 404;
            throw error;
          }
          publicExerciseId = publicExercise.rows[0].id;
        }
        await client.query(
          `INSERT INTO student_training_event_exercises
             (gym_id, event_id, exercise_library_id, private_exercise_id, order_index, sets, reps, rest_seconds, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [user.gym_id, savedEventId, publicExerciseId, privateExerciseId, index + 1, studentInteger(exercise.sets, 3, 1, 30), studentText(exercise.reps, '10-12', 60) || '10-12', studentInteger(exercise.rest_seconds, 60, 0, 3600), studentText(exercise.notes, '', 2000) || null]
        );
      }

      await client.query('COMMIT');
      return send(res, eventId ? 200 : 201, { ...result.rows[0], exercises });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (!error.statusCode) {
        const code = String(error.code || '');
        const errorName = ['42P01', '42703'].includes(code)
          ? 'estrutura_treino_desatualizada'
          : code === '42P18'
            ? 'horario_invalido'
          : ['23503', '22P02'].includes(code)
            ? 'exercicio_invalido'
            : code === '23514'
              ? 'dados_do_treino_invalidos'
              : `falha_salvar_treino_${saveStage}`;
        console.error('[student-training-save]', { stage: saveStage, code, message: error.message });
        const safeError = new Error(errorName);
        safeError.statusCode = 500;
        throw safeError;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/calendar/event/delete') {
    const input = await body(req);
    if (!input.id) return send(res, 400, { error: 'sessao_id_obrigatorio' });
    const result = await query('DELETE FROM student_training_events WHERE id = $1 AND gym_id = $2 AND member_id = $3 RETURNING id', [input.id, user.gym_id, user.member_id]);
    if (!result.rowCount) return send(res, 404, { error: 'sessao_nao_encontrada' });
    return send(res, 200, { status: 'sessao_removida' });
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/calendar/event/exercise') {
    const input = await body(req);
    if (!input.event_id || (!input.exercise_id && !input.private_exercise_id)) return send(res, 400, { error: 'dados_invalidos' });
    const event = await query('SELECT id FROM student_training_events WHERE id = $1 AND gym_id = $2 AND member_id = $3 LIMIT 1', [input.event_id, user.gym_id, user.member_id]);
    if (!event.rowCount) return send(res, 404, { error: 'sessao_nao_encontrada' });
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
    const order = await query('SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM student_training_event_exercises WHERE gym_id = $1 AND event_id = $2', [user.gym_id, input.event_id]);
    const result = await query(
      `INSERT INTO student_training_event_exercises
         (gym_id, event_id, exercise_library_id, private_exercise_id, order_index, sets, reps, rest_seconds, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, event_id, exercise_library_id, private_exercise_id, order_index, sets, reps, rest_seconds, notes`,
      [user.gym_id, input.event_id, publicId, privateId, Number(order.rows[0]?.next_order || 1), studentInteger(input.sets, 3, 1, 30), studentText(input.reps, '10-12', 60) || '10-12', studentInteger(input.rest_seconds, 60, 0, 3600), studentText(input.notes, '', 2000) || null]
    );
    return send(res, 201, result.rows[0]);
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/calendar/event/exercise/update') {
    const input = await body(req);
    if (!input.id) return send(res, 400, { error: 'exercicio_id_obrigatorio' });
    const changesExercise = Object.prototype.hasOwnProperty.call(input, 'exercise_id') || Object.prototype.hasOwnProperty.call(input, 'private_exercise_id');
    let publicId = null;
    let privateId = null;
    if (changesExercise) {
      if (Boolean(input.exercise_id) === Boolean(input.private_exercise_id)) return send(res, 400, { error: 'exercicio_invalido' });
      if (input.private_exercise_id) {
        const privateExercise = await query('SELECT id FROM student_private_exercises WHERE id = $1 AND gym_id = $2 AND member_id = $3 AND is_active = true LIMIT 1', [input.private_exercise_id, user.gym_id, user.member_id]);
        if (!privateExercise.rowCount) return send(res, 404, { error: 'exercicio_privado_nao_encontrado' });
        privateId = privateExercise.rows[0].id;
      } else {
        const publicExercise = await query('SELECT id FROM exercise_library WHERE id = $1 AND gym_id = $2 AND is_active = true LIMIT 1', [input.exercise_id, user.gym_id]);
        if (!publicExercise.rowCount) return send(res, 404, { error: 'exercicio_nao_encontrado' });
        publicId = publicExercise.rows[0].id;
      }
    }
    const result = await query(
      `UPDATE student_training_event_exercises ste SET
         exercise_library_id = CASE WHEN $3 THEN $4 ELSE ste.exercise_library_id END,
         private_exercise_id = CASE WHEN $3 THEN $5 ELSE ste.private_exercise_id END,
         sets = $6, reps = $7, rest_seconds = $8, notes = $9, updated_at = now()
       FROM student_training_events se
       WHERE ste.id = $1 AND ste.event_id = se.id AND ste.gym_id = $2 AND se.member_id = $10
       RETURNING ste.id, ste.event_id, ste.exercise_library_id, ste.private_exercise_id, ste.sets, ste.reps, ste.rest_seconds, ste.notes`,
      [input.id, user.gym_id, changesExercise, publicId, privateId, studentInteger(input.sets, 3, 1, 30), studentText(input.reps, '10-12', 60) || '10-12', studentInteger(input.rest_seconds, 60, 0, 3600), studentText(input.notes, '', 2000) || null, user.member_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'exercicio_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/training/calendar/event/exercise/delete') {
    const input = await body(req);
    if (!input.id) return send(res, 400, { error: 'exercicio_id_obrigatorio' });
    const result = await query(
      `DELETE FROM student_training_event_exercises ste USING student_training_events se
       WHERE ste.id = $1 AND ste.event_id = se.id AND ste.gym_id = $2 AND se.member_id = $3
       RETURNING ste.id`,
      [input.id, user.gym_id, user.member_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'exercicio_nao_encontrado' });
    return send(res, 200, { status: 'exercicio_removido' });
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
    const imageUrl = studentText(input.image_url, '', 1000);
    if (name.length < 2 || !validStudentVideoSource(videoUrl) || (imageUrl && !validPhotoSource(imageUrl))) return send(res, 400, { error: 'exercicio_invalido' });
    const duplicate = await query('SELECT id FROM student_private_exercises WHERE gym_id = $1 AND member_id = $2 AND lower(name) = lower($3) LIMIT 1', [user.gym_id, user.member_id, name]);
    if (duplicate.rowCount) return send(res, 409, { error: 'exercicio_privado_ja_cadastrado' });
    const result = await query(
      `INSERT INTO student_private_exercises (gym_id, member_id, name, muscle_group, muscle_group_primary, muscle_group_secondary, equipment, instructions, video_url, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, ''), NULLIF($10, ''))
       RETURNING id, name, muscle_group, muscle_group_primary, muscle_group_secondary, equipment, instructions, video_url, image_url`,
      [user.gym_id, user.member_id, name, studentText(input.muscle_group_primary || input.muscle_group, 'Personalizado', 120), studentText(input.muscle_group_primary || input.muscle_group, 'Personalizado', 120), studentText(input.muscle_group_secondary, '', 240) || null, studentText(input.equipment, '', 120) || null, studentText(input.instructions, '', 2000) || null, videoUrl, imageUrl]
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
      `SELECT we.id, we.sets, we.reps, we.rest_seconds, we.load_hint, we.notes, wd.id AS workout_day_id, wd.weekday, wd.title AS day_title, e.name AS exercise_name, e.muscle_group, e.muscle_group_primary, e.muscle_group_secondary, e.equipment, e.video_url, e.image_url, e.instructions
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
