const crypto = require('crypto');

const ASSESSMENT_FIELDS = [
  'id', 'assessment_date', 'weight_kg', 'height_cm', 'body_fat_percent',
  'muscle_mass_kg', 'waist_cm', 'chest_cm', 'hip_cm', 'biceps_cm',
  'back_cm', 'resting_heart_rate', 'measurement_sources'
];

function compactAssessment(row) {
  if (!row) return null;
  return Object.fromEntries(
    ASSESSMENT_FIELDS
      .filter((field) => row[field] !== undefined)
      .map((field) => [field, row[field]])
  );
}

function compactGoal(goal) {
  return {
    goal_type: goal?.goal_type || null,
    target_value: goal?.target_value ?? null,
    target_date: goal?.target_date || null,
    status: goal?.status || 'active'
  };
}

function buildProgressReviewPayload({ assessments = [], baseline = null, goals = [], trainingSessions = 0, analysis, recentAnalysis }) {
  const activeGoals = goals.filter((goal) => !['completed', 'closed'].includes(String(goal?.status || '').toLowerCase()));
  return {
    assessment_count: assessments.length,
    active_goal_count: activeGoals.length,
    training_sessions: Number(trainingSessions) || 0,
    assessments: assessments.slice(0, 2).map(compactAssessment),
    baseline: compactAssessment(baseline),
    goals: activeGoals.slice(0, 10).map(compactGoal),
    analysis: analysis || null,
    recent_analysis: recentAnalysis || analysis || null
  };
}

function progressReviewHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function persistProgressReview(query, user, memberId, payload) {
  const snapshotHash = progressReviewHash(payload);
  const inserted = await query(
    `INSERT INTO member_progress_ai_reviews (gym_id, member_id, snapshot_hash, payload, generated_by)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (gym_id, member_id, snapshot_hash) DO NOTHING
     RETURNING id, created_at`,
    [user.gym_id, memberId, snapshotHash, JSON.stringify(payload), user.sub || null]
  );
  if (inserted.rowCount) return { ...inserted.rows[0], snapshot_hash: snapshotHash, created: true };
  const existing = await query(
    `SELECT id, created_at FROM member_progress_ai_reviews
     WHERE gym_id = $1 AND member_id = $2 AND snapshot_hash = $3
     LIMIT 1`,
    [user.gym_id, memberId, snapshotHash]
  );
  return existing.rowCount
    ? { ...existing.rows[0], snapshot_hash: snapshotHash, created: false }
    : { id: null, created_at: null, snapshot_hash: snapshotHash, created: false };
}

async function listProgressReviewHistory(query, gymId, memberId, limit = 30) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
  const result = await query(
    `SELECT id, payload, created_at
     FROM member_progress_ai_reviews
     WHERE gym_id = $1 AND member_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [gymId, memberId, safeLimit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    ...(row.payload || {})
  }));
}

module.exports = {
  compactAssessment,
  buildProgressReviewPayload,
  progressReviewHash,
  persistProgressReview,
  listProgressReviewHistory
};
