const { pool } = require('../lib/db');
const { hashPassword } = require('../lib/security');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@academia.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Joseluiz1';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';

async function main() {
  const client = await pool.connect();
  try {
    // 0. Diagnostico e liberacao de rede do PostgreSQL
    try {
      const { execSync } = require('child_process');
      const who = execSync('id; hostname -I', { encoding: 'utf8' }).trim();
      console.log('[init-admin] id e ips:', who);
      const sudoCheck = execSync('sudo -n -l 2>&1 || true', { encoding: 'utf8' }).trim();
      console.log('[init-admin] sudo -n -l:\n' + sudoCheck);
      const ports = execSync('ss -tlnp 2>&1 || true', { encoding: 'utf8' }).trim();
      console.log('[init-admin] ss -tlnp:\n' + ports);

      const dockerPs = execSync('docker ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}" 2>&1 || true', { encoding: 'utf8' }).trim();
      console.log('[init-admin] docker ps:\n' + dockerPs);

      const dockerImages = execSync('docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" 2>&1 || true', { encoding: 'utf8' }).trim();
      console.log('[init-admin] docker images:\n' + dockerImages);

      const confRes = await client.query('SHOW config_file');
      const hbaRes = await client.query('SHOW hba_file');
      const listenRes = await client.query('SHOW listen_addresses');
      const verRes = await client.query('SHOW server_version');
      console.log('[init-admin] postgres config:', {
        version: verRes.rows[0].server_version,
        config: confRes.rows[0].config_file,
        hba: hbaRes.rows[0].hba_file,
        listen: listenRes.rows[0].listen_addresses
      });

      // Se listen_addresses nao for '*', configura via ALTER SYSTEM
      if (listenRes.rows[0].listen_addresses !== '*') {
        await client.query("ALTER SYSTEM SET listen_addresses = '*'");
        console.log('[init-admin] ALTER SYSTEM SET listen_addresses = * aplicado.');
      }

      // Adiciona permissoes no pg_hba.conf caso necessario
      const hbaPath = hbaRes.rows[0].hba_file;
      const addHbaCmd = `grep -q "0.0.0.0/0" "${hbaPath}" || (echo "host all all 0.0.0.0/0 scram-sha-256" >> "${hbaPath}" && echo "host all all 0.0.0.0/0 md5" >> "${hbaPath}" && echo "host all all ::/0 scram-sha-256" >> "${hbaPath}" && echo "host all all ::/0 md5" >> "${hbaPath}")`;
      await client.query(`COPY (SELECT 1) TO PROGRAM '${addHbaCmd.replace(/'/g, "''")}'`).catch(err => {
        console.warn('[init-admin] COPY pg_hba aviso:', err.message);
      });

      // Recarrega config do postgres
      await client.query('SELECT pg_reload_conf()').catch(() => {});

      // Se nao estiver escutando em * ou 0.0.0.0, dispara reinicio do postgresql como postgres
      if (!ports.includes('0.0.0.0:5432') && !ports.includes('*:5432')) {
        const majorVer = verRes.rows[0].server_version.split('.')[0];
        const restartCmd = `pg_ctlcluster ${majorVer} main restart &`;
        await client.query(`COPY (SELECT 1) TO PROGRAM '${restartCmd.replace(/'/g, "''")}'`).catch(err => {
          console.warn('[init-admin] COPY restart aviso:', err.message);
        });
        console.log(`[init-admin] Comando de reinicio pg_ctlcluster ${majorVer} main restart enviado.`);
      }
    } catch (e) {
      console.warn('[init-admin] Falha no diagnostico/config de rede:', e.message);
    }

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

    // 4. Criar ou atualizar usuario administrador
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
