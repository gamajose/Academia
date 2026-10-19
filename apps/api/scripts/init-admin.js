const { pool } = require('../lib/db');
const { hashPassword } = require('../lib/security');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@academia.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Paulo1';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Garantir que exista ao menos uma academia ativa
    let gymResult = await client.query(
      "SELECT id, name FROM gyms WHERE status = 'active' ORDER BY created_at ASC LIMIT 1"
    );
    let gymId;
    if (gymResult.rowCount === 0) {
      const insertedGym = await client.query(
        "INSERT INTO gyms (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, name",
        ['Academia Lobo', 'academia']
      );
      gymId = insertedGym.rows[0].id;
      console.log(`[init-admin] Academia criada com sucesso: ${insertedGym.rows[0].name} (${gymId})`);
    } else {
      gymId = gymResult.rows[0].id;
      console.log(`[init-admin] Academia encontrada: ${gymResult.rows[0].name} (${gymId})`);
    }

    // 2. Garantir perfis de acesso padrao para a academia
    await client.query(`
      INSERT INTO access_profiles (gym_id, slug, name, role_key, permissions, sort_order)
      VALUES
        ($1, 'owner', 'Proprietário', 'owner', '{"dashboard":true,"members":true,"plans":true,"memberships":true,"pre_enrollments":true,"finance":true,"alerts":true,"training":true,"assessments":true,"student_access":true,"users":true,"account":true,"reports":true,"access":true,"classes":true,"settings":true,"audit":true,"exports":true}', 10),
        ($1, 'admin', 'Administrador', 'admin', '{"dashboard":true,"members":true,"plans":true,"memberships":true,"pre_enrollments":true,"finance":true,"alerts":true,"training":true,"assessments":true,"student_access":true,"users":true,"account":true,"reports":true,"access":true,"classes":true,"settings":true,"audit":true,"exports":true}', 20),
        ($1, 'reception', 'Recepção', 'staff', '{"dashboard":true,"members":true,"memberships":true,"pre_enrollments":true,"alerts":true,"student_access":true,"account":true}', 30),
        ($1, 'trainer', 'Personal trainer', 'staff', '{"dashboard":true,"members":true,"training":true,"assessments":true,"student_access":true,"account":true}', 40),
        ($1, 'operator', 'Operação', 'operator', '{"dashboard":true,"access":true,"student_access":true,"account":true}', 50)
      ON CONFLICT (gym_id, lower(slug)) DO NOTHING
    `, [gymId]);

    // 3. Garantir niveis de treino padrao
    await client.query(`
      INSERT INTO training_levels (gym_id, slug, name, sort_order)
      VALUES
        ($1, 'frango', 'Frango', 10),
        ($1, 'intermediario', 'Intermediario', 20),
        ($1, 'avancado', 'Avancado', 30)
      ON CONFLICT (gym_id, lower(slug)) DO NOTHING
    `, [gymId]);

    // 4. Garantir planos padrao
    await client.query(`
      INSERT INTO plans (gym_id, name, price_cents, duration_days, description, benefits, rules, is_active)
      SELECT $1, 'Essencial', 8990, 30,
             'Para quem quer começar com uma rotina simples e consistente.',
             '<ul><li>Musculação</li><li>Treino organizado</li><li>Acompanhamento da equipe</li></ul>',
             '<p>Acesso durante o horário de funcionamento da academia.</p>',
             true
      WHERE NOT EXISTS (SELECT 1 FROM plans WHERE gym_id = $1 AND lower(name) = lower('Essencial'))
    `, [gymId]);

    await client.query(`
      INSERT INTO plans (gym_id, name, price_cents, duration_days, description, benefits, rules, is_active)
      SELECT $1, 'Performance', 12990, 30,
             'Mais acompanhamento para acelerar sua evolução.',
             '<ul><li>Musculação</li><li>Avaliação periódica</li><li>Revisão de treino</li></ul>',
             '<p>Plano mensal com acesso às áreas previstas pela academia.</p>',
             true
      WHERE NOT EXISTS (SELECT 1 FROM plans WHERE gym_id = $1 AND lower(name) = lower('Performance'))
    `, [gymId]);

    await client.query(`
      INSERT INTO plans (gym_id, name, price_cents, duration_days, description, benefits, rules, is_active)
      SELECT $1, 'Premium', 17990, 30,
             'Experiência completa para quem busca acompanhamento contínuo.',
             '<ul><li>Todos os benefícios</li><li>Aulas incluídas</li><li>Atendimento prioritário</li></ul>',
             '<p>Consulte a equipe para confirmar as modalidades incluídas.</p>',
             true
      WHERE NOT EXISTS (SELECT 1 FROM plans WHERE gym_id = $1 AND lower(name) = lower('Premium'))
    `, [gymId]);

    // 5. Criar ou atualizar usuario administrador
    const passwordHash = hashPassword(ADMIN_PASSWORD);
    const userResult = await client.query(`
      INSERT INTO users (gym_id, name, email, password_hash, role, access_profile, is_active)
      VALUES ($1, $2, $3, $4, 'admin', 'admin', true)
      ON CONFLICT (lower(email)) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role = 'admin',
          access_profile = 'admin',
          is_active = true,
          gym_id = EXCLUDED.gym_id
      RETURNING id, name, email, role, access_profile
    `, [gymId, ADMIN_NAME, ADMIN_EMAIL, passwordHash]);

    await client.query('COMMIT');
    console.log(`[init-admin] Usuario admin pronto: ${userResult.rows[0].email} (ID: ${userResult.rows[0].id})`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[init-admin] Erro ao inicializar administrador:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
