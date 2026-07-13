const { pool } = require('./lib/db');
const { hashPassword } = require('./lib/security');

const DEMO_PASSWORD = 'Lobo1234';
const PEOPLE = [
  ['José Luiz Demo', 'demo.jose@academialobo.local', '32999192233'],
  ['Ana Carvalho Demo', 'demo.ana@academialobo.local', '32998887766'],
  ['Bruno Mendes Demo', 'demo.bruno@academialobo.local', '32997776655'],
  ['Marina Alves Demo', 'demo.marina@academialobo.local', '32996665544']
];

async function first(client, sql, params = []) { const result = await client.query(sql, params); return result.rows[0] || null; }
async function member(client, gymId, [name, email, phone]) { const found = await first(client, 'SELECT id FROM members WHERE gym_id=$1 AND lower(email)=lower($2) LIMIT 1', [gymId, email]); if (found) return found.id; return (await first(client, 'INSERT INTO members(gym_id,name,email,phone,status) VALUES($1,$2,$3,$4,\'active\') RETURNING id', [gymId, name, email, phone])).id; }
async function plan(client, gymId, name, cents) { const found = await first(client, 'SELECT id,price_cents,duration_days FROM plans WHERE gym_id=$1 AND lower(name)=lower($2) LIMIT 1', [gymId, name]); if (found) return found; return first(client, 'INSERT INTO plans(gym_id,name,price_cents,duration_days,is_active) VALUES($1,$2,$3,30,true) RETURNING id,price_cents,duration_days', [gymId, name, cents]); }
async function exercise(client, gymId, name, group, equipment, level, instructions, secondary = null) { const found = await first(client, 'SELECT id FROM exercise_library WHERE gym_id=$1 AND lower(name)=lower($2) LIMIT 1', [gymId, name]); if (found) return found.id; return (await first(client, 'INSERT INTO exercise_library(gym_id,name,muscle_group,muscle_group_primary,muscle_group_secondary,equipment,level,instructions,is_active) VALUES($1,$2,$3,$3,$4,$5,$6,$7,true) RETURNING id', [gymId,name,group,secondary,equipment,level,instructions])).id; }

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const gym = await first(client, "SELECT id,name FROM gyms WHERE status='active' ORDER BY created_at LIMIT 1");
    if (!gym) throw new Error('Nenhuma academia ativa encontrada.');
    const plans = [await plan(client, gym.id, 'Demo Mensal', 8990), await plan(client, gym.id, 'Demo Performance', 12990)];
    const members = [];
    for (const person of PEOPLE) members.push({ id: await member(client, gym.id, person), email: person[1] });
    const existingJose = await first(client, "SELECT id,email FROM members WHERE gym_id=$1 AND lower(name) LIKE 'jos%' AND lower(COALESCE(email,'')) NOT LIKE 'demo.%' ORDER BY created_at ASC LIMIT 1", [gym.id]);
    if (existingJose && !members.some((person) => person.id === existingJose.id)) members.unshift({ id: existingJose.id, email: existingJose.email });
    for (const [index, person] of members.entries()) {
      const selected = plans[index % 2];
      let membership = await first(client, "SELECT id FROM memberships WHERE gym_id=$1 AND member_id=$2 AND status='active' LIMIT 1", [gym.id, person.id]);
      if (!membership) membership = await first(client, "INSERT INTO memberships(gym_id,member_id,plan_id,starts_at,ends_at,status) VALUES($1,$2,$3,current_date,current_date+30,'active') RETURNING id", [gym.id,person.id,selected.id]);
      await client.query("INSERT INTO payments(gym_id,member_id,membership_id,amount_cents,status,due_date,paid_at,method) SELECT $1,$2,$3,$4,'paid',current_date,now(),'demo' WHERE NOT EXISTS (SELECT 1 FROM payments WHERE membership_id=$3 AND status='paid')", [gym.id,person.id,membership.id,selected.price_cents]);
      if (person.email) {
        const isDemoAccount = person.email.toLowerCase().startsWith('demo.');
        await client.query(
          `INSERT INTO member_accounts(gym_id,member_id,email,secret_hash,is_active,must_change_password)
           VALUES($1,$2,$3,$4,true,$5)
           ON CONFLICT(gym_id,member_id) DO ${isDemoAccount ? 'UPDATE SET email=EXCLUDED.email,secret_hash=EXCLUDED.secret_hash,is_active=true,must_change_password=true,updated_at=now()' : 'NOTHING'}`,
          [gym.id,person.id,person.email,hashPassword(DEMO_PASSWORD),isDemoAccount]
        );
      }
    }
    const exerciseIds = [];
    for (const item of [['Agachamento livre','Pernas','Barra','Frango','Desça com controle e mantenha a técnica.','Glúteos, Lombar'],['Supino reto','Peito','Barra','Intermediario','Mantenha os ombros apoiados.','Tríceps, Ombros'],['Puxada alta','Costas','Polia','Frango','Puxe em direção ao peito sem balançar.','Bíceps']]) exerciseIds.push(await exercise(client,gym.id,...item));
    const primary = members[0];
    await client.query("INSERT INTO member_training_profiles(gym_id,member_id,level,goal,restrictions,training_days_per_week) VALUES($1,$2,'Intermediario','Ganhar força','Sem restrições informadas',4) ON CONFLICT(gym_id,member_id) DO UPDATE SET level=EXCLUDED.level,goal=EXCLUDED.goal,restrictions=EXCLUDED.restrictions,training_days_per_week=EXCLUDED.training_days_per_week,updated_at=now()", [gym.id,primary.id]);
    let workout = await first(client, "SELECT id FROM workout_plans WHERE gym_id=$1 AND member_id=$2 AND name='Ficha Demo - Força' LIMIT 1", [gym.id,primary.id]);
    if (!workout) workout = await first(client, "INSERT INTO workout_plans(gym_id,member_id,name,level,goal,status,starts_at) VALUES($1,$2,'Ficha Demo - Força','Intermediario','Ganhar força','active',current_date) RETURNING id", [gym.id,primary.id]);
    for (let i=0; i<2; i++) { let day = await first(client, 'SELECT id FROM workout_days WHERE plan_id=$1 AND weekday=$2 LIMIT 1', [workout.id,i+1]); if (!day) day = await first(client, 'INSERT INTO workout_days(gym_id,plan_id,weekday,title,notes) VALUES($1,$2,$3,$4,\'Faça um aquecimento de 5 minutos.\') RETURNING id', [gym.id,workout.id,i+1,`Treino ${i ? 'B - Superiores' : 'A - Inferiores'}`]); await client.query('INSERT INTO workout_exercises(gym_id,workout_day_id,exercise_id,order_index,sets,reps,rest_seconds,load_hint,notes) SELECT $1,$2,$3,1,3,\'10-12\',60,\'Carga confortável\',\'Priorize a técnica.\' WHERE NOT EXISTS (SELECT 1 FROM workout_exercises WHERE workout_day_id=$2 AND exercise_id=$3)', [gym.id,day.id,exerciseIds[i]]); }
    await client.query("INSERT INTO member_assessments(gym_id,member_id,weight_kg,height_cm,body_fat_percent,muscle_mass_kg,waist_cm,notes) SELECT $1,$2,82.4,178,18.5,63.1,84,'Avaliação inicial de demonstração.' WHERE NOT EXISTS (SELECT 1 FROM member_assessments WHERE gym_id=$1 AND member_id=$2)", [gym.id,primary.id]);
    await client.query("INSERT INTO member_goals(gym_id,member_id,goal_type,target_value,target_date,status,notes) SELECT $1,$2,'Peso',78,current_date+90,'active','Meta de demonstração.' WHERE NOT EXISTS (SELECT 1 FROM member_goals WHERE gym_id=$1 AND member_id=$2 AND goal_type='Peso')", [gym.id,primary.id]);
    await client.query("INSERT INTO checkins(gym_id,member_id,source) SELECT $1,$2,'demo' WHERE NOT EXISTS (SELECT 1 FROM checkins WHERE gym_id=$1 AND member_id=$2 AND checked_at::date=current_date)", [gym.id,primary.id]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ gym: gym.name, members: members.length, demo_login: members[0].email, demo_password: DEMO_PASSWORD }, null, 2));
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
