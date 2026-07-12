const http = require('http');
const { URL } = require('url');
const { pool, query } = require('./lib/db');
const { hashPassword, verifyPassword, validatePassword, signToken, verifyToken } = require('./lib/security');
const { canAccess } = require('./lib/accessControl');
const { applySecurityHeaders, isOriginAllowed, consumeRateLimit } = require('./lib/httpSecurity');
const { handleMemberships } = require('./features/memberships');
const { handlePayments } = require('./features/payments');
const { handleAdminRoutes } = require('./features/adminRoutes');
const { handleMemberDetailRoutes } = require('./features/memberDetailRoutes');
const { handleTrainingRoutes } = require('./features/trainingRoutes');
const { handleTrainingPlansRoutes } = require('./features/trainingPlansRoutes');
const { handleStudentRoutes } = require('./features/studentRoutes');
const { handleOnlineSignupRoutes } = require('./features/onlineSignupRoutes');
const { handleAccessRoutes } = require('./features/accessRoutes');
const { handleProductToolsRoutes } = require('./features/productToolsRoutes');
const { handleMemberWorkspaceRoutes } = require('./features/memberWorkspaceRoutes');
const { handleStudentClassRoutes } = require('./features/studentClassRoutes');
const { handleManagementRoutes } = require('./features/managementRoutes');
const { handleEngagementRoutes } = require('./features/engagementRoutes');
const { handleFinanceSalesRoutes } = require('./features/financeSalesRoutes');

const port = Number(process.env.PORT || 3004);
const bodyLimit = Number(process.env.REQUEST_BODY_LIMIT_BYTES || 1024 * 1024);
const loginRateMax = Number(process.env.LOGIN_RATE_LIMIT_MAX || 10);
const loginRateWindowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);

function send(req, res, status, data) {
  applySecurityHeaders(req, res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > bodyLimit) {
      const error = new Error('payload_muito_grande');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    const error = new Error('json_invalido');
    error.statusCode = 400;
    throw error;
  }
}

function slug(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

function auth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return verifyToken(token);
}

function enforceRateLimit(req, res, key) {
  const result = consumeRateLimit(req, key, { max: loginRateMax, windowMs: loginRateWindowMs });
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  if (result.allowed) return true;
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))));
  send(req, res, 429, { error: 'muitas_tentativas' });
  return false;
}

async function registerGym(req, res) {
  const input = await body(req);
  if (!input.gymName || !input.ownerName || !input.email || !input.password) return send(req, res, 400, { error: 'dados_invalidos' });
  const passwordCheck = validatePassword(input.password);
  if (!passwordCheck.valid) return send(req, res, 400, { error: passwordCheck.error });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [input.email]);
    if (exists.rowCount) {
      await client.query('ROLLBACK');
      return send(req, res, 409, { error: 'email_ja_cadastrado' });
    }
    const gym = await client.query('INSERT INTO gyms (name, slug) VALUES ($1, $2) RETURNING id', [input.gymName, `${slug(input.gymName)}-${Date.now().toString(36)}`]);
    const gymId = gym.rows[0].id;
    const pass = hashPassword(input.password);
    const user = await client.query("INSERT INTO users (gym_id, name, email, password_hash, role) VALUES ($1, $2, lower($3), $4, 'owner') RETURNING id, role", [gymId, input.ownerName, input.email, pass]);
    await client.query("INSERT INTO plans (gym_id, name, price_cents, duration_days) VALUES ($1, 'Mensal', 0, 30)", [gymId]);
    await client.query('COMMIT');
    const token = signToken({ sub: user.rows[0].id, gym_id: gymId, role: user.rows[0].role });
    return send(req, res, 201, { token, gym_id: gymId, user_id: user.rows[0].id });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function login(req, res) {
  const input = await body(req);
  if (!input.email || !input.password) return send(req, res, 400, { error: 'dados_invalidos' });
  const result = await query('SELECT id, gym_id, name, email, password_hash, role, is_active FROM users WHERE lower(email) = lower($1) LIMIT 1', [input.email]);
  const user = result.rows[0];
  if (!user || !user.is_active || !verifyPassword(input.password, user.password_hash)) return send(req, res, 401, { error: 'credenciais_invalidas' });
  const token = signToken({ sub: user.id, gym_id: user.gym_id, role: user.role });
  return send(req, res, 200, { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, gym_id: user.gym_id } });
}

async function listMembers(req, res, user) {
  const result = await query('SELECT id, name, email, phone, status, created_at FROM members WHERE gym_id = $1 ORDER BY created_at DESC LIMIT 100', [user.gym_id]);
  return send(req, res, 200, { data: result.rows });
}

async function createMember(req, res, user) {
  const input = await body(req);
  if (!input.name) return send(req, res, 400, { error: 'nome_obrigatorio' });
  const result = await query('INSERT INTO members (gym_id, name, email, phone) VALUES ($1, $2, $3, $4) RETURNING id, name, email, phone, status, created_at', [user.gym_id, input.name, input.email || null, input.phone || null]);
  return send(req, res, 201, result.rows[0]);
}

async function listPlans(req, res, user) {
  const result = await query('SELECT id, name, price_cents, duration_days, is_active, created_at FROM plans WHERE gym_id = $1 ORDER BY name ASC', [user.gym_id]);
  return send(req, res, 200, { data: result.rows });
}

async function createPlan(req, res, user) {
  const input = await body(req);
  if (!input.name) return send(req, res, 400, { error: 'nome_obrigatorio' });
  const result = await query('INSERT INTO plans (gym_id, name, price_cents, duration_days) VALUES ($1, $2, $3, $4) RETURNING id, name, price_cents, duration_days, is_active, created_at', [user.gym_id, input.name, Number(input.price_cents || 0), Number(input.duration_days || 30)]);
  return send(req, res, 201, result.rows[0]);
}

async function createCheckin(req, res, user) {
  const input = await body(req);
  const member = await query('SELECT id FROM members WHERE id = $1 AND gym_id = $2 AND status = $3', [input.member_id, user.gym_id, 'active']);
  if (!member.rowCount) return send(req, res, 404, { error: 'aluno_nao_encontrado' });
  const result = await query('INSERT INTO checkins (gym_id, member_id, source, created_by) VALUES ($1, $2, $3, $4) RETURNING id, member_id, checked_at, source', [user.gym_id, input.member_id, input.source || 'manual', user.sub]);
  return send(req, res, 201, result.rows[0]);
}

async function recentCheckins(req, res, user) {
  const result = await query('SELECT c.id, c.checked_at, c.source, m.id AS member_id, m.name AS member_name FROM checkins c INNER JOIN members m ON m.id = c.member_id WHERE c.gym_id = $1 ORDER BY c.checked_at DESC LIMIT 50', [user.gym_id]);
  return send(req, res, 200, { data: result.rows });
}

async function dashboard(req, res, user) {
  const result = await query("SELECT (SELECT count(*) FROM members WHERE gym_id = $1 AND status = 'active') AS active_members, (SELECT count(*) FROM plans WHERE gym_id = $1 AND is_active = true) AS active_plans, (SELECT count(*) FROM memberships WHERE gym_id = $1 AND status = 'active') AS active_memberships, (SELECT count(*) FROM checkins WHERE gym_id = $1 AND checked_at >= current_date) AS today_checkins, (SELECT count(*) FROM payments WHERE gym_id = $1 AND status = 'pending') AS pending_payments", [user.gym_id]);
  const row = result.rows[0];
  return send(req, res, 200, { active_members: Number(row.active_members), active_plans: Number(row.active_plans), active_memberships: Number(row.active_memberships), today_checkins: Number(row.today_checkins), pending_payments: Number(row.pending_payments) });
}

const server = http.createServer(async (req, res) => {
  try {
    applySecurityHeaders(req, res);
    if (!isOriginAllowed(req)) return send(req, res, 403, { error: 'origem_nao_permitida' });
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'OPTIONS') return send(req, res, 204, {});
    if (req.method === 'GET' && url.pathname === '/health') return send(req, res, 200, { status: 'ok', service: 'academia-api', version: '0.8.0', uptime: process.uptime() });
    if (req.method === 'POST' && url.pathname === '/api/auth/register-gym') {
      if (!enforceRateLimit(req, res, 'register')) return;
      return registerGym(req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      if (!enforceRateLimit(req, res, 'admin-login')) return;
      return login(req, res);
    }

    const helpers = { send: (response, status, data) => send(req, response, status, data), body, query };
    const publicFinanceHandled = await handleFinanceSalesRoutes(req, res, null, url, helpers);
    if (publicFinanceHandled !== false) return publicFinanceHandled;
    if (url.pathname.startsWith('/api/public')) return handleMemberDetailRoutes(req, res, null, url, helpers);
    if (req.method === 'POST' && url.pathname === '/api/student/auth/login') {
      if (!enforceRateLimit(req, res, 'student-login')) return;
      return handleStudentRoutes(req, res, null, url, helpers);
    }

    const publicAccessHandled = await handleAccessRoutes(req, res, null, url, helpers);
    if (publicAccessHandled !== false) return publicAccessHandled;
    const publicToolsHandled = await handleProductToolsRoutes(req, res, null, url, helpers);
    if (publicToolsHandled !== false) return publicToolsHandled;
    const publicEngagementHandled = await handleEngagementRoutes(req, res, null, url, helpers);
    if (publicEngagementHandled !== false) return publicEngagementHandled;

    const user = auth(req);
    if (!user) return send(req, res, 401, { error: 'nao_autorizado' });
    if (!canAccess(user, req.method, url.pathname)) return send(req, res, 403, { error: 'acesso_negado' });

    const signupHandled = await handleOnlineSignupRoutes(req, res, user, url, helpers);
    if (signupHandled !== false) return signupHandled;
    const studentHandled = await handleStudentRoutes(req, res, user, url, helpers);
    if (studentHandled !== false) return studentHandled;
    const accessHandled = await handleAccessRoutes(req, res, user, url, helpers);
    if (accessHandled !== false) return accessHandled;
    const productToolsHandled = await handleProductToolsRoutes(req, res, user, url, helpers);
    if (productToolsHandled !== false) return productToolsHandled;
    const memberWorkspaceHandled = await handleMemberWorkspaceRoutes(req, res, user, url, helpers);
    if (memberWorkspaceHandled !== false) return memberWorkspaceHandled;
    const studentClassHandled = await handleStudentClassRoutes(req, res, user, url, helpers);
    if (studentClassHandled !== false) return studentClassHandled;
    const managementHandled = await handleManagementRoutes(req, res, user, url, helpers);
    if (managementHandled !== false) return managementHandled;
    const engagementHandled = await handleEngagementRoutes(req, res, user, url, helpers);
    if (engagementHandled !== false) return engagementHandled;
    const financeSalesHandled = await handleFinanceSalesRoutes(req, res, user, url, helpers);
    if (financeSalesHandled !== false) return financeSalesHandled;
    const trainingHandled = await handleTrainingRoutes(req, res, user, url, helpers);
    if (trainingHandled !== false) return trainingHandled;
    const trainingPlansHandled = await handleTrainingPlansRoutes(req, res, user, url, helpers);
    if (trainingPlansHandled !== false) return trainingPlansHandled;
    const adminHandled = await handleAdminRoutes(req, res, user, url, helpers);
    if (adminHandled !== false) return adminHandled;

    if (req.method === 'GET' && url.pathname === '/api/members') return listMembers(req, res, user);
    if (req.method === 'POST' && url.pathname === '/api/members') return createMember(req, res, user);
    if (req.method === 'GET' && url.pathname === '/api/plans') return listPlans(req, res, user);
    if (req.method === 'POST' && url.pathname === '/api/plans') return createPlan(req, res, user);

    const membershipsHandled = await handleMemberships(req, res, user, url, helpers);
    if (membershipsHandled !== false) return membershipsHandled;
    if (req.method === 'POST' && url.pathname === '/api/checkins') return createCheckin(req, res, user);
    if (req.method === 'GET' && url.pathname === '/api/checkins/recent') return recentCheckins(req, res, user);
    const paymentsHandled = await handlePayments(req, res, user, url, helpers);
    if (paymentsHandled !== false) return paymentsHandled;
    if (req.method === 'GET' && url.pathname === '/api/dashboard/summary') return dashboard(req, res, user);
    return send(req, res, 404, { error: 'not_found' });
  } catch (error) {
    if (error && error.statusCode) return send(req, res, error.statusCode, { error: error.message || 'erro_requisicao' });
    console.error(error);
    return send(req, res, 500, { error: 'internal_error' });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`academia-api listening on ${port}`));
