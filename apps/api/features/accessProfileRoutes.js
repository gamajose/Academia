const { recordAudit } = require('../lib/audit');

const PROFILE_ROLES = ['owner', 'admin', 'staff', 'operator'];
const PERMISSION_KEYS = [
  'dashboard', 'members', 'plans', 'memberships', 'pre_enrollments', 'finance',
  'alerts', 'training', 'assessments', 'student_access', 'users', 'account',
  'reports', 'access', 'classes', 'settings', 'audit', 'exports'
];

function canManageAccessProfiles(user) {
  return user && ['owner', 'admin'].includes(user.role);
}

function slugifyProfile(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function defaultPermissions(role) {
  const all = Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true]));
  if (role === 'owner' || role === 'admin') return all;
  if (role === 'operator') return { dashboard: true, access: true, student_access: true, account: true };
  return { dashboard: true, members: true, memberships: true, pre_enrollments: true, alerts: true, student_access: true, account: true };
}

function normalizePermissions(value, role) {
  const source = value && typeof value === 'object' ? value : defaultPermissions(role);
  return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, source[key] === true]));
}

function validateProfileRole(user, role) {
  if (!PROFILE_ROLES.includes(role)) return false;
  if (['owner', 'admin'].includes(role) && user.role !== 'owner') return false;
  return true;
}

async function handleAccessProfileRoutes(req, res, user, url, helpers) {
  if (!url.pathname.startsWith('/api/access-profiles')) return false;
  if (!canManageAccessProfiles(user)) return helpers.send(res, 403, { error: 'sem_permissao' });

  if (req.method === 'GET' && url.pathname === '/api/access-profiles') {
    const result = await helpers.query(
      `SELECT id, slug, name, role_key, permissions, sort_order, is_active, created_at, updated_at
       FROM access_profiles WHERE gym_id = $1 ORDER BY sort_order, name`,
      [user.gym_id]
    );
    return helpers.send(res, 200, { data: result.rows, permission_keys: PERMISSION_KEYS });
  }

  if (req.method === 'POST' && url.pathname === '/api/access-profiles') {
    const input = await helpers.body(req);
    const name = String(input.name || '').trim();
    const roleKey = String(input.role_key || 'staff');
    const slug = slugifyProfile(name);
    if (name.length < 2 || name.length > 60 || !slug || !validateProfileRole(user, roleKey)) return helpers.send(res, 400, { error: 'perfil_invalido' });
    const duplicate = await helpers.query('SELECT id FROM access_profiles WHERE gym_id = $1 AND (lower(name) = lower($2) OR lower(slug) = lower($3)) LIMIT 1', [user.gym_id, name, slug]);
    if (duplicate.rowCount) return helpers.send(res, 409, { error: 'perfil_ja_cadastrado' });
    const order = await helpers.query('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM access_profiles WHERE gym_id = $1', [user.gym_id]);
    const result = await helpers.query(
      `INSERT INTO access_profiles (gym_id, slug, name, role_key, permissions, sort_order)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id, slug, name, role_key, permissions, sort_order, is_active, created_at, updated_at`,
      [user.gym_id, slug, name, roleKey, JSON.stringify(normalizePermissions(input.permissions, roleKey)), Number(order.rows[0]?.next_order || 10)]
    );
    await recordAudit(user, 'create', 'access_profile', result.rows[0].id, { name, role_key: roleKey });
    return helpers.send(res, 201, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/access-profiles/update') {
    const input = await helpers.body(req);
    const name = String(input.name || '').trim();
    if (!input.id || name.length < 2 || name.length > 60) return helpers.send(res, 400, { error: 'perfil_invalido' });
    const existing = await helpers.query('SELECT id, role_key FROM access_profiles WHERE id = $1 AND gym_id = $2 LIMIT 1', [input.id, user.gym_id]);
    if (!existing.rowCount) return helpers.send(res, 404, { error: 'perfil_nao_encontrado' });
    const roleKey = String(input.role_key || existing.rows[0].role_key);
    if (!validateProfileRole(user, roleKey)) return helpers.send(res, 403, { error: 'sem_permissao' });
    if (input.is_active === false) {
      const assigned = await helpers.query('SELECT count(*)::integer AS total FROM users WHERE gym_id = $1 AND access_profile = (SELECT slug FROM access_profiles WHERE id = $2 AND gym_id = $1)', [user.gym_id, input.id]);
      if (Number(assigned.rows[0]?.total || 0) > 0) return helpers.send(res, 409, { error: 'perfil_em_uso' });
    }
    const duplicate = await helpers.query('SELECT id FROM access_profiles WHERE gym_id = $1 AND lower(name) = lower($2) AND id <> $3 LIMIT 1', [user.gym_id, name, input.id]);
    if (duplicate.rowCount) return helpers.send(res, 409, { error: 'perfil_ja_cadastrado' });
    const result = await helpers.query(
      `UPDATE access_profiles SET name = $3, role_key = $4, permissions = $5::jsonb,
              is_active = $6, updated_at = now()
       WHERE id = $1 AND gym_id = $2
       RETURNING id, slug, name, role_key, permissions, sort_order, is_active, created_at, updated_at`,
      [input.id, user.gym_id, name, roleKey, JSON.stringify(normalizePermissions(input.permissions, roleKey)), input.is_active !== false]
    );
    await recordAudit(user, 'update', 'access_profile', result.rows[0].id, { name, role_key: roleKey, is_active: result.rows[0].is_active });
    return helpers.send(res, 200, result.rows[0]);
  }

  if (req.method === 'DELETE' && url.pathname === '/api/access-profiles') {
    const input = await helpers.body(req);
    if (!input.id) return helpers.send(res, 400, { error: 'perfil_id_obrigatorio' });
    const assigned = await helpers.query('SELECT count(*)::integer AS total FROM users WHERE gym_id = $1 AND access_profile = (SELECT slug FROM access_profiles WHERE id = $2 AND gym_id = $1)', [user.gym_id, input.id]);
    if (Number(assigned.rows[0]?.total || 0) > 0) return helpers.send(res, 409, { error: 'perfil_em_uso' });
    const result = await helpers.query('DELETE FROM access_profiles WHERE id = $1 AND gym_id = $2 RETURNING id, name', [input.id, user.gym_id]);
    if (!result.rowCount) return helpers.send(res, 404, { error: 'perfil_nao_encontrado' });
    await recordAudit(user, 'delete', 'access_profile', result.rows[0].id, { name: result.rows[0].name });
    return helpers.send(res, 200, { status: 'perfil_excluido' });
  }

  return false;
}

module.exports = { PERMISSION_KEYS, canManageAccessProfiles, defaultPermissions, handleAccessProfileRoutes, normalizePermissions, slugifyProfile };
