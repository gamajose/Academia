const { query } = require('./db');

async function recordAudit(user, action, entity, entityId, metadata = {}) {
  try {
    await query(
      'INSERT INTO audit_logs (gym_id, user_id, action, entity, entity_id, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
      [user.gym_id, user.sub, action, entity, entityId || null, JSON.stringify(metadata || {})]
    );
  } catch (error) {
    console.error('audit_log_error', error.message);
  }
}

module.exports = { recordAudit };
