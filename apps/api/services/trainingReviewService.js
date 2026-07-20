const crypto = require('crypto');
const { buildTrainingReview } = require('../features/trainingRules');
const { loadTrainingReviewSnapshot } = require('../lib/trainingReviewSnapshot');
const { validateTrainingReview } = require('../lib/trainingReviewSchema');
const { generateLocalTrainingReview } = require('./localTrainingAiService');

function serviceError(code, statusCode) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function canGenerate(user) {
  if (!user) return false;
  if (['owner', 'admin'].includes(user.role)) return true;
  return user.role === 'staff' && (user.access_profile === 'trainer' || user.access_permissions?.training === true);
}

async function acquireGenerationLock(query, user, planId) {
  const token = crypto.randomUUID();
  const ttlMs = Math.max(30000, Math.min(360000, Number(process.env.OLLAMA_TIMEOUT_MS || 120000) + 30000));
  const result = await query(
    `INSERT INTO training_ai_generation_locks
       (lock_key, lock_token, gym_id, actor_user_id, plan_id, expires_at)
     VALUES ('global', $1, $2, $3, $4, now() + ($5::integer * interval '1 millisecond'))
     ON CONFLICT (lock_key) DO UPDATE
       SET lock_token = EXCLUDED.lock_token, gym_id = EXCLUDED.gym_id,
           actor_user_id = EXCLUDED.actor_user_id, plan_id = EXCLUDED.plan_id,
           acquired_at = now(), expires_at = EXCLUDED.expires_at
       WHERE training_ai_generation_locks.expires_at < now()
     RETURNING lock_token`,
    [token, user.gym_id, user.sub || null, planId, ttlMs]
  );
  if (!result.rowCount) throw serviceError('analise_em_andamento', 409);
  return token;
}

async function releaseGenerationLock(query, token) {
  try {
    await query("DELETE FROM training_ai_generation_locks WHERE lock_key = 'global' AND lock_token = $1", [token]);
  } catch (error) {
    console.error('training_ai_lock_release_failed', { code: error.code || 'unknown' });
  }
}

async function enforceRateLimit(query, user, planId) {
  const perHour = Math.max(1, Math.min(100, Number(process.env.LOCAL_TRAINING_RATE_LIMIT_PER_HOUR || 10)));
  const cooldownSeconds = Math.max(0, Math.min(3600, Number(process.env.LOCAL_TRAINING_PLAN_COOLDOWN_SECONDS || 60)));
  const result = await query(
    `SELECT
       count(*) FILTER (WHERE created_at >= now() - interval '1 hour')::integer AS gym_hour,
       count(*) FILTER (WHERE plan_id = $2 AND created_at >= now() - ($3::integer * interval '1 second'))::integer AS plan_recent
     FROM workout_ai_reviews
     WHERE gym_id = $1`,
    [user.gym_id, planId, cooldownSeconds]
  );
  if (Number(result.rows[0]?.gym_hour || 0) >= perHour) throw serviceError('limite_horario_atingido', 429);
  if (cooldownSeconds > 0 && Number(result.rows[0]?.plan_recent || 0) > 0) throw serviceError('aguarde_nova_analise', 429);
}

function fallbackResult(rules, error, startedAt) {
  return {
    review: rules,
    source: 'rules_fallback',
    model: null,
    promptVersion: String(process.env.LOCAL_TRAINING_PROMPT_VERSION || 'v1').slice(0, 40),
    durationMs: Date.now() - startedAt,
    tokenUsage: {},
    errorCode: String(error?.code || error?.message || 'ia_local_indisponivel').slice(0, 120)
  };
}

async function saveReview(query, user, data, generated) {
  const review = validateTrainingReview(generated.review, {
    planExercises: data.planExercises,
    catalog: data.catalog
  });
  const saved = await query(
    `INSERT INTO workout_ai_reviews
      (gym_id, member_id, plan_id, plan_age_days, recommendation, suggestions,
       model_version, confidence, analysis_snapshot, source, model, prompt_version,
       status, requires_human_review, signals, student_message, trainer_notes,
       input_snapshot_hash, error_code, duration_ms, token_usage)
     VALUES
      ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15::jsonb,
       $16,$17,$18,$19,$20,$21::jsonb)
     RETURNING id, plan_id, source, model, prompt_version, status, confidence,
       requires_human_review, recommendation AS summary, signals, suggestions,
       student_message, trainer_notes, error_code, duration_ms, token_usage,
       approved_at, rejected_at, created_at`,
    [
      user.gym_id, data.memberId, data.planId, data.planAgeDays, review.summary,
      JSON.stringify(review.suggestions), 'local-hybrid-v1', review.confidence,
      JSON.stringify({ input_snapshot_hash: data.inputSnapshotHash }),
      generated.source, generated.model, generated.promptVersion, review.status,
      review.requires_human_review, JSON.stringify(review.signals),
      review.student_message, review.trainer_notes, data.inputSnapshotHash,
      generated.errorCode || null, generated.durationMs, JSON.stringify(generated.tokenUsage || {})
    ]
  );
  await query('UPDATE workout_plans SET reviewed_at = now() WHERE id = $1 AND gym_id = $2', [data.planId, user.gym_id]);
  return saved.rows[0];
}

async function reviewTrainingPlan({ query, user, planId, fetchImpl }) {
  if (!canGenerate(user)) throw serviceError('sem_permissao', 403);
  if (!planId) throw serviceError('plan_id_obrigatorio', 400);
  const lockToken = await acquireGenerationLock(query, user, planId);
  const startedAt = Date.now();
  try {
    await enforceRateLimit(query, user, planId);
    const data = await loadTrainingReviewSnapshot(query, user.gym_id, planId);
    if (!data) throw serviceError('ficha_nao_encontrada', 404);
    const rules = validateTrainingReview(buildTrainingReview({
      snapshot: data.snapshot,
      planAgeDays: data.planAgeDays,
      level: data.snapshot.level
    }), { planExercises: data.planExercises, catalog: data.catalog });
    let generated;
    try {
      generated = await generateLocalTrainingReview({
        snapshot: data.snapshot,
        rules,
        planExercises: data.planExercises,
        catalog: data.catalog,
        fetchImpl
      });
    } catch (error) {
      generated = fallbackResult(rules, error, startedAt);
    }
    const saved = await saveReview(query, user, data, generated);
    console.info('training_ai_review', {
      source: saved.source,
      model: saved.model || null,
      duration_ms: saved.duration_ms,
      error_code: saved.error_code || null
    });
    return saved;
  } finally {
    await releaseGenerationLock(query, lockToken);
  }
}

async function listTrainingReviews(query, user, planId, limit = 20) {
  if (!canGenerate(user)) throw serviceError('sem_permissao', 403);
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const result = await query(
    `SELECT id, plan_id, source, model, prompt_version, status, confidence,
            requires_human_review, recommendation AS summary, signals, suggestions,
            student_message, trainer_notes, error_code, duration_ms, token_usage,
            approved_at, approved_by, rejected_at, rejected_by, rejection_reason, created_at
     FROM workout_ai_reviews
     WHERE gym_id = $1 AND plan_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [user.gym_id, planId, safeLimit]
  );
  return result.rows;
}


async function listMemberTrainingReviews(query, user, memberId, limit = 50) {
  if (!canGenerate(user)) throw serviceError('sem_permissao', 403);
  if (!memberId) throw serviceError('member_id_obrigatorio', 400);
  const member = await query('SELECT id FROM members WHERE id = $1 AND gym_id = $2 LIMIT 1', [memberId, user.gym_id]);
  if (!member.rowCount) throw serviceError('aluno_nao_encontrado', 404);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const result = await query(
    `SELECT r.id, r.member_id, r.plan_id, wp.name AS plan_name, wp.goal AS plan_goal,
            wp.level AS plan_level, wp.status AS plan_status, r.source, r.model,
            r.prompt_version, r.status, r.confidence, r.requires_human_review,
            r.recommendation AS summary, r.signals, r.suggestions, r.student_message,
            r.trainer_notes, r.error_code, r.duration_ms, r.token_usage,
            r.approved_at, r.approved_by, r.rejected_at, r.rejected_by,
            r.rejection_reason, r.created_at
     FROM workout_ai_reviews r
     INNER JOIN workout_plans wp ON wp.id = r.plan_id AND wp.gym_id = r.gym_id
     WHERE r.gym_id = $1 AND r.member_id = $2
     ORDER BY r.created_at DESC
     LIMIT $3`,
    [user.gym_id, memberId, safeLimit]
  );
  return result.rows;
}

async function decideTrainingReview(query, user, reviewId, decision, reason = '') {
  if (!canGenerate(user)) throw serviceError('sem_permissao', 403);
  if (!reviewId || !['approved', 'rejected'].includes(decision)) throw serviceError('dados_invalidos', 400);
  const actor = user.sub || null;
  const rejectionReason = String(reason || '').trim().slice(0, 500) || null;
  const sql = decision === 'approved'
    ? `UPDATE workout_ai_reviews
       SET approved_at = now(), approved_by = $3, rejected_at = NULL,
           rejected_by = NULL, rejection_reason = NULL
       WHERE id = $1 AND gym_id = $2
       RETURNING id, plan_id, source, model, prompt_version, status, confidence,
         requires_human_review, recommendation AS summary, signals, suggestions,
         student_message, trainer_notes, error_code, duration_ms, token_usage,
         approved_at, approved_by, rejected_at, rejected_by, rejection_reason, created_at`
    : `UPDATE workout_ai_reviews
       SET rejected_at = now(), rejected_by = $3, rejection_reason = $4,
           approved_at = NULL, approved_by = NULL
       WHERE id = $1 AND gym_id = $2
       RETURNING id, plan_id, source, model, prompt_version, status, confidence,
         requires_human_review, recommendation AS summary, signals, suggestions,
         student_message, trainer_notes, error_code, duration_ms, token_usage,
         approved_at, approved_by, rejected_at, rejected_by, rejection_reason, created_at`;
  const result = await query(sql, decision === 'approved'
    ? [reviewId, user.gym_id, actor]
    : [reviewId, user.gym_id, actor, rejectionReason]);
  if (!result.rowCount) throw serviceError('analise_nao_encontrada', 404);
  return result.rows[0];
}

async function latestApprovedStudentMessage(query, user) {
  if (user?.role !== 'student' || !user.member_id) throw serviceError('sem_permissao', 403);
  const result = await query(
    `SELECT id, plan_id, student_message, approved_at
     FROM workout_ai_reviews
     WHERE gym_id = $1 AND member_id = $2
       AND approved_at IS NOT NULL AND rejected_at IS NULL
       AND student_message IS NOT NULL
     ORDER BY approved_at DESC
     LIMIT 1`,
    [user.gym_id, user.member_id]
  );
  return result.rows[0] || null;
}

module.exports = {
  canGenerate,
  acquireGenerationLock,
  releaseGenerationLock,
  enforceRateLimit,
  reviewTrainingPlan,
  listTrainingReviews,
  listMemberTrainingReviews,
  decideTrainingReview,
  latestApprovedStudentMessage
};
