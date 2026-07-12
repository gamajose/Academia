const crypto = require('crypto');
const { hasModulePermission } = require('../lib/accessControl');

const graceDays = Math.min(60, Math.max(0, Number(process.env.ACCESS_GRACE_DAYS || 10)));
const deviceOnlineSeconds = Math.min(600, Math.max(30, Number(process.env.ACCESS_DEVICE_ONLINE_SECONDS || 120)));

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function newApiKey() {
  return `acad_${crypto.randomBytes(32).toString('base64url')}`;
}

function isStudent(user) {
  return user && user.role === 'student' && user.member_id;
}

function isManager(user, module = 'access') {
  return hasModulePermission(user, module);
}

function normalizeLimit(value, fallback = 50, max = 200) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, parsed));
}

async function loadStudentOverview(query, user) {
  const result = await query(
    `SELECT m.id AS member_id,
            m.name,
            m.email,
            m.phone,
            m.status AS member_status,
            ms.id AS membership_id,
            ms.status AS membership_status,
            ms.starts_at,
            ms.ends_at,
            pl.id AS plan_id,
            pl.name AS plan_name,
            pl.price_cents,
            pl.duration_days,
            pending.id AS pending_payment_id,
            pending.amount_cents AS pending_amount_cents,
            pending.original_amount_cents,
            pending.discount_cents,
            pending.fee_cents,
            pending.status AS pending_payment_status,
            pending.due_date AS pending_due_date,
            CASE
              WHEN pending.due_date IS NULL OR pending.due_date >= current_date THEN 0
              ELSE current_date - pending.due_date
            END AS overdue_days,
            CASE
              WHEN pending.due_date IS NULL THEN NULL
              ELSE pending.due_date + ($3::integer + 1)
            END AS block_on,
            paid.id AS last_payment_id,
            paid.amount_cents AS last_payment_amount_cents,
            paid.paid_at AS last_paid_at,
            freq.last_checkin_at,
            freq.month_checkins,
            freq.week_checkins,
            notifications.unread_notifications
     FROM members m
     LEFT JOIN LATERAL (
       SELECT id, plan_id, status, starts_at, ends_at
       FROM memberships
       WHERE gym_id = m.gym_id AND member_id = m.id
       ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, ends_at DESC, created_at DESC
       LIMIT 1
     ) ms ON true
     LEFT JOIN plans pl ON pl.id = ms.plan_id
     LEFT JOIN LATERAL (
       SELECT id, amount_cents, original_amount_cents, discount_cents, fee_cents, status, due_date
       FROM payments
       WHERE gym_id = m.gym_id AND member_id = m.id AND status IN ('pending', 'overdue')
       ORDER BY due_date ASC, created_at ASC
       LIMIT 1
     ) pending ON true
     LEFT JOIN LATERAL (
       SELECT id, amount_cents, paid_at
       FROM payments
       WHERE gym_id = m.gym_id AND member_id = m.id AND status = 'paid'
       ORDER BY paid_at DESC NULLS LAST, created_at DESC
       LIMIT 1
     ) paid ON true
     LEFT JOIN LATERAL (
       SELECT max(checked_at) AS last_checkin_at,
              count(*) FILTER (WHERE checked_at >= date_trunc('month', now()))::integer AS month_checkins,
              count(*) FILTER (WHERE checked_at >= date_trunc('week', now()))::integer AS week_checkins
       FROM checkins
       WHERE gym_id = m.gym_id AND member_id = m.id
     ) freq ON true
     LEFT JOIN LATERAL (
       SELECT count(*)::integer AS unread_notifications
       FROM member_notifications
       WHERE gym_id = m.gym_id AND member_id = m.id AND read_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())
     ) notifications ON true
     WHERE m.gym_id = $1 AND m.id = $2
     LIMIT 1`,
    [user.gym_id, user.member_id, graceDays]
  );

  const row = result.rows[0];
  if (!row) return null;
  const overdueDays = Number(row.overdue_days || 0);
  const financialStatus = !row.pending_payment_id
    ? 'current'
    : overdueDays === 0
      ? 'due'
      : overdueDays <= graceDays
        ? 'grace_period'
        : 'blocked';

  return {
    member: {
      id: row.member_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      status: row.member_status
    },
    membership: row.membership_id
      ? {
          id: row.membership_id,
          status: row.membership_status,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          plan: {
            id: row.plan_id,
            name: row.plan_name,
            price_cents: row.price_cents,
            duration_days: row.duration_days
          }
        }
      : null,
    financial: {
      status: financialStatus,
      grace_days: graceDays,
      pending_payment: row.pending_payment_id
        ? {
            id: row.pending_payment_id,
            amount_cents: row.pending_amount_cents,
            original_amount_cents: row.original_amount_cents,
            discount_cents: row.discount_cents,
            fee_cents: row.fee_cents,
            status: row.pending_payment_status,
            due_date: row.pending_due_date,
            overdue_days: overdueDays,
            block_on: row.block_on
          }
        : null,
      last_payment: row.last_payment_id
        ? {
            id: row.last_payment_id,
            amount_cents: row.last_payment_amount_cents,
            paid_at: row.last_paid_at
          }
        : null
    },
    frequency: {
      last_checkin_at: row.last_checkin_at,
      month_checkins: Number(row.month_checkins || 0),
      week_checkins: Number(row.week_checkins || 0)
    },
    unread_notifications: Number(row.unread_notifications || 0)
  };
}

async function studentOverview(res, user, helpers) {
  const overview = await loadStudentOverview(helpers.query, user);
  if (!overview) return helpers.send(res, 404, { error: 'aluno_nao_encontrado' });
  return helpers.send(res, 200, overview);
}

async function studentPayments(res, user, url, helpers) {
  const limit = normalizeLimit(url.searchParams.get('limit'), 50, 200);
  const result = await helpers.query(
    `SELECT id, amount_cents, original_amount_cents, discount_cents, fee_cents,
            status, due_date, paid_at, method, notes, created_at, updated_at,
            CASE WHEN due_date < current_date AND status IN ('pending','overdue')
                 THEN current_date - due_date ELSE 0 END AS overdue_days
     FROM payments
     WHERE gym_id = $1 AND member_id = $2
     ORDER BY due_date DESC, created_at DESC
     LIMIT $3`,
    [user.gym_id, user.member_id, limit]
  );
  return helpers.send(res, 200, { data: result.rows });
}

async function studentCheckins(res, user, url, helpers) {
  const limit = normalizeLimit(url.searchParams.get('limit'), 50, 200);
  const result = await helpers.query(
    `SELECT c.id, c.checked_at, c.source,
            ad.name AS device_name,
            d.status AS access_status,
            d.overdue_days,
            d.message
     FROM checkins c
     LEFT JOIN access_decisions d ON d.checkin_id = c.id
     LEFT JOIN access_devices ad ON ad.id = d.device_id
     WHERE c.gym_id = $1 AND c.member_id = $2
     ORDER BY c.checked_at DESC
     LIMIT $3`,
    [user.gym_id, user.member_id, limit]
  );
  return helpers.send(res, 200, { data: result.rows });
}

function dynamicNotifications(overview) {
  const items = [];
  const pending = overview?.financial?.pending_payment;
  if (pending) {
    if (pending.overdue_days > graceDays) {
      items.push({
        id: 'dynamic-access-blocked',
        type: 'access_blocked',
        title: 'Acesso bloqueado',
        message: `A mensalidade esta vencida ha ${pending.overdue_days} dias. Regularize para voltar a acessar a academia.`,
        action_route: '/finance',
        dynamic: true
      });
    } else if (pending.overdue_days > 0) {
      items.push({
        id: 'dynamic-payment-grace',
        type: 'payment_overdue',
        title: 'Mensalidade em atraso',
        message: `Voce esta no ${pending.overdue_days}o dia de atraso. O acesso sera bloqueado em ${pending.block_on}.`,
        action_route: '/finance',
        dynamic: true
      });
    } else {
      items.push({
        id: 'dynamic-payment-due',
        type: 'payment_due',
        title: 'Mensalidade pendente',
        message: `Existe uma mensalidade com vencimento em ${pending.due_date}.`,
        action_route: '/finance',
        dynamic: true
      });
    }
  }

  const endsAt = overview?.membership?.ends_at;
  if (endsAt) {
    const remaining = Math.ceil((new Date(`${endsAt}T00:00:00Z`) - new Date()) / 86400000);
    if (remaining >= 0 && remaining <= 7) {
      items.push({
        id: 'dynamic-membership-ending',
        type: 'membership',
        title: 'Plano proximo do vencimento',
        message: `Sua matricula termina em ${endsAt}.`,
        action_route: '/finance',
        dynamic: true
      });
    }
  }
  return items;
}

async function studentNotifications(res, user, helpers) {
  const [overview, stored] = await Promise.all([
    loadStudentOverview(helpers.query, user),
    helpers.query(
      `SELECT id, type, title, message, action_route, read_at, metadata, created_at
       FROM member_notifications
       WHERE gym_id = $1 AND member_id = $2
         AND (expires_at IS NULL OR expires_at > now())
       ORDER BY created_at DESC
       LIMIT 100`,
      [user.gym_id, user.member_id]
    )
  ]);
  return helpers.send(res, 200, {
    data: [...dynamicNotifications(overview), ...stored.rows],
    unread: stored.rows.filter((item) => !item.read_at).length + dynamicNotifications(overview).length
  });
}

async function markNotificationRead(req, res, user, helpers) {
  const input = await helpers.body(req);
  if (input.all === true) {
    await helpers.query(
      'UPDATE member_notifications SET read_at = COALESCE(read_at, now()) WHERE gym_id = $1 AND member_id = $2',
      [user.gym_id, user.member_id]
    );
    return helpers.send(res, 200, { updated: 'all' });
  }
  if (!input.notification_id) return helpers.send(res, 400, { error: 'notification_id_obrigatorio' });
  const result = await helpers.query(
    `UPDATE member_notifications SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND gym_id = $2 AND member_id = $3
     RETURNING id, read_at`,
    [input.notification_id, user.gym_id, user.member_id]
  );
  if (!result.rowCount) return helpers.send(res, 404, { error: 'notificacao_nao_encontrada' });
  return helpers.send(res, 200, result.rows[0]);
}

async function accessOverview(res, user, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const [devices, decisions, stats] = await Promise.all([
    helpers.query(
      `SELECT ad.id, ad.name, ad.code, ad.is_active, ad.last_seen_at, ad.created_at, ad.updated_at,
              (ad.is_active AND ad.last_seen_at >= now() - ($2::integer * interval '1 second')) AS online,
              last_decision.decided_at AS last_access_at,
              last_decision.allowed AS last_access_allowed,
              last_decision.member_name AS last_member_name,
              commands.pending_commands
       FROM access_devices ad
       LEFT JOIN LATERAL (
         SELECT d.decided_at, d.allowed, m.name AS member_name
         FROM access_decisions d
         INNER JOIN members m ON m.id = d.member_id
         WHERE d.device_id = ad.id
         ORDER BY d.decided_at DESC LIMIT 1
       ) last_decision ON true
       LEFT JOIN LATERAL (
         SELECT count(*)::integer AS pending_commands
         FROM access_commands ac
         WHERE ac.device_id = ad.id AND ac.status IN ('pending','delivered') AND ac.expires_at > now()
       ) commands ON true
       WHERE ad.gym_id = $1
       ORDER BY ad.name`,
      [user.gym_id, deviceOnlineSeconds]
    ),
    helpers.query(
      `SELECT d.id, d.allowed, d.status, d.reason, d.overdue_days, d.message, d.decided_at,
              m.id AS member_id, m.name AS member_name,
              ad.id AS device_id, ad.name AS device_name,
              d.checkin_id
       FROM access_decisions d
       INNER JOIN members m ON m.id = d.member_id
       LEFT JOIN access_devices ad ON ad.id = d.device_id
       WHERE d.gym_id = $1
       ORDER BY d.decided_at DESC
       LIMIT 100`,
      [user.gym_id]
    ),
    helpers.query(
      `SELECT count(*) FILTER (WHERE decided_at >= current_date)::integer AS attempts_today,
              count(*) FILTER (WHERE decided_at >= current_date AND allowed)::integer AS allowed_today,
              count(*) FILTER (WHERE decided_at >= current_date AND NOT allowed)::integer AS denied_today,
              count(*) FILTER (WHERE decided_at >= current_date AND status = 'grace_period')::integer AS grace_today
       FROM access_decisions WHERE gym_id = $1`,
      [user.gym_id]
    )
  ]);
  return helpers.send(res, 200, {
    devices: devices.rows,
    decisions: decisions.rows,
    stats: stats.rows[0] || { attempts_today: 0, allowed_today: 0, denied_today: 0, grace_today: 0 },
    online_threshold_seconds: deviceOnlineSeconds
  });
}

async function toggleDevice(req, res, user, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.device_id || typeof input.is_active !== 'boolean') return helpers.send(res, 400, { error: 'dados_invalidos' });
  const result = await helpers.query(
    `UPDATE access_devices SET is_active = $1, updated_at = now()
     WHERE id = $2 AND gym_id = $3
     RETURNING id, name, code, is_active, last_seen_at, updated_at`,
    [input.is_active, input.device_id, user.gym_id]
  );
  if (!result.rowCount) return helpers.send(res, 404, { error: 'dispositivo_nao_encontrado' });
  return helpers.send(res, 200, result.rows[0]);
}

async function rotateDeviceKey(req, res, user, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.device_id) return helpers.send(res, 400, { error: 'device_id_obrigatorio' });
  const apiKey = newApiKey();
  const result = await helpers.query(
    `UPDATE access_devices SET api_key_hash = $1, updated_at = now()
     WHERE id = $2 AND gym_id = $3
     RETURNING id, name, code, is_active, updated_at`,
    [sha256(apiKey), input.device_id, user.gym_id]
  );
  if (!result.rowCount) return helpers.send(res, 404, { error: 'dispositivo_nao_encontrado' });
  return helpers.send(res, 200, {
    ...result.rows[0],
    api_key: apiKey,
    warning: 'A chave anterior foi invalidada. Guarde esta nova chave agora.'
  });
}

async function queueDeviceCommand(req, res, user, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.device_id || !['unlock', 'test'].includes(input.command)) return helpers.send(res, 400, { error: 'dados_invalidos' });
  const device = await helpers.query('SELECT id FROM access_devices WHERE id = $1 AND gym_id = $2 AND is_active = true', [input.device_id, user.gym_id]);
  if (!device.rowCount) return helpers.send(res, 404, { error: 'dispositivo_nao_encontrado_ou_inativo' });
  const result = await helpers.query(
    `INSERT INTO access_commands (gym_id, device_id, command, requested_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, device_id, command, status, requested_at, expires_at`,
    [user.gym_id, input.device_id, input.command, user.sub]
  );
  return helpers.send(res, 202, result.rows[0]);
}

async function authenticateDevice(req, helpers) {
  const apiKey = String(req.headers['x-access-device-key'] || '').trim();
  if (!apiKey) return null;
  const result = await helpers.query(
    `SELECT id, gym_id, name, code FROM access_devices
     WHERE api_key_hash = $1 AND is_active = true LIMIT 1`,
    [sha256(apiKey)]
  );
  return result.rows[0] || null;
}

async function deviceCommands(req, res, helpers) {
  const device = await authenticateDevice(req, helpers);
  if (!device) return helpers.send(res, 401, { error: 'dispositivo_nao_autorizado' });
  await helpers.query(
    `UPDATE access_commands SET status = 'expired'
     WHERE device_id = $1 AND status IN ('pending','delivered') AND expires_at <= now()`,
    [device.id]
  );
  const result = await helpers.query(
    `UPDATE access_commands SET status = 'delivered', delivered_at = COALESCE(delivered_at, now())
     WHERE id IN (
       SELECT id FROM access_commands
       WHERE device_id = $1 AND status = 'pending' AND expires_at > now()
       ORDER BY requested_at ASC LIMIT 10
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, command, status, requested_at, expires_at`,
    [device.id]
  );
  await helpers.query('UPDATE access_devices SET last_seen_at = now(), updated_at = now() WHERE id = $1', [device.id]);
  return helpers.send(res, 200, { device: { id: device.id, name: device.name, code: device.code }, commands: result.rows });
}

async function completeDeviceCommand(req, res, helpers) {
  const device = await authenticateDevice(req, helpers);
  if (!device) return helpers.send(res, 401, { error: 'dispositivo_nao_autorizado' });
  const input = await helpers.body(req);
  if (!input.command_id || !['completed', 'failed'].includes(input.status)) return helpers.send(res, 400, { error: 'dados_invalidos' });
  const result = await helpers.query(
    `UPDATE access_commands
     SET status = $1, completed_at = now(), result = $2::jsonb
     WHERE id = $3 AND device_id = $4 AND status IN ('pending','delivered')
     RETURNING id, command, status, completed_at, result`,
    [input.status, JSON.stringify(input.result || {}), input.command_id, device.id]
  );
  if (!result.rowCount) return helpers.send(res, 404, { error: 'comando_nao_encontrado' });
  await helpers.query('UPDATE access_devices SET last_seen_at = now(), updated_at = now() WHERE id = $1', [device.id]);
  return helpers.send(res, 200, result.rows[0]);
}

async function createNotification(req, res, user, helpers) {
  if (!isManager(user, 'alerts')) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.title || !input.message) return helpers.send(res, 400, { error: 'titulo_e_mensagem_obrigatorios' });

  if (input.member_id) {
    const member = await helpers.query('SELECT id FROM members WHERE id = $1 AND gym_id = $2', [input.member_id, user.gym_id]);
    if (!member.rowCount) return helpers.send(res, 404, { error: 'aluno_nao_encontrado' });
    const result = await helpers.query(
      `INSERT INTO member_notifications (gym_id, member_id, type, title, message, action_route, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id, member_id, type, title, message, action_route, created_at`,
      [user.gym_id, input.member_id, input.type || 'info', input.title, input.message, input.action_route || null, input.expires_at || null, JSON.stringify(input.metadata || {})]
    );
    return helpers.send(res, 201, { created: 1, notification: result.rows[0] });
  }

  const result = await helpers.query(
    `INSERT INTO member_notifications (gym_id, member_id, type, title, message, action_route, expires_at, metadata)
     SELECT $1, m.id, $2, $3, $4, $5, $6, $7::jsonb
     FROM members m WHERE m.gym_id = $1 AND m.status = 'active'
     RETURNING id`,
    [user.gym_id, input.type || 'info', input.title, input.message, input.action_route || null, input.expires_at || null, JSON.stringify(input.metadata || {})]
  );
  return helpers.send(res, 201, { created: result.rowCount });
}

async function recentAdminNotifications(res, user, helpers) {
  if (!isManager(user, 'alerts')) return helpers.send(res, 403, { error: 'sem_permissao' });
  const result = await helpers.query(
    `SELECT n.id, n.type, n.title, n.message, n.action_route, n.read_at, n.created_at,
            m.id AS member_id, m.name AS member_name
     FROM member_notifications n
     INNER JOIN members m ON m.id = n.member_id
     WHERE n.gym_id = $1
     ORDER BY n.created_at DESC
     LIMIT 100`,
    [user.gym_id]
  );
  return helpers.send(res, 200, { data: result.rows });
}

async function handleProductToolsRoutes(req, res, user, url, helpers) {
  if (req.method === 'GET' && url.pathname === '/api/access/device/commands') return deviceCommands(req, res, helpers);
  if (req.method === 'POST' && url.pathname === '/api/access/device/commands/complete') return completeDeviceCommand(req, res, helpers);

  if (!user) return false;

  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/account/overview') return studentOverview(res, user, helpers);
  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/payments') return studentPayments(res, user, url, helpers);
  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/checkins') return studentCheckins(res, user, url, helpers);
  if (isStudent(user) && req.method === 'GET' && url.pathname === '/api/student/notifications') return studentNotifications(res, user, helpers);
  if (isStudent(user) && req.method === 'POST' && url.pathname === '/api/student/notifications/read') return markNotificationRead(req, res, user, helpers);

  if (req.method === 'GET' && url.pathname === '/api/access/overview') return accessOverview(res, user, helpers);
  if (req.method === 'POST' && url.pathname === '/api/access/devices/toggle') return toggleDevice(req, res, user, helpers);
  if (req.method === 'POST' && url.pathname === '/api/access/devices/rotate-key') return rotateDeviceKey(req, res, user, helpers);
  if (req.method === 'POST' && url.pathname === '/api/access/devices/command') return queueDeviceCommand(req, res, user, helpers);
  if (req.method === 'POST' && url.pathname === '/api/notifications') return createNotification(req, res, user, helpers);
  if (req.method === 'GET' && url.pathname === '/api/notifications/admin/recent') return recentAdminNotifications(res, user, helpers);

  return false;
}

module.exports = { handleProductToolsRoutes, normalizeLimit, dynamicNotifications };
