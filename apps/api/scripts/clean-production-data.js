const { pool } = require('../lib/db');
const { hashPassword } = require('../lib/security');

async function main() {
  const client = await pool.connect();
  try {
    console.log('[clean-data] Iniciando limpeza completa de dados da aplicacao...');
    await client.query('BEGIN');

    const tables = [
      'checkins', 'audit_logs', 'login_events', 'password_reset_tokens',
      'member_password_reset_tokens', 'user_password_reset_tokens',
      'access_decisions', 'access_commands', 'access_qr_challenges',
      'student_access_tokens', 'member_notifications',
      'payment_receipts', 'payment_agreements', 'cash_movements',
      'cash_sessions', 'public_sales_leads', 'public_enrollments',
      'payments', 'workout_exercise_logs', 'workout_day_logs',
      'workout_exercises', 'workout_days', 'workout_plans',
      'workout_ai_reviews', 'member_training_profiles',
      'member_assessments', 'member_goals', 'member_progress_ai_reviews',
      'ai_recommendation_feedback', 'student_workout_day_logs',
      'student_workout_exercises', 'student_workout_days',
      'student_workout_plans', 'student_private_exercises',
      'student_training_event_exercises', 'student_training_events',
      'class_reservations', 'class_sessions', 'gym_classes',
      'student_social_comment_likes', 'student_social_comments',
      'student_social_post_likes', 'student_social_follows',
      'student_social_posts', 'student_social_profiles',
      'visitor_accounts', 'member_accounts', 'memberships', 'members'
    ];

    for (const tbl of tables) {
      const check = await client.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
        [tbl]
      );
      if (check.rowCount > 0) {
        await client.query(`TRUNCATE TABLE "${tbl}" CASCADE`);
      }
    }

    // Remove todos os usuarios menos admin@academia.com
    await client.query("DELETE FROM users WHERE lower(email) <> 'admin@academia.com'");

    // Garante academia ativa
    let gym = await client.query(
      "SELECT id FROM gyms WHERE status = 'active' ORDER BY created_at ASC LIMIT 1"
    );
    let gymId;
    if (gym.rowCount === 0) {
      const insertedGym = await client.query(
        "INSERT INTO gyms (name, slug, status) VALUES ('Academia Lobo', 'academia', 'active') RETURNING id"
      );
      gymId = insertedGym.rows[0].id;
    } else {
      gymId = gym.rows[0].id;
    }

    // Garante que admin@academia.com exista com senha Paulo1
    const passwordHash = hashPassword('Paulo1');
    await client.query(`
      INSERT INTO users (gym_id, name, email, password_hash, role, access_profile, is_active)
      VALUES ($1, 'Administrador', 'admin@academia.com', $2, 'admin', 'admin', true)
      ON CONFLICT (lower(email)) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role = 'admin',
          access_profile = 'admin',
          is_active = true,
          gym_id = EXCLUDED.gym_id
    `, [gymId, passwordHash]);

    await client.query('COMMIT');
    console.log('[clean-data] Limpeza concluida com sucesso. Apenas admin@academia.com preservado.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[clean-data] Erro ao limpar dados:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
