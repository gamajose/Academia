const crypto = require('crypto');
const { pool } = require('../lib/db');
const { DEFAULT_GRACE_DAYS, evaluateAccess } = require('../lib/accessPolicy');

const qrTtlSeconds = Math.min(120, Math.max(15, Number(process.env.ACCESS_QR_TTL_SECONDS || 30)));
const graceDays = Math.min(60, Math.max(0, Number(process.env.ACCESS_GRACE_DAYS || DEFAULT_GRACE_DAYS)));

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function newApiKey() {
  return `acad_${crypto.randomBytes(32).toString('base64url')}`;
}

function newQrToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function deviceCode(value) {
  const base = String(value || 'catraca')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'catraca';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

function extractQrToken(payload) {
  const value = String(payload || '').trim();
  if (!value) return '';
  if (value.startsWith('academia-access:')) return value.slice('academia-access:'.length);
  if (value.startsWith('academia://')) {
    try {
      return new URL(value).searchParams.get('token') || '';
    } catch (_) {
      return '';
    }
  }
  return value;
}

function isStudent(user) {
  return user && user.role === 'student' && user.member_id;
}

function canManageDevices(user) {
  return user && ['owner', 'admin'].includes(user.role);
}

async function loadAccessContext(db, gymId, memberId) {
  const result = await db(
    `SELECT m.id AS member_id,
            m.status AS member_status,
            ms.id AS membership_id,
            ms.status AS membership_status,
            ms.ends_at AS membership_ends_at,
            p.oldest_unpaid_due_date,
            current_date AS today
     FROM members m
     LEFT JOIN LATERAL (
       SELECT id, status, ends_at
       FROM memberships
       WHERE gym_id = m.gym_id AND member_id = m.id
       ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, ends_at DESC, created_at DESC
       LIMIT 1
     ) ms ON true
     LEFT JOIN LATERAL (
       SELECT min(due_date) AS oldest_unpaid_due_date
       FROM payments
       WHERE gym_id = m.gym_id
         AND member_id = m.id
         AND status IN ('pending', 'overdue')
     ) p ON true
     WHERE m.gym_id = $1 AND m.id = $2
     LIMIT 1`,
    [gymId, memberId]
  );

  const row = result.rows[0];
  if (!row) {
    return evaluateAccess({ memberActive: false, graceDays });
  }

  return {
    ...evaluateAccess({
      memberActive: row.member_status === 'active',
      membershipStatus: row.membership_status,
      membershipEndsAt: row.membership_ends_at,
      oldestUnpaidDueDate: row.oldest_unpaid_due_date,
      today: row.today,
      graceDays
    }),
    membership_id: row.membership_id || null,
    membership_ends_at: row.membership_ends_at || null,
    oldest_unpaid_due_date: row.oldest_unpaid_due_date || null
  };
}

async function insertDecision(db, input) {
  const result = await db(
    `INSERT INTO access_decisions
       (gym_id, member_id, device_id, token_id, checkin_id, source, allowed, status, reason, overdue_days, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     RETURNING id, allowed, status, reason, overdue_days, message, decided_at, checkin_id`,
    [
      input.gymId,
      input.memberId,
      input.deviceId || null,
      input.tokenId || null,
      input.checkinId || null,
      input.source || 'student_qr',
      input.access.allowed,
      input.access.status,
      input.access.reason,
      input.access.overdue_days || 0,
      input.access.message || null,
      JSON.stringify(input.metadata || {})
    ]
  );
  return result.rows[0];
}

async function createDevice(req, res, user, helpers) {
  const { send, body, query } = helpers;
  if (!canManageDevices(user)) return send(res, 403, { error: 'sem_permissao' });
  const input = await body(req);
  if (!input.name) return send(res, 400, { error: 'nome_obrigatorio' });

  const apiKey = newApiKey();
  const result = await query(
    `INSERT INTO access_devices (gym_id, name, code, api_key_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, code, is_active, created_at`,
    [user.gym_id, String(input.name).trim(), deviceCode(input.code || input.name), sha256(apiKey)]
  );

  return send(res, 201, {
    ...result.rows[0],
    api_key: apiKey,
    warning: 'Guarde esta chave agora. Ela nao sera exibida novamente.'
  });
}

async function listDevices(res, user, helpers) {
  const { send, query } = helpers;
  if (!canManageDevices(user)) return send(res, 403, { error: 'sem_permissao' });
  const result = await query(
    `SELECT id, name, code, is_active, last_seen_at, created_at, updated_at
     FROM access_devices WHERE gym_id = $1 ORDER BY name`,
    [user.gym_id]
  );
  return send(res, 200, { data: result.rows });
}

async function studentStatus(res, user, helpers) {
  const { send, query } = helpers;
  if (!isStudent(user)) return send(res, 403, { error: 'acesso_exclusivo_aluno' });
  const access = await loadAccessContext(query, user.gym_id, user.member_id);
  return send(res, 200, { access });
}

async function createStudentQr(req, res, user, helpers) {
  const { send, query } = helpers;
  if (!isStudent(user)) return send(res, 403, { error: 'acesso_exclusivo_aluno' });

  const access = await loadAccessContext(query, user.gym_id, user.member_id);
  if (!access.allowed) {
    await insertDecision(query, {
      gymId: user.gym_id,
      memberId: user.member_id,
      source: 'student_qr_request',
      access
    });
    return send(res, 200, { generated: false, access });
  }

  const token = newQrToken();
  const expiresAt = new Date(Date.now() + qrTtlSeconds * 1000);

  await query(
    `UPDATE student_access_tokens
     SET used_at = now()
     WHERE gym_id = $1 AND member_id = $2 AND used_at IS NULL`,
    [user.gym_id, user.member_id]
  );
  await query(
    `DELETE FROM student_access_tokens
     WHERE expires_at < now() - interval '1 day' OR used_at < now() - interval '1 day'`
  );

  const result = await query(
    `INSERT INTO student_access_tokens
       (gym_id, member_id, member_account_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at, expires_at`,
    [user.gym_id, user.member_id, user.sub, sha256(token), expiresAt]
  );

  return send(res, 201, {
    generated: true,
    qr_payload: `academia://access/student?token=${encodeURIComponent(token)}`,
    token_id: result.rows[0].id,
    created_at: result.rows[0].created_at,
    expires_at: result.rows[0].expires_at,
    ttl_seconds: qrTtlSeconds,
    one_time_use: true,
    access
  });
}

async function authenticateDevice(req, helpers) {
  const apiKey = String(req.headers['x-access-device-key'] || '').trim();
  if (!apiKey) return null;
  const result = await helpers.query(
    `SELECT id, gym_id, name, code
     FROM access_devices
     WHERE api_key_hash = $1 AND is_active = true
     LIMIT 1`,
    [sha256(apiKey)]
  );
  return result.rows[0] || null;
}

async function redeemStudentQr(req, res, helpers) {
  const { send, body } = helpers;
  const device = await authenticateDevice(req, helpers);
  if (!device) return send(res, 401, { error: 'dispositivo_nao_autorizado' });

  const input = await body(req);
  const token = extractQrToken(input.qr_payload || input.token || input.code);
  if (!token) return send(res, 400, { error: 'qr_invalido' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tokenResult = await client.query(
      `SELECT id, gym_id, member_id, expires_at
       FROM student_access_tokens
       WHERE token_hash = $1
         AND gym_id = $2
         AND used_at IS NULL
         AND expires_at > now()
       FOR UPDATE`,
      [sha256(token), device.gym_id]
    );

    const accessToken = tokenResult.rows[0];
    if (!accessToken) {
      await client.query('ROLLBACK');
      return send(res, 410, {
        allowed: false,
        action: 'deny',
        status: 'blocked',
        reason: 'qr_invalid_or_expired',
        message: 'QR Code invalido, expirado ou ja utilizado.'
      });
    }

    await client.query('UPDATE student_access_tokens SET used_at = now() WHERE id = $1', [accessToken.id]);
    const access = await loadAccessContext(client.query.bind(client), device.gym_id, accessToken.member_id);

    let checkin = null;
    if (access.allowed) {
      const checkinResult = await client.query(
        `INSERT INTO checkins (gym_id, member_id, source, created_by)
         VALUES ($1, $2, 'student_qr', NULL)
         RETURNING id, member_id, checked_at, source`,
        [device.gym_id, accessToken.member_id]
      );
      checkin = checkinResult.rows[0];
    }

    const decision = await insertDecision(client.query.bind(client), {
      gymId: device.gym_id,
      memberId: accessToken.member_id,
      deviceId: device.id,
      tokenId: accessToken.id,
      checkinId: checkin && checkin.id,
      access,
      metadata: { device_code: device.code }
    });

    await client.query('UPDATE access_devices SET last_seen_at = now(), updated_at = now() WHERE id = $1', [device.id]);
    await client.query('COMMIT');

    return send(res, 200, {
      allowed: access.allowed,
      action: access.allowed ? 'unlock' : 'deny',
      access,
      decision,
      checkin,
      device: { id: device.id, name: device.name, code: device.code }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function recentDecisions(res, user, helpers) {
  const { send, query } = helpers;
  if (!canManageDevices(user)) return send(res, 403, { error: 'sem_permissao' });
  const result = await query(
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
  );
  return send(res, 200, { data: result.rows });
}

async function handleAccessRoutes(req, res, user, url, helpers) {
  if (req.method === 'POST' && url.pathname === '/api/access/redeem-student-qr') {
    return redeemStudentQr(req, res, helpers);
  }

  if (!user) return false;

  if (req.method === 'GET' && url.pathname === '/api/student/access/status') {
    return studentStatus(res, user, helpers);
  }
  if (req.method === 'POST' && url.pathname === '/api/student/access/qr') {
    return createStudentQr(req, res, user, helpers);
  }
  if (req.method === 'GET' && url.pathname === '/api/access/devices') {
    return listDevices(res, user, helpers);
  }
  if (req.method === 'POST' && url.pathname === '/api/access/devices') {
    return createDevice(req, res, user, helpers);
  }
  if (req.method === 'GET' && url.pathname === '/api/access/decisions/recent') {
    return recentDecisions(res, user, helpers);
  }

  return false;
}

module.exports = { handleAccessRoutes, loadAccessContext };
