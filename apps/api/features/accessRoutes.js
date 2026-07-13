const crypto = require('crypto');
const { pool } = require('../lib/db');
const { DEFAULT_GRACE_DAYS, evaluateAccess } = require('../lib/accessPolicy');
const { hasModulePermission } = require('../lib/accessControl');

const credentialTtlSeconds = Math.min(120, Math.max(15, Number(process.env.ACCESS_QR_TTL_SECONDS || 30)));
const graceDays = Math.min(60, Math.max(0, Number(process.env.ACCESS_GRACE_DAYS || DEFAULT_GRACE_DAYS)));
const offlinePinFailureLimit = Math.min(10, Math.max(3, Number(process.env.ACCESS_OFFLINE_PIN_FAILURE_LIMIT || 5)));
const offlinePinWindowMinutes = Math.min(30, Math.max(1, Number(process.env.ACCESS_OFFLINE_PIN_WINDOW_MINUTES || 5)));

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function signingSecret() {
  return String(process.env.AUTH_SECRET || 'development-only-secret-not-for-production');
}

function safeEqualText(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function newApiKey() {
  return `acad_${crypto.randomBytes(32).toString('base64url')}`;
}

function newQrToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function newAccessCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function newRegistrationNumber() {
  return crypto.randomInt(100000, 1000000).toString();
}

function normalizeAccessCode(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 6 ? digits : '';
}

function normalizeRegistrationNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 6 ? digits : '';
}

function normalizeOfflinePin(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 4 ? digits : '';
}

function deriveOfflinePin(seed, gymId, memberId) {
  if (!seed || !gymId || !memberId) return '';
  const digest = crypto
    .createHmac('sha256', signingSecret())
    .update(`${gymId}:${memberId}:${seed}`)
    .digest();
  return (digest.readUInt32BE(0) % 10000).toString().padStart(4, '0');
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
  return hasModulePermission(user, 'access');
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

async function uniqueAccessCode(query, gymId) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = newAccessCode();
    const existing = await query(
      `SELECT id FROM student_access_tokens
       WHERE gym_id = $1 AND code_hash = $2 AND used_at IS NULL AND expires_at > now()
       LIMIT 1`,
      [gymId, sha256(code)]
    );
    if (!existing.rowCount) return code;
  }
  throw new Error('nao_foi_possivel_gerar_codigo');
}

async function ensureOfflineCredential(query, gymId, memberId, options = {}) {
  let member = await query(
    `SELECT id, gym_id, name, status, access_number, offline_pin_seed
     FROM members WHERE id = $1 AND gym_id = $2 LIMIT 1`,
    [memberId, gymId]
  );
  if (!member.rowCount) return null;

  let row = member.rows[0];
  const rotatePin = options.rotatePin === true;
  const nextSeed = rotatePin || !row.offline_pin_seed ? crypto.randomBytes(32).toString('base64url') : row.offline_pin_seed;

  if (!row.access_number) {
    let updated = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = newRegistrationNumber();
      try {
        const result = await query(
          `UPDATE members
           SET access_number = $3, offline_pin_seed = $4, updated_at = now()
           WHERE id = $1 AND gym_id = $2
           RETURNING id, gym_id, name, status, access_number, offline_pin_seed`,
          [memberId, gymId, candidate, nextSeed]
        );
        updated = result.rows[0] || null;
        if (updated) break;
      } catch (error) {
        if (error?.code !== '23505') throw error;
      }
    }
    if (!updated) throw new Error('nao_foi_possivel_gerar_matricula');
    row = updated;
  } else if (rotatePin || !row.offline_pin_seed) {
    const updated = await query(
      `UPDATE members
       SET offline_pin_seed = $3, updated_at = now()
       WHERE id = $1 AND gym_id = $2
       RETURNING id, gym_id, name, status, access_number, offline_pin_seed`,
      [memberId, gymId, nextSeed]
    );
    row = updated.rows[0];
  }

  return {
    member_id: row.id,
    member_name: row.name,
    member_status: row.status,
    registration_number: row.access_number,
    offline_pin: deriveOfflinePin(row.offline_pin_seed, row.gym_id, row.id)
  };
}

async function createCredentialRecord(query, input) {
  const token = newQrToken();
  const accessCode = await uniqueAccessCode(query, input.gymId);
  const expiresAt = new Date(Date.now() + credentialTtlSeconds * 1000);

  if (input.invalidateExisting !== false) {
    await query(
      `UPDATE student_access_tokens
       SET used_at = now()
       WHERE gym_id = $1 AND member_id = $2 AND used_at IS NULL`,
      [input.gymId, input.memberId]
    );
  }

  await query(
    `DELETE FROM student_access_tokens
     WHERE expires_at < now() - interval '1 day' OR used_at < now() - interval '1 day'`
  );

  const result = await query(
    `INSERT INTO student_access_tokens
       (gym_id, member_id, member_account_id, token_hash, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at, expires_at`,
    [
      input.gymId,
      input.memberId,
      input.memberAccountId || null,
      sha256(token),
      sha256(accessCode),
      expiresAt
    ]
  );

  return {
    generated: true,
    credential_type: 'dynamic_one_time',
    qr_payload: `academia://access/student?token=${encodeURIComponent(token)}`,
    access_code: accessCode,
    token_id: result.rows[0].id,
    created_at: result.rows[0].created_at,
    expires_at: result.rows[0].expires_at,
    ttl_seconds: credentialTtlSeconds,
    one_time_use: true,
    member_id: input.memberId
  };
}

async function createStudentCredential(req, res, user, helpers) {
  const { send, query } = helpers;
  if (!isStudent(user)) return send(res, 403, { error: 'acesso_exclusivo_aluno' });

  const access = await loadAccessContext(query, user.gym_id, user.member_id);
  if (!access.allowed) {
    await insertDecision(query, {
      gymId: user.gym_id,
      memberId: user.member_id,
      source: 'student_credential_request',
      access
    });
    return send(res, 200, { generated: false, access });
  }

  const credential = await createCredentialRecord(query, {
    gymId: user.gym_id,
    memberId: user.member_id,
    memberAccountId: user.sub,
    invalidateExisting: true
  });
  return send(res, 201, { ...credential, access });
}

async function studentOfflineCredential(res, user, helpers) {
  const { send, query } = helpers;
  if (!isStudent(user)) return send(res, 403, { error: 'acesso_exclusivo_aluno' });
  const [offline, access] = await Promise.all([
    ensureOfflineCredential(query, user.gym_id, user.member_id),
    loadAccessContext(query, user.gym_id, user.member_id)
  ]);
  if (!offline) return send(res, 404, { error: 'aluno_nao_encontrado' });
  return send(res, 200, {
    ...offline,
    access,
    works_without_phone_internet: true,
    instruction: 'Na catraca, informe a matricula de 6 digitos e o PIN de 4 digitos.'
  });
}

async function adminCredentialPreview(req, res, user, helpers) {
  const { send, body, query } = helpers;
  if (!canManageDevices(user)) return send(res, 403, { error: 'sem_permissao' });
  const input = await body(req);
  if (!input.member_id) return send(res, 400, { error: 'aluno_obrigatorio' });

  const offline = await ensureOfflineCredential(query, user.gym_id, input.member_id);
  if (!offline) return send(res, 404, { error: 'aluno_nao_encontrado' });
  const access = await loadAccessContext(query, user.gym_id, input.member_id);

  let dynamic = { generated: false };
  if (access.allowed) {
    dynamic = await createCredentialRecord(query, {
      gymId: user.gym_id,
      memberId: input.member_id,
      memberAccountId: null,
      invalidateExisting: false
    });
  }

  return send(res, 200, {
    member: {
      id: offline.member_id,
      name: offline.member_name,
      status: offline.member_status
    },
    offline: {
      registration_number: offline.registration_number,
      pin: offline.offline_pin,
      works_without_phone_internet: true
    },
    dynamic,
    access
  });
}

async function resetMemberOfflinePin(req, res, user, helpers) {
  const { send, body, query } = helpers;
  if (!canManageDevices(user)) return send(res, 403, { error: 'sem_permissao' });
  const input = await body(req);
  if (!input.member_id) return send(res, 400, { error: 'aluno_obrigatorio' });
  const offline = await ensureOfflineCredential(query, user.gym_id, input.member_id, { rotatePin: true });
  if (!offline) return send(res, 404, { error: 'aluno_nao_encontrado' });
  return send(res, 200, {
    member_id: offline.member_id,
    registration_number: offline.registration_number,
    pin: offline.offline_pin,
    status: 'pin_redefinido'
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

async function redeemOfflinePin(req, res, helpers, device, input) {
  const { send } = helpers;
  const registrationNumber = normalizeRegistrationNumber(input.registration_number || input.registration || input.member_number);
  const pin = normalizeOfflinePin(input.pin || input.offline_pin);
  if (!registrationNumber || !pin) return send(res, 400, { error: 'matricula_e_pin_obrigatorios' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const memberResult = await client.query(
      `SELECT id, gym_id, name, offline_pin_seed
       FROM members
       WHERE gym_id = $1 AND access_number = $2
       LIMIT 1
       FOR UPDATE`,
      [device.gym_id, registrationNumber]
    );
    const member = memberResult.rows[0];
    if (!member || !member.offline_pin_seed) {
      await client.query('ROLLBACK');
      return send(res, 401, {
        allowed: false,
        action: 'deny',
        reason: 'registration_or_pin_invalid',
        message: 'Matricula ou PIN invalido.'
      });
    }

    const failures = await client.query(
      `SELECT count(*)::integer AS total
       FROM access_decisions
       WHERE gym_id = $1
         AND member_id = $2
         AND device_id = $3
         AND source = 'student_offline_pin'
         AND reason = 'invalid_pin'
         AND decided_at > now() - ($4::text || ' minutes')::interval`,
      [device.gym_id, member.id, device.id, offlinePinWindowMinutes]
    );
    if (Number(failures.rows[0]?.total || 0) >= offlinePinFailureLimit) {
      await client.query('ROLLBACK');
      return send(res, 429, {
        allowed: false,
        action: 'deny',
        reason: 'pin_temporarily_blocked',
        message: 'Muitas tentativas. Aguarde alguns minutos.'
      });
    }

    const expectedPin = deriveOfflinePin(member.offline_pin_seed, member.gym_id, member.id);
    if (!safeEqualText(pin, expectedPin)) {
      const deniedAccess = {
        allowed: false,
        status: 'blocked',
        reason: 'invalid_pin',
        overdue_days: 0,
        message: 'Matricula ou PIN invalido.'
      };
      await insertDecision(client.query.bind(client), {
        gymId: device.gym_id,
        memberId: member.id,
        deviceId: device.id,
        source: 'student_offline_pin',
        access: deniedAccess,
        metadata: { device_code: device.code, credential_type: 'registration_pin' }
      });
      await client.query('UPDATE access_devices SET last_seen_at = now(), updated_at = now() WHERE id = $1', [device.id]);
      await client.query('COMMIT');
      return send(res, 401, {
        allowed: false,
        action: 'deny',
        reason: deniedAccess.reason,
        message: deniedAccess.message
      });
    }

    const access = await loadAccessContext(client.query.bind(client), device.gym_id, member.id);
    let checkin = null;
    if (access.allowed) {
      const checkinResult = await client.query(
        `INSERT INTO checkins (gym_id, member_id, source, created_by)
         VALUES ($1, $2, 'student_offline_pin', NULL)
         RETURNING id, member_id, checked_at, source`,
        [device.gym_id, member.id]
      );
      checkin = checkinResult.rows[0];
    }

    const decision = await insertDecision(client.query.bind(client), {
      gymId: device.gym_id,
      memberId: member.id,
      deviceId: device.id,
      checkinId: checkin && checkin.id,
      source: 'student_offline_pin',
      access,
      metadata: { device_code: device.code, credential_type: 'registration_pin' }
    });

    await client.query('UPDATE access_devices SET last_seen_at = now(), updated_at = now() WHERE id = $1', [device.id]);
    await client.query('COMMIT');

    return send(res, 200, {
      allowed: access.allowed,
      action: access.allowed ? 'unlock' : 'deny',
      credential_type: 'registration_pin',
      member: { id: member.id, name: member.name },
      access,
      decision,
      checkin,
      device: { id: device.id, name: device.name, code: device.code }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function redeemDynamicCredential(req, res, helpers, device, input) {
  const { send } = helpers;
  const accessCode = normalizeAccessCode(input.code || input.access_code);
  const token = accessCode ? '' : extractQrToken(input.qr_payload || input.token);
  if (!token && !accessCode) return send(res, 400, { error: 'credencial_invalida' });

  const credentialSource = accessCode ? 'student_code' : 'student_qr';
  const lookupColumn = accessCode ? 'code_hash' : 'token_hash';
  const lookupHash = sha256(accessCode || token);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tokenResult = await client.query(
      `SELECT id, gym_id, member_id, expires_at
       FROM student_access_tokens
       WHERE ${lookupColumn} = $1
         AND gym_id = $2
         AND used_at IS NULL
         AND expires_at > now()
       FOR UPDATE`,
      [lookupHash, device.gym_id]
    );

    const accessToken = tokenResult.rows[0];
    if (!accessToken) {
      await client.query('ROLLBACK');
      return send(res, 410, {
        allowed: false,
        action: 'deny',
        status: 'blocked',
        reason: 'credential_invalid_or_expired',
        message: 'QR Code ou codigo invalido, expirado ou ja utilizado.'
      });
    }

    await client.query('UPDATE student_access_tokens SET used_at = now() WHERE id = $1', [accessToken.id]);
    const access = await loadAccessContext(client.query.bind(client), device.gym_id, accessToken.member_id);

    let checkin = null;
    if (access.allowed) {
      const checkinResult = await client.query(
        `INSERT INTO checkins (gym_id, member_id, source, created_by)
         VALUES ($1, $2, $3, NULL)
         RETURNING id, member_id, checked_at, source`,
        [device.gym_id, accessToken.member_id, credentialSource]
      );
      checkin = checkinResult.rows[0];
    }

    const decision = await insertDecision(client.query.bind(client), {
      gymId: device.gym_id,
      memberId: accessToken.member_id,
      deviceId: device.id,
      tokenId: accessToken.id,
      checkinId: checkin && checkin.id,
      source: credentialSource,
      access,
      metadata: { device_code: device.code, credential_type: accessCode ? 'numeric_code' : 'qr_code' }
    });

    await client.query('UPDATE access_devices SET last_seen_at = now(), updated_at = now() WHERE id = $1', [device.id]);
    await client.query('COMMIT');

    return send(res, 200, {
      allowed: access.allowed,
      action: access.allowed ? 'unlock' : 'deny',
      credential_type: accessCode ? 'numeric_code' : 'qr_code',
      access,
      decision,
      checkin,
      device: { id: device.id, name: device.name, code: device.code }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function redeemStudentCredential(req, res, helpers) {
  const { send, body } = helpers;
  const device = await authenticateDevice(req, helpers);
  if (!device) return send(res, 401, { error: 'dispositivo_nao_autorizado' });
  const input = await body(req);
  const hasOfflineInput = input.registration_number || input.registration || input.member_number || input.pin || input.offline_pin;
  if (hasOfflineInput) return redeemOfflinePin(req, res, helpers, device, input);
  return redeemDynamicCredential(req, res, helpers, device, input);
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

async function listAccessMembers(res, user, helpers) {
  const { send, query } = helpers;
  if (!canManageDevices(user)) return send(res, 403, { error: 'sem_permissao' });
  const result = await query(
    `SELECT id, name, email, phone, status, created_at
     FROM members
     WHERE gym_id = $1
     ORDER BY name ASC
     LIMIT 500`,
    [user.gym_id]
  );
  return send(res, 200, { data: result.rows });
}

async function handleAccessRoutes(req, res, user, url, helpers) {
  if (req.method === 'POST' && (url.pathname === '/api/access/redeem-student-qr' || url.pathname === '/api/access/redeem-student-credential')) {
    return redeemStudentCredential(req, res, helpers);
  }

  if (!user) return false;

  if (req.method === 'GET' && url.pathname === '/api/student/access/status') {
    return studentStatus(res, user, helpers);
  }
  if (req.method === 'GET' && url.pathname === '/api/student/access/offline-credential') {
    return studentOfflineCredential(res, user, helpers);
  }
  if (req.method === 'POST' && (url.pathname === '/api/student/access/qr' || url.pathname === '/api/student/access/credential')) {
    return createStudentCredential(req, res, user, helpers);
  }
  if (req.method === 'POST' && url.pathname === '/api/access/member-credential/preview') {
    return adminCredentialPreview(req, res, user, helpers);
  }
  if (req.method === 'POST' && url.pathname === '/api/access/member-offline-pin/reset') {
    return resetMemberOfflinePin(req, res, user, helpers);
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
  if (req.method === 'GET' && url.pathname === '/api/access/members') {
    return listAccessMembers(res, user, helpers);
  }

  return false;
}

module.exports = {
  deriveOfflinePin,
  handleAccessRoutes,
  loadAccessContext,
  normalizeAccessCode,
  normalizeOfflinePin,
  normalizeRegistrationNumber
};
