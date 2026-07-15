const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.m4v']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function exerciseName(file) {
  return path.basename(file, path.extname(file)).replace(/\s+/g, ' ').trim();
}

function metadataFor(name) {
  const value = normalize(name);
  let primary = 'Corpo inteiro';
  let secondary = 'Estabilizadores';

  if (/abdominal|prancha|hollow|dead bug|canivete|dragon|flutter|mountain climber|giro russo|rotacao|torcao|press pallof|joelho.*barra|pes.*barra|roda abdominal|cotovelo.*joelho|homem aranha/.test(value)) {
    primary = 'Abdômen'; secondary = 'Oblíquos, Lombar';
  } else if (/supino|crucifixo|flexao|pec deck|peito|chest press|bench press|push up|push-up|voador/.test(value)) {
    primary = 'Peito'; secondary = 'Tríceps, Ombros';
  } else if (/puxada|remada|barra fixa|ring pull|vertical traction|maquina de remo|rack pull|clean pull|costas|pullover/.test(value)) {
    primary = 'Costas'; secondary = 'Bíceps, Ombros';
  } else if (/desenvolvimento|elevacao frontal|elevacao lateral|elevacao em y|arnold press|shoulder press|press de ombro|push press|encolhimento|shrug|remada alta|landmine press|overhead plate|kettlebell halo|ombros/.test(value)) {
    primary = 'Ombros'; secondary = 'Trapézio, Tríceps';
  } else if (/rosca|curl|biceps|martelo|scott|zottman|drag curl|waiter curl|behind the back curl/.test(value)) {
    primary = 'Bíceps'; secondary = 'Antebraços';
  } else if (/triceps|triceps|fundos|bench dip|press jm|frances|testa/.test(value)) {
    primary = 'Tríceps'; secondary = 'Peito, Ombros';
  } else if (/extensora|extensao de perna|quadriceps/.test(value)) {
    primary = 'Quadríceps'; secondary = 'Pernas';
  } else if (/flexora|nordica|flexao de perna|mesa flexora|glute ham raise|posterior/.test(value)) {
    primary = 'Posteriores'; secondary = 'Glúteos, Lombar';
  } else if (/elevacao pelvica|hip thrust|gluteo|concha|hidrante|coice|kick|elevacao de quadril|glute bridge|impulso de quadril|pontapes traseiros/.test(value)) {
    primary = 'Glúteos'; secondary = 'Posteriores, Quadril';
  } else if (/panturrilha|calf|soleo/.test(value)) {
    primary = 'Panturrilhas'; secondary = 'Sóleo';
  } else if (/levantamento terra|deadlift|good morning|hiperextensao|lombar/.test(value)) {
    primary = 'Posteriores'; secondary = 'Glúteos, Lombar';
  } else if (/corrida|esteira|bicicleta|eliptico|escada|polichinelo|pular corda|boxe|cardio/.test(value)) {
    primary = 'Cardiorrespiratório'; secondary = 'Pernas';
  } else if (/clean|snatch|jerk|kettlebell swing|thruster|burpee|salto|sledge|treno/.test(value)) {
    primary = 'Corpo inteiro'; secondary = 'Pernas, Ombros';
  } else if (/agachamento|afundo|passada|leg press|step up|sissy|belt squat|frog jump|box jump|pernas|quadril/.test(value)) {
    primary = 'Pernas'; secondary = 'Glúteos, Quadríceps';
  }

  let equipment = null;
  if (/halter|dumbbell/.test(value)) equipment = 'Halter';
  else if (/barra|barbell/.test(value)) equipment = 'Barra';
  else if (/kettlebell/.test(value)) equipment = 'Kettlebell';
  else if (/maquina|machine|smith|graviton/.test(value)) equipment = 'Máquina';
  else if (/polia|cabo|cable|corda/.test(value)) equipment = 'Polia';
  else if (/trx/.test(value)) equipment = 'TRX';
  else if (/elastico|banda/.test(value)) equipment = 'Elástico';
  else if (/bola|medicinal/.test(value)) equipment = 'Bola';
  else if (/treno/.test(value)) equipment = 'Trenó';

  return { primary, secondary, equipment };
}

function mediaFileName(name, extension) {
  const hash = crypto.createHash('sha1').update(`${normalize(name)}${extension}`).digest('hex').slice(0, 16);
  return `exercise-${hash}${extension}`;
}

function collectFiles(source) {
  return fs.readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(source, entry.name))
    .filter((file) => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()) || IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

async function main() {
  const source = path.resolve(argument('--source', path.resolve(__dirname, '../../files/Academia-videos-exercicios')));
  const uploadRoot = path.resolve(argument('--upload-dir', path.resolve(__dirname, '../../web/uploads')));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL nao informado');
  if (!fs.existsSync(source)) throw new Error(`Pasta de exercicios nao encontrada: ${source}`);

  const exerciseUploadDir = path.join(uploadRoot, 'exercises');
  fs.mkdirSync(exerciseUploadDir, { recursive: true });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const summary = { files: 0, created: 0, updated: 0, videos: 0, images: 0 };

  try {
    const gym = await client.query('SELECT id FROM gyms ORDER BY created_at NULLS LAST, id LIMIT 1');
    if (!gym.rowCount) throw new Error('Nenhuma academia encontrada');
    const gymId = argument('--gym-id', gym.rows[0].id);
    const levels = await client.query('SELECT slug FROM training_levels WHERE gym_id = $1 AND is_active = true ORDER BY sort_order NULLS LAST, name LIMIT 10', [gymId]);
    const level = levels.rows.find((row) => /inter|medio/.test(normalize(row.slug)))?.slug || levels.rows[0]?.slug || 'frango';

    for (const file of collectFiles(source)) {
      const extension = path.extname(file).toLowerCase();
      const name = exerciseName(file);
      const metadata = metadataFor(name);
      const destinationName = mediaFileName(name, extension);
      const destination = path.join(exerciseUploadDir, destinationName);
      fs.copyFileSync(file, destination);
      const mediaUrl = `/uploads/exercises/${destinationName}`;
      const videoUrl = VIDEO_EXTENSIONS.has(extension) ? mediaUrl : null;
      const imageUrl = IMAGE_EXTENSIONS.has(extension) ? mediaUrl : null;
      const found = await client.query('SELECT id FROM exercise_library WHERE gym_id = $1 AND lower(name) = lower($2) LIMIT 1', [gymId, name]);
      if (found.rowCount) {
        await client.query(
          `UPDATE exercise_library
           SET muscle_group = $3, muscle_group_primary = $3, muscle_group_secondary = $4,
               equipment = COALESCE(NULLIF($5, ''), equipment), level = COALESCE(NULLIF($6, ''), level),
               video_url = COALESCE(NULLIF($7, ''), video_url), image_url = COALESCE(NULLIF($8, ''), image_url), is_active = true
           WHERE id = $1 AND gym_id = $2`,
          [found.rows[0].id, gymId, metadata.primary, metadata.secondary, metadata.equipment || '', level, videoUrl || '', imageUrl || '']
        );
        summary.updated += 1;
      } else {
        await client.query(
          `INSERT INTO exercise_library
             (gym_id, name, muscle_group, muscle_group_primary, muscle_group_secondary, equipment, level, instructions, video_url, image_url, is_active)
           VALUES ($1, $2, $3, $3, $4, NULLIF($5, ''), $6, NULL, NULLIF($7, ''), NULLIF($8, ''), true)`,
          [gymId, name, metadata.primary, metadata.secondary, metadata.equipment || '', level, videoUrl || '', imageUrl || '']
        );
        summary.created += 1;
      }
      summary.files += 1;
      if (videoUrl) summary.videos += 1;
      if (imageUrl) summary.images += 1;
    }
    console.log(JSON.stringify({ ...summary, gym_id: gymId, source, upload_root: exerciseUploadDir }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}

module.exports = { metadataFor, exerciseName, collectFiles };
