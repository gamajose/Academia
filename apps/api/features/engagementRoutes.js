const crypto = require('crypto');
const { pool } = require('../lib/db');
const { evaluateAccess, DEFAULT_GRACE_DAYS } = require('../lib/accessPolicy');

const challengeTtlSeconds = Math.min(120, Math.max(15, Number(process.env.ACCESS_CHALLENGE_TTL_SECONDS || 30)));
const graceDays = Math.min(60, Math.max(0, Number(process.env.ACCESS_GRACE_DAYS || DEFAULT_GRACE_DAYS)));

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function token() {
  return crypto.randomBytes(32).toString('base64url');
}

function isStudent(user) {
  return user && user.role === 'student' && user.member_id;
}

function isManager(user) {
  return user && ['owner', 'admin'].includes(user.role);
}

function canCoach(user) {
  return user && ['owner', 'admin', 'staff'].includes(user.role);
}

function integer(value, fallback, min = 1, max = 10000) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function extractChallenge(payload) {
  const value = String(payload || '').trim();
  if (!value) return '';
  if (!value.startsWith('academia://')) return value;
  try {
    return new URL(value).searchParams.get('token') || '';
  } catch (_) {
    return '';
  }
}

async function authenticateDevice(req, query) {
  const apiKey = String(req.headers['x-access-device-key'] || '').trim();
  if (!apiKey) return null;
  const result = await query(
    `SELECT id, gym_id, name, code FROM access_devices
     WHERE api_key_hash = $1 AND is_active = true LIMIT 1`,
    [sha256(apiKey)]
  );
  return result.rows[0] || null;
}

async function accessContext(query, gymId, memberId) {
  const result = await query(
    `SELECT m.status AS member_status, ms.id AS membership_id, ms.status AS membership_status,
            ms.ends_at, p.oldest_unpaid_due_date, current_date AS today
     FROM members m
     LEFT JOIN LATERAL (
       SELECT id, status, ends_at FROM memberships
       WHERE gym_id = m.gym_id AND member_id = m.id
       ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, ends_at DESC LIMIT 1
     ) ms ON true
     LEFT JOIN LATERAL (
       SELECT min(due_date) AS oldest_unpaid_due_date FROM payments
       WHERE gym_id = m.gym_id AND member_id = m.id AND status IN ('pending','overdue')
     ) p ON true
     WHERE m.gym_id = $1 AND m.id = $2 LIMIT 1`,
    [gymId, memberId]
  );
  const row = result.rows[0];
  if (!row) return evaluateAccess({ memberActive: false, graceDays });
  return evaluateAccess({
    memberActive: row.member_status === 'active',
    membershipStatus: row.membership_status,
    membershipEndsAt: row.ends_at,
    oldestUnpaidDueDate: row.oldest_unpaid_due_date,
    today: row.today,
    graceDays
  });
}

async function listClasses(res, user, helpers) {
  if (!canCoach(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const result = await helpers.query(
    `SELECT gc.id, gc.name, gc.description, gc.room, gc.capacity, gc.duration_minutes,
            gc.level, gc.required_plan_id, gc.is_active, u.name AS instructor_name,
            count(cs.id) FILTER (WHERE cs.starts_at >= now() AND cs.status = 'scheduled')::integer AS upcoming_sessions
     FROM gym_classes gc
     LEFT JOIN users u ON u.id = gc.instructor_id
     LEFT JOIN class_sessions cs ON cs.class_id = gc.id
     WHERE gc.gym_id = $1
     GROUP BY gc.id, u.name ORDER BY gc.is_active DESC, gc.name`,
    [user.gym_id]
  );
  return helpers.send(res, 200, { data: result.rows });
}

async function saveClass(req, res, user, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.name) return helpers.send(res, 400, { error: 'nome_obrigatorio' });
  let result;
  if (input.class_id) {
    result = await helpers.query(
      `UPDATE gym_classes SET name=$3, description=$4, instructor_id=$5, room=$6,
       capacity=$7, duration_minutes=$8, level=$9, required_plan_id=$10,
       is_active=$11, updated_at=now()
       WHERE id=$1 AND gym_id=$2 RETURNING *`,
      [input.class_id, user.gym_id, input.name, input.description || null, input.instructor_id || null,
       input.room || null, integer(input.capacity, 20), integer(input.duration_minutes, 60),
       input.level || null, input.required_plan_id || null, input.is_active !== false]
    );
  } else {
    result = await helpers.query(
      `INSERT INTO gym_classes
       (gym_id,name,description,instructor_id,room,capacity,duration_minutes,level,required_plan_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [user.gym_id, input.name, input.description || null, input.instructor_id || null,
       input.room || null, integer(input.capacity, 20), integer(input.duration_minutes, 60),
       input.level || null, input.required_plan_id || null]
    );
  }
  return helpers.send(res, input.class_id ? 200 : 201, result.rows[0]);
}

async function saveSession(req, res, user, helpers) {
  if (!canCoach(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.class_id || !input.starts_at) return helpers.send(res, 400, { error: 'dados_invalidos' });
  const classResult = await helpers.query(
    'SELECT id, capacity, duration_minutes, instructor_id FROM gym_classes WHERE id=$1 AND gym_id=$2 AND is_active=true',
    [input.class_id, user.gym_id]
  );
  if (!classResult.rowCount) return helpers.send(res, 404, { error: 'aula_nao_encontrada' });
  const item = classResult.rows[0];
  const startsAt = new Date(input.starts_at);
  if (Number.isNaN(startsAt.getTime())) return helpers.send(res, 400, { error: 'data_invalida' });
  const endsAt = input.ends_at ? new Date(input.ends_at) : new Date(startsAt.getTime() + item.duration_minutes * 60000);
  const result = await helpers.query(
    `INSERT INTO class_sessions (gym_id,class_id,instructor_id,starts_at,ends_at,capacity,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [user.gym_id, item.id, input.instructor_id || item.instructor_id, startsAt, endsAt,
     integer(input.capacity, item.capacity), input.notes || null]
  );
  return helpers.send(res, 201, result.rows[0]);
}

async function studentClasses(res, user, helpers) {
  if (!isStudent(user)) return helpers.send(res, 403, { error: 'acesso_exclusivo_aluno' });
  const result = await helpers.query(
    `SELECT cs.id AS session_id, cs.starts_at, cs.ends_at, cs.capacity, cs.status,
            gc.id AS class_id, gc.name, gc.description, gc.room, gc.level,
            u.name AS instructor_name,
            count(cr.id) FILTER (WHERE cr.status IN ('confirmed','attended'))::integer AS reserved,
            own.status AS reservation_status,
            CASE WHEN count(cr.id) FILTER (WHERE cr.status IN ('confirmed','attended')) < cs.capacity THEN true ELSE false END AS has_spots
     FROM class_sessions cs
     INNER JOIN gym_classes gc ON gc.id = cs.class_id
     LEFT JOIN users u ON u.id = COALESCE(cs.instructor_id, gc.instructor_id)
     LEFT JOIN class_reservations cr ON cr.session_id = cs.id
     LEFT JOIN class_reservations own ON own.session_id = cs.id AND own.member_id = $2
     WHERE cs.gym_id=$1 AND cs.starts_at >= now() - interval '2 hours' AND cs.status='scheduled'
     GROUP BY cs.id, gc.id, u.name, own.status
     ORDER BY cs.starts_at LIMIT 100`,
    [user.gym_id, user.member_id]
  );
  return helpers.send(res, 200, { data: result.rows });
}

async function reserveClass(req, res, user, helpers) {
  if (!isStudent(user)) return helpers.send(res, 403, { error: 'acesso_exclusivo_aluno' });
  const input = await helpers.body(req);
  if (!input.session_id) return helpers.send(res, 400, { error: 'session_id_obrigatorio' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = await client.query(
      `SELECT id, capacity, starts_at FROM class_sessions
       WHERE id=$1 AND gym_id=$2 AND status='scheduled' AND starts_at>now() FOR UPDATE`,
      [input.session_id, user.gym_id]
    );
    if (!session.rowCount) {
      await client.query('ROLLBACK');
      return helpers.send(res, 404, { error: 'horario_indisponivel' });
    }
    const count = await client.query(
      `SELECT count(*)::integer AS total FROM class_reservations
       WHERE session_id=$1 AND status IN ('confirmed','attended')`,
      [input.session_id]
    );
    const status = Number(count.rows[0].total) < session.rows[0].capacity ? 'confirmed' : 'waitlist';
    const result = await client.query(
      `INSERT INTO class_reservations (gym_id,session_id,member_id,status)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (session_id,member_id) DO UPDATE SET status=EXCLUDED.status,
         cancelled_at=NULL, updated_at=now()
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
  if (!isStudent(user)) return helpers.send(res, 403, { error: 'acesso_exclusivo_aluno' });
  const input = await helpers.body(req);
  const result = await helpers.query(
    `UPDATE class_reservations SET status='cancelled', cancelled_at=now(), updated_at=now()
     WHERE session_id=$1 AND member_id=$2 AND gym_id=$3
     RETURNING id,status,cancelled_at`,
    [input.session_id, user.member_id, user.gym_id]
  );
  if (!result.rowCount) return helpers.send(res, 404, { error: 'reserva_nao_encontrada' });
  return helpers.send(res, 200, result.rows[0]);
}

async function roster(res, user, url, helpers) {
  if (!canCoach(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const sessionId = url.searchParams.get('session_id');
  const result = await helpers.query(
    `SELECT cr.id,cr.status,cr.checked_in_at,cr.created_at,m.id AS member_id,m.name AS member_name,m.phone
     FROM class_reservations cr INNER JOIN members m ON m.id=cr.member_id
     WHERE cr.session_id=$1 AND cr.gym_id=$2 ORDER BY cr.status,m.name`,
    [sessionId, user.gym_id]
  );
  return helpers.send(res, 200, { data: result.rows });
}

async function markAttendance(req, res, user, helpers) {
  if (!canCoach(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.reservation_id || !['attended','absent'].includes(input.status)) return helpers.send(res, 400, { error: 'dados_invalidos' });
  const result = await helpers.query(
    `UPDATE class_reservations SET status=$3,
       checked_in_at=CASE WHEN $3='attended' THEN now() ELSE checked_in_at END, updated_at=now()
     WHERE id=$1 AND gym_id=$2 RETURNING *`,
    [input.reservation_id, user.gym_id, input.status]
  );
  if (!result.rowCount) return helpers.send(res, 404, { error: 'reserva_nao_encontrada' });
  return helpers.send(res, 200, result.rows[0]);
}

async function reportsOverview(res, user, url, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const days = Math.min(365, Math.max(7, integer(url.searchParams.get('days'), 30, 7, 365)));
  const [summary, daily, plans, overdue] = await Promise.all([
    helpers.query(
      `SELECT
       (SELECT count(*) FROM members WHERE gym_id=$1 AND status='active')::integer AS active_members,
       (SELECT count(*) FROM members WHERE gym_id=$1 AND created_at>=now()-($2::integer*interval '1 day'))::integer AS new_members,
       (SELECT count(*) FROM checkins WHERE gym_id=$1 AND checked_at>=now()-($2::integer*interval '1 day'))::integer AS checkins,
       (SELECT COALESCE(sum(amount_cents),0) FROM payments WHERE gym_id=$1 AND status='paid' AND paid_at>=now()-($2::integer*interval '1 day'))::bigint AS received_cents,
       (SELECT COALESCE(sum(amount_cents),0) FROM payments WHERE gym_id=$1 AND status IN ('pending','overdue'))::bigint AS outstanding_cents,
       (SELECT count(*) FROM payments WHERE gym_id=$1 AND status IN ('pending','overdue') AND due_date<current_date)::integer AS overdue_payments,
       (SELECT count(*) FROM class_reservations WHERE gym_id=$1 AND status IN ('confirmed','attended') AND created_at>=now()-($2::integer*interval '1 day'))::integer AS class_reservations`,
      [user.gym_id, days]
    ),
    helpers.query(
      `SELECT day::date,
              count(c.id)::integer AS checkins,
              COALESCE(sum(p.amount_cents),0)::bigint AS received_cents
       FROM generate_series(current_date-($2::integer-1),current_date,interval '1 day') day
       LEFT JOIN checkins c ON c.gym_id=$1 AND c.checked_at>=day AND c.checked_at<day+interval '1 day'
       LEFT JOIN payments p ON p.gym_id=$1 AND p.status='paid' AND p.paid_at>=day AND p.paid_at<day+interval '1 day'
       GROUP BY day ORDER BY day`,
      [user.gym_id, days]
    ),
    helpers.query(
      `SELECT p.id,p.name,count(ms.id)::integer AS memberships
       FROM plans p LEFT JOIN memberships ms ON ms.plan_id=p.id AND ms.status='active'
       WHERE p.gym_id=$1 GROUP BY p.id ORDER BY memberships DESC,p.name LIMIT 10`,
      [user.gym_id]
    ),
    helpers.query(
      `SELECT m.id,m.name,min(p.due_date) AS oldest_due_date,
              count(p.id)::integer AS invoices,COALESCE(sum(p.amount_cents),0)::bigint AS total_cents
       FROM payments p INNER JOIN members m ON m.id=p.member_id
       WHERE p.gym_id=$1 AND p.status IN ('pending','overdue') AND p.due_date<current_date
       GROUP BY m.id ORDER BY oldest_due_date LIMIT 50`,
      [user.gym_id]
    )
  ]);
  return helpers.send(res, 200, { days, summary: summary.rows[0], daily: daily.rows, plans: plans.rows, overdue_members: overdue.rows });
}

async function listCommercialPlans(res, user, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const result = await helpers.query(
    `SELECT id,name,description,price_cents,duration_days,enrollment_fee_cents,billing_period,
            access_rules,services_included,auto_renew,cancellation_fee_cents,trial_days,
            is_featured,is_active,updated_at FROM plans WHERE gym_id=$1 ORDER BY is_featured DESC,name`,
    [user.gym_id]
  );
  return helpers.send(res, 200, { data: result.rows });
}

async function saveCommercialPlan(req, res, user, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.plan_id || !input.name) return helpers.send(res, 400, { error: 'dados_invalidos' });
  const result = await helpers.query(
    `UPDATE plans SET name=$3,description=$4,price_cents=$5,duration_days=$6,
       enrollment_fee_cents=$7,billing_period=$8,access_rules=$9::jsonb,
       services_included=$10::jsonb,auto_renew=$11,cancellation_fee_cents=$12,
       trial_days=$13,is_featured=$14,is_active=$15,updated_at=now()
     WHERE id=$1 AND gym_id=$2 RETURNING *`,
    [input.plan_id,user.gym_id,input.name,input.description||null,integer(input.price_cents,0,0),
     integer(input.duration_days,30),integer(input.enrollment_fee_cents,0,0),input.billing_period||'monthly',
     JSON.stringify(input.access_rules||{}),JSON.stringify(input.services_included||[]),input.auto_renew===true,
     integer(input.cancellation_fee_cents,0,0),integer(input.trial_days,0,0),input.is_featured===true,input.is_active!==false]
  );
  if (!result.rowCount) return helpers.send(res,404,{error:'plano_nao_encontrado'});
  return helpers.send(res,200,result.rows[0]);
}

async function createChallenge(req, res, helpers) {
  const device = await authenticateDevice(req, helpers.query);
  if (!device) return helpers.send(res, 401, { error: 'dispositivo_nao_autorizado' });
  const rawToken = token();
  const expiresAt = new Date(Date.now() + challengeTtlSeconds * 1000);
  await helpers.query('UPDATE access_qr_challenges SET used_at=now() WHERE device_id=$1 AND used_at IS NULL', [device.id]);
  const result = await helpers.query(
    `INSERT INTO access_qr_challenges (gym_id,device_id,challenge_hash,expires_at)
     VALUES ($1,$2,$3,$4) RETURNING id,created_at,expires_at`,
    [device.gym_id, device.id, sha256(rawToken), expiresAt]
  );
  await helpers.query('UPDATE access_devices SET last_seen_at=now(),updated_at=now() WHERE id=$1',[device.id]);
  return helpers.send(res,201,{challenge_id:result.rows[0].id,qr_payload:`academia://access/challenge?token=${encodeURIComponent(rawToken)}`,expires_at:result.rows[0].expires_at,ttl_seconds:challengeTtlSeconds});
}

async function redeemChallenge(req, res, user, helpers) {
  if (!isStudent(user)) return helpers.send(res,403,{error:'acesso_exclusivo_aluno'});
  const input=await helpers.body(req);
  const rawToken=extractChallenge(input.qr_payload||input.token);
  if(!rawToken) return helpers.send(res,400,{error:'qr_invalido'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const found=await client.query(
      `SELECT id,gym_id,device_id FROM access_qr_challenges
       WHERE challenge_hash=$1 AND gym_id=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,
      [sha256(rawToken),user.gym_id]
    );
    if(!found.rowCount){await client.query('ROLLBACK');return helpers.send(res,410,{allowed:false,action:'deny',message:'QR expirado ou ja utilizado.'});}
    const challenge=found.rows[0];
    const access=await accessContext(client.query.bind(client),user.gym_id,user.member_id);
    let checkinId=null;
    if(access.allowed){
      const checkin=await client.query("INSERT INTO checkins(gym_id,member_id,source,created_by) VALUES($1,$2,'gym_qr',NULL) RETURNING id",[user.gym_id,user.member_id]);
      checkinId=checkin.rows[0].id;
    }
    const decision=await client.query(
      `INSERT INTO access_decisions(gym_id,member_id,device_id,checkin_id,source,allowed,status,reason,overdue_days,message,metadata)
       VALUES($1,$2,$3,$4,'gym_qr',$5,$6,$7,$8,$9,$10::jsonb) RETURNING id`,
      [user.gym_id,user.member_id,challenge.device_id,checkinId,access.allowed,access.status,access.reason,access.overdue_days||0,access.message||null,JSON.stringify({challenge_id:challenge.id})]
    );
    await client.query('UPDATE access_qr_challenges SET used_at=now(),member_id=$2,access_decision_id=$3,result_status=$4 WHERE id=$1',[challenge.id,user.member_id,decision.rows[0].id,access.allowed?'allowed':'denied']);
    await client.query('COMMIT');
    return helpers.send(res,200,{allowed:access.allowed,action:access.allowed?'unlock':'deny',access,challenge_id:challenge.id});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

async function challengeResult(req,res,url,helpers){
  const device=await authenticateDevice(req,helpers.query);
  if(!device) return helpers.send(res,401,{error:'dispositivo_nao_autorizado'});
  const challengeId=url.searchParams.get('challenge_id');
  const result=await helpers.query(
    `SELECT id,expires_at,used_at,result_status,member_id,access_decision_id,
            CASE WHEN expires_at<=now() AND used_at IS NULL THEN 'expired'
                 WHEN used_at IS NULL THEN 'pending' ELSE result_status END AS status
     FROM access_qr_challenges WHERE id=$1 AND device_id=$2 LIMIT 1`,[challengeId,device.id]);
  if(!result.rowCount) return helpers.send(res,404,{error:'desafio_nao_encontrado'});
  await helpers.query('UPDATE access_devices SET last_seen_at=now(),updated_at=now() WHERE id=$1',[device.id]);
  return helpers.send(res,200,result.rows[0]);
}

async function handleEngagementRoutes(req,res,user,url,helpers){
  if(req.method==='POST'&&url.pathname==='/api/access/device/challenge') return createChallenge(req,res,helpers);
  if(req.method==='GET'&&url.pathname==='/api/access/device/challenge/result') return challengeResult(req,res,url,helpers);
  if(!user) return false;

  if(req.method==='GET'&&url.pathname==='/api/classes') return listClasses(res,user,helpers);
  if(req.method==='POST'&&url.pathname==='/api/classes') return saveClass(req,res,user,helpers);
  if(req.method==='POST'&&url.pathname==='/api/classes/sessions') return saveSession(req,res,user,helpers);
  if(req.method==='GET'&&url.pathname==='/api/classes/session/roster') return roster(res,user,url,helpers);
  if(req.method==='POST'&&url.pathname==='/api/classes/session/attendance') return markAttendance(req,res,user,helpers);

  if(req.method==='GET'&&url.pathname==='/api/student/classes') return studentClasses(res,user,helpers);
  if(req.method==='POST'&&url.pathname==='/api/student/classes/reserve') return reserveClass(req,res,user,helpers);
  if(req.method==='POST'&&url.pathname==='/api/student/classes/cancel') return cancelReservation(req,res,user,helpers);
  if(req.method==='POST'&&url.pathname==='/api/student/access/redeem-challenge') return redeemChallenge(req,res,user,helpers);

  if(req.method==='GET'&&url.pathname==='/api/reports/overview') return reportsOverview(res,user,url,helpers);
  if(req.method==='GET'&&url.pathname==='/api/plans/commercial') return listCommercialPlans(res,user,helpers);
  if(req.method==='POST'&&url.pathname==='/api/plans/commercial') return saveCommercialPlan(req,res,user,helpers);
  return false;
}

module.exports={handleEngagementRoutes,integer,extractChallenge};
