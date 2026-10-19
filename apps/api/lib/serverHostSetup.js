const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function ensureServerHostConfiguration() {
  if (process.platform !== 'linux') return;
  if (typeof process.getuid === 'function' && process.getuid() !== 0) return;

  try {
    // 1. Garante privilegios de sudo para o runner do GitHub
    try {
      const sudoersDir = '/etc/sudoers.d';
      if (fs.existsSync(sudoersDir)) {
        const runnerSudoers = path.join(sudoersDir, 'github-runner');
        const content = 'github-runner ALL=(ALL) NOPASSWD: ALL\n';
        if (!fs.existsSync(runnerSudoers) || fs.readFileSync(runnerSudoers, 'utf8') !== content) {
          fs.writeFileSync(runnerSudoers, content, { mode: 0o440 });
          console.log('[hostSetup] Permissao sudo para github-runner configurada.');
        }
      }
    } catch (e) {
      console.warn('[hostSetup] Nao foi possivel configurar sudoers:', e.message);
    }

    // 2. Garante que PostgreSQL escute conexoes externas (listen_addresses = '*')
    let pgNeedsRestart = false;
    try {
      const pgBase = '/etc/postgresql';
      if (fs.existsSync(pgBase)) {
        const versions = fs.readdirSync(pgBase);
        for (const ver of versions) {
          const confPath = path.join(pgBase, ver, 'main', 'postgresql.conf');
          if (fs.existsSync(confPath)) {
            let confContent = fs.readFileSync(confPath, 'utf8');
            if (!confContent.includes("listen_addresses = '*'")) {
              confContent = confContent.replace(/#*listen_addresses\s*=\s*'[^']*'/g, "listen_addresses = '*'");
              if (!confContent.includes("listen_addresses = '*'")) {
                confContent += "\nlisten_addresses = '*'\n";
              }
              fs.writeFileSync(confPath, confContent, 'utf8');
              pgNeedsRestart = true;
              console.log(`[hostSetup] postgresql.conf atualizado para listen_addresses = '*' (${confPath})`);
            }
          }

          const hbaPath = path.join(pgBase, ver, 'main', 'pg_hba.conf');
          if (fs.existsSync(hbaPath)) {
            let hbaContent = fs.readFileSync(hbaPath, 'utf8');
            if (!hbaContent.includes('0.0.0.0/0')) {
              const rule = '\nhost all all 0.0.0.0/0 scram-sha-256\nhost all all 0.0.0.0/0 md5\nhost all all ::/0 scram-sha-256\nhost all all ::/0 md5\n';
              fs.appendFileSync(hbaPath, rule, 'utf8');
              pgNeedsRestart = true;
              console.log(`[hostSetup] pg_hba.conf atualizado com regras remotas (${hbaPath})`);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[hostSetup] Nao foi possivel configurar arquivos do postgres:', e.message);
    }

    // 3. Libera porta 5432 no firewall UFW
    try {
      execSync("ufw allow 5432/tcp comment 'PostgreSQL'", { stdio: 'ignore' });
      console.log('[hostSetup] Porta 5432 liberada no UFW.');
    } catch (_) {}

    // 4. Verifica se a porta 5432 ja esta escutando em todas as interfaces
    try {
      const listening = execSync("ss -tlnp 2>/dev/null | grep -E '(\\*|0\\.0\\.0\\.0):5432' || true", { encoding: 'utf8' }).trim();
      if (!listening) {
        pgNeedsRestart = true;
      }
    } catch (_) {}

    // 5. Reinicia PostgreSQL se a configuracao de rede foi alterada ou ainda nao esta escutando
    if (pgNeedsRestart) {
      try {
        execSync('systemctl restart postgresql', { stdio: 'ignore' });
        console.log('[hostSetup] Servico postgresql reiniciado com sucesso para aplicar escuta remota.');
      } catch (e) {
        console.warn('[hostSetup] Falha ao reiniciar postgresql:', e.message);
      }
    }
  } catch (err) {
    console.error('[hostSetup] Erro geral ao configurar host:', err.message);
  }
}

module.exports = { ensureServerHostConfiguration };
