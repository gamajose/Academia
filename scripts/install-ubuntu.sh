#!/usr/bin/env bash
# ==============================================================================
# Academia - Script de Instalacao Completa e Automatizada em Ubuntu
# ==============================================================================
# Execucao recomendada:
#   curl -fsSL https://raw.githubusercontent.com/gamajose/Academia/main/scripts/install-ubuntu.sh | sudo bash
# Ou localmente dentro do repositorio:
#   sudo ./scripts/install-ubuntu.sh
# ==============================================================================

set -Eeuo pipefail

# ------------------------------------------------------------------------------
# 1. Configuracoes e Variaveis Padrao
# ------------------------------------------------------------------------------
REPO_URL="${REPO_URL:-https://github.com/gamajose/Academia.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/academia}"
LEGACY_SYMLINK_DIR="/mnt/Projetos/Academia"

DB_NAME="academia"
DB_USER="pauloacad"
DB_USER_ALIAS="pauloacade"
DB_PASS="Paulo1"
DB_HOST="127.0.0.1"
DB_PORT="5432"

ADMIN_NAME="Administrador"
ADMIN_EMAIL="admin@academia.com"
ADMIN_PASSWORD="Paulo1"

API_PORT="3004"
WEB_PORT="8084"

LOG_FILE="/var/log/academia-install.log"

# Cores para terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log() {
  local msg="[$(date +'%Y-%m-%d %H:%M:%S')] $1"
  echo -e "${BLUE}${BOLD}[ACADEMIA]${NC} $1"
  echo "$msg" >> "$LOG_FILE" 2>&1
}

success() {
  local msg="[$(date +'%Y-%m-%d %H:%M:%S')] [SUCESSO] $1"
  echo -e "${GREEN}${BOLD}✔ $1${NC}"
  echo "$msg" >> "$LOG_FILE" 2>&1
}

warn() {
  local msg="[$(date +'%Y-%m-%d %H:%M:%S')] [AVISO] $1"
  echo -e "${YELLOW}${BOLD}⚠ $1${NC}"
  echo "$msg" >> "$LOG_FILE" 2>&1
}

error_exit() {
  local msg="[$(date +'%Y-%m-%d %H:%M:%S')] [ERRO] $1"
  echo -e "${RED}${BOLD}✖ ERRO: $1${NC}" >&2
  echo "$msg" >> "$LOG_FILE" 2>&1
  echo -e "${RED}Consulte os detalhes em: $LOG_FILE${NC}" >&2
  exit 1
}

trap 'error_exit "Falha inesperada na linha $LINENO (comando: $BASH_COMMAND)"' ERR

# ------------------------------------------------------------------------------
# 2. Validacao de Permissoes e Ambiente
# ------------------------------------------------------------------------------
touch "$LOG_FILE" 2>/dev/null || true

if [ "$EUID" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo -E bash "$0" "$@"
  else
    error_exit "Este script precisa ser executado como root ou com sudo."
  fi
fi

log "Iniciando instalacao do Sistema Academia..."
log "Log detalhado sendo gravado em: $LOG_FILE"

# Detecta sistema operacional
if [ -f /etc/os-release ]; then
  . /etc/os-release
  if [[ "${ID:-}" != "ubuntu" && "${ID_LIKE:-}" != *"ubuntu"* && "${ID_LIKE:-}" != *"debian"* ]]; then
    warn "Sistema operacional detectado: ${NAME:-Linux}. O script foi projetado para Ubuntu/Debian."
  fi
else
  warn "Nao foi possivel detectar o /etc/os-release."
fi

# ------------------------------------------------------------------------------
# 3. Tratamento de Travas do APT (unattended-upgrades / apt-daily)
# ------------------------------------------------------------------------------
wait_for_apt_locks() {
  local timeout=300
  local elapsed=0
  log "Verificando se ha processos do APT/dpkg em execucao..."
  while fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock >/dev/null 2>&1; do
    echo -ne "Aguardando liberacao dos locks do APT ($elapsed s)...\r"
    sleep 4
    elapsed=$((elapsed + 4))
    if [ "$elapsed" -ge "$timeout" ]; then
      warn "Tempo limite aguardando APT esgotado. Tentando continuar..."
      break
    fi
  done
  echo ""
}

# Pausa temporariamente timers de upgrade automatico para evitar conflitos
systemctl stop apt-daily.timer apt-daily-upgrade.timer >/dev/null 2>&1 || true

wait_for_apt_locks

export DEBIAN_FRONTEND=noninteractive

# ------------------------------------------------------------------------------
# 4. Instalacao de Pacotes Base do Sistema
# ------------------------------------------------------------------------------
log "Atualizando listas de pacotes e instalando dependencias basicas..."
apt-get update -y >> "$LOG_FILE" 2>&1

PACKAGES_NEEDED=(
  git
  curl
  wget
  ufw
  lsb-release
  ca-certificates
  gnupg
  build-essential
  python3
  python3-pip
  python3-venv
  postgresql
  postgresql-contrib
  net-tools
  jq
)

apt-get install -y --no-install-recommends "${PACKAGES_NEEDED[@]}" >> "$LOG_FILE" 2>&1
success "Pacotes base e PostgreSQL instalados com sucesso."

# ------------------------------------------------------------------------------
# 5. Instalacao do Node.js LTS (v20)
# ------------------------------------------------------------------------------
install_node() {
  local need_install=false
  if ! command -v node >/dev/null 2>&1; then
    need_install=true
  else
    local node_ver
    node_ver="$(node -v | cut -d'.' -f1 | tr -d 'v')"
    if [ "$node_ver" -lt 18 ]; then
      log "Node.js instalado (v$node_ver) e menor que v18. Atualizando para Node 20 LTS..."
      need_install=true
    fi
  fi

  if [ "$need_install" = true ]; then
    log "Instalando Node.js 20 LTS via repositorio oficial NodeSource..."
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes >> "$LOG_FILE" 2>&1
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    wait_for_apt_locks
    apt-get update -y >> "$LOG_FILE" 2>&1
    apt-get install -y nodejs >> "$LOG_FILE" 2>&1
  fi

  success "Node.js $(node -v) e npm $(npm -v) prontos."
}

install_node

# ------------------------------------------------------------------------------
# 6. Instalacao e Configuracao do Tailscale
# ------------------------------------------------------------------------------
install_tailscale() {
  log "Verificando instalacao do Tailscale..."
  if ! command -v tailscale >/dev/null 2>&1; then
    log "Instalando Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh >> "$LOG_FILE" 2>&1
  fi

  systemctl enable --now tailscaled >> "$LOG_FILE" 2>&1 || true

  if [ -n "${TAILSCALE_AUTHKEY:-}" ]; then
    log "Autenticando Tailscale via TAILSCALE_AUTHKEY com SSH habilitado..."
    tailscale up --authkey="$TAILSCALE_AUTHKEY" --ssh --accept-routes >> "$LOG_FILE" 2>&1 || warn "Falha ao autenticar Tailscale com authkey."
  else
    log "Tailscale instalado e rodando."
    log "Caso queira habilitar o acesso SSH remoto seguro via Tailscale, execute: sudo tailscale up --ssh"
  fi
  success "Tailscale configurado."
}

install_tailscale

# ------------------------------------------------------------------------------
# 7. Configuracao do Banco de Dados PostgreSQL Nativo
# ------------------------------------------------------------------------------
log "Configurando PostgreSQL (banco: $DB_NAME, usuario: $DB_USER)..."
systemctl enable --now postgresql >> "$LOG_FILE" 2>&1

# Aguarda o PostgreSQL ficar pronto para conexoes
until sudo -u postgres pg_isready >/dev/null 2>&1; do
  echo -ne "Aguardando PostgreSQL iniciar...\r"
  sleep 1
done
echo ""

# Cria usuarios e banco de dados se nao existirem
sudo -u postgres psql -v ON_ERROR_STOP=1 >> "$LOG_FILE" 2>&1 <<EOSQL
DO \$\$
BEGIN
  -- Usuario principal solicitado: pauloacad
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}' SUPERUSER CREATEDB;
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}' SUPERUSER CREATEDB;
  END IF;

  -- Alias defensivo para evitar falha por variacao de digitacao: pauloacade
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER_ALIAS}') THEN
    CREATE ROLE ${DB_USER_ALIAS} WITH LOGIN PASSWORD '${DB_PASS}' SUPERUSER CREATEDB;
  ELSE
    ALTER ROLE ${DB_USER_ALIAS} WITH LOGIN PASSWORD '${DB_PASS}' SUPERUSER CREATEDB;
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER_ALIAS};
EOSQL

# Habilita extensoes necessarias e permissoes no schema public do banco academia
sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 >> "$LOG_FILE" 2>&1 <<EOSQL
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT ALL ON SCHEMA public TO ${DB_USER};
GRANT ALL ON SCHEMA public TO ${DB_USER_ALIAS};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER_ALIAS};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER_ALIAS};
EOSQL

# Garante autenticacao por senha para localhost caso necessario
PG_VERSION="$(sudo -u postgres psql -t -A -c 'SHOW server_version;' | cut -d'.' -f1)"
PG_HBA="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"
if [ -f "$PG_HBA" ]; then
  if ! grep -qE "host\s+all\s+pauloacad" "$PG_HBA"; then
    echo "host    all             pauloacad       127.0.0.1/32            scram-sha-256" >> "$PG_HBA"
    echo "host    all             pauloacad       ::1/128                 scram-sha-256" >> "$PG_HBA"
    echo "host    all             pauloacade      127.0.0.1/32            scram-sha-256" >> "$PG_HBA"
    echo "host    all             pauloacade      ::1/128                 scram-sha-256" >> "$PG_HBA"
    systemctl reload postgresql >> "$LOG_FILE" 2>&1 || true
  fi
fi

# Testa conexao com o usuario criado
PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" >/dev/null 2>&1 || {
  error_exit "Nao foi possivel conectar ao PostgreSQL com usuario $DB_USER."
}
success "Banco PostgreSQL e usuarios configurados com sucesso."

# ------------------------------------------------------------------------------
# 8. Download / Clone do Repositorio do Projeto
# ------------------------------------------------------------------------------
CURRENT_DIR="$(pwd)"
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/apps/api/server.js" ]; then
  TARGET_REPO_DIR="$SCRIPT_DIR"
  log "Executando a partir do repositorio local em: $TARGET_REPO_DIR"
elif [ -f "$CURRENT_DIR/apps/api/server.js" ]; then
  TARGET_REPO_DIR="$CURRENT_DIR"
  log "Executando a partir do diretorio atual: $TARGET_REPO_DIR"
else
  TARGET_REPO_DIR="$INSTALL_DIR"
  log "Clonando repositorio $REPO_URL ($REPO_BRANCH) para $TARGET_REPO_DIR..."
  if [ -d "$TARGET_REPO_DIR/.git" ]; then
    log "Diretorio ja existente com Git. Atualizando..."
    git -C "$TARGET_REPO_DIR" fetch origin "$REPO_BRANCH" >> "$LOG_FILE" 2>&1
    git -C "$TARGET_REPO_DIR" checkout "$REPO_BRANCH" >> "$LOG_FILE" 2>&1
    git -C "$TARGET_REPO_DIR" reset --hard "origin/$REPO_BRANCH" >> "$LOG_FILE" 2>&1
  else
    mkdir -p "$(dirname "$TARGET_REPO_DIR")"
    git clone --branch "$REPO_BRANCH" "$REPO_URL" "$TARGET_REPO_DIR" >> "$LOG_FILE" 2>&1
  fi
fi

# Cria symlink de retrocompatibilidade para /mnt/Projetos/Academia
if [ "$TARGET_REPO_DIR" != "$LEGACY_SYMLINK_DIR" ]; then
  mkdir -p "$(dirname "$LEGACY_SYMLINK_DIR")"
  ln -sfn "$TARGET_REPO_DIR" "$LEGACY_SYMLINK_DIR"
  log "Symlink criado: $LEGACY_SYMLINK_DIR -> $TARGET_REPO_DIR"
fi

git config --global --add safe.directory "$TARGET_REPO_DIR" >> "$LOG_FILE" 2>&1 || true
git config --global --add safe.directory "$LEGACY_SYMLINK_DIR" >> "$LOG_FILE" 2>&1 || true

# ------------------------------------------------------------------------------
# 9. Geracao do Arquivo .env da API
# ------------------------------------------------------------------------------
log "Configurando ambiente em apps/api/.env..."
API_DIR="$TARGET_REPO_DIR/apps/api"
WEB_DIR="$TARGET_REPO_DIR/apps/web"

mkdir -p "$API_DIR" "$WEB_DIR/uploads"
chmod 777 "$WEB_DIR/uploads" 2>/dev/null || true

HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
HOST_IP="${HOST_IP:-127.0.0.1}"

TAILSCALE_IP="$(tailscale ip -4 2>/dev/null || true)"

AUTH_SECRET=""
if [ -f "$API_DIR/.env" ]; then
  AUTH_SECRET="$(grep -E '^AUTH_SECRET=' "$API_DIR/.env" | cut -d'=' -f2- | tr -d ' "\r\n' || true)"
fi

if [ -z "$AUTH_SECRET" ] || [ "${#AUTH_SECRET}" -lt 32 ]; then
  AUTH_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
fi

CORS_LIST="http://127.0.0.1:${WEB_PORT},http://localhost:${WEB_PORT},http://${HOST_IP}:${WEB_PORT},https://academialobo.com.br,https://www.academialobo.com.br,http://academialobo.com.br,http://www.academialobo.com.br"
if [ -n "$TAILSCALE_IP" ]; then
  CORS_LIST="${CORS_LIST},http://${TAILSCALE_IP}:${WEB_PORT}"
fi

cat > "$API_DIR/.env" <<EOF
PORT=${API_PORT}
NODE_ENV=production
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}
AUTH_SECRET=${AUTH_SECRET}
AUTH_TOKEN_TTL_MS=28800000
CORS_ALLOWED_ORIGINS=${CORS_LIST}
APP_PUBLIC_URL=https://academialobo.com.br

# Emails e Notificacoes (Configurar se desejar envio ativo)
EMAIL_FROM=contato@academialobo.com.br
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
EMAIL_WEBHOOK_URL=

# Gateways de Pagamento
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_API_URL=https://api.mercadopago.com
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_API_URL=https://api-m.sandbox.paypal.com

# Performance e Seguranca
DB_POOL_MAX=20
REQUEST_BODY_LIMIT_BYTES=1048576
LOGIN_RATE_LIMIT_MAX=10
LOGIN_RATE_LIMIT_WINDOW_MS=900000

# IA Local de Treinos (Opcional - desativada por padrao)
LOCAL_TRAINING_AI_ENABLED=false
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:1b

# Gateway WhatsApp (Opcional)
WHATSAPP_API_URL=
WHATSAPP_API_KEY=
WHATSAPP_INSTANCE=academia
EOF

chmod 600 "$API_DIR/.env"
success "Arquivo apps/api/.env gerado com sucesso."

# ------------------------------------------------------------------------------
# 10. Instalacao de Dependencias NPM e Migracoes do Banco
# ------------------------------------------------------------------------------
log "Instalando dependencias da API com npm..."
cd "$API_DIR"
npm ci --no-bin-links >> "$LOG_FILE" 2>&1 || npm install >> "$LOG_FILE" 2>&1
success "Dependencias da API instaladas."

log "Executando migracoes do banco de dados (npm run migrate)..."
npm run migrate >> "$LOG_FILE" 2>&1
success "Migracoes concluidas com sucesso."

log "Inicializando dados da academia e usuario Administrador ($ADMIN_EMAIL)..."
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" ADMIN_NAME="$ADMIN_NAME" \
  node scripts/init-admin.js >> "$LOG_FILE" 2>&1
success "Administrador e estrutura basica da academia prontos."

# ------------------------------------------------------------------------------
# 11. Configuracao dos Servicos Systemd
# ------------------------------------------------------------------------------
log "Configurando e registrando servicos systemd..."

NPM_BIN="$(command -v npm || echo "/usr/bin/npm")"
PYTHON3_BIN="$(command -v python3 || echo "/usr/bin/python3")"

# 11.1 Servico da API
cat > /etc/systemd/system/academia-api.service <<EOF
[Unit]
Description=Academia API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
WorkingDirectory=${LEGACY_SYMLINK_DIR}/apps/api
Environment=NODE_ENV=production
EnvironmentFile=${LEGACY_SYMLINK_DIR}/apps/api/.env
ExecStart=${NPM_BIN} run start
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

# 11.2 Servico Web (Python)
cat > /etc/systemd/system/academia-web.service <<EOF
[Unit]
Description=Academia Lobo Web
After=network.target academia-api.service
Wants=academia-api.service

[Service]
Type=simple
WorkingDirectory=${LEGACY_SYMLINK_DIR}/apps/web
Environment=PORT=${WEB_PORT}
Environment=API_BASE_URL=http://127.0.0.1:${API_PORT}
ExecStart=${PYTHON3_BIN} site_server.py
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

# 11.3 Servico de Backup Diario Opcional
cat > /etc/systemd/system/academia-backup.service <<EOF
[Unit]
Description=Academia database backup
After=postgresql.service

[Service]
Type=oneshot
EnvironmentFile=${LEGACY_SYMLINK_DIR}/apps/api/.env
Environment=BACKUP_DIR=/mnt/backups/academia
Environment=RETENTION_DAYS=7
ExecStart=/bin/bash ${LEGACY_SYMLINK_DIR}/scripts/backup-academia.sh
EOF

cat > /etc/systemd/system/academia-backup.timer <<EOF
[Unit]
Description=Daily Academia Backup Timer

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload >> "$LOG_FILE" 2>&1
systemctl enable --now academia-api.service >> "$LOG_FILE" 2>&1
systemctl enable --now academia-web.service >> "$LOG_FILE" 2>&1
systemctl enable --now academia-backup.timer >> "$LOG_FILE" 2>&1 || true

systemctl restart academia-api.service >> "$LOG_FILE" 2>&1
systemctl restart academia-web.service >> "$LOG_FILE" 2>&1

success "Servicos systemd ativados e iniciados."

# ------------------------------------------------------------------------------
# 12. Configuracao do Firewall (UFW)
# ------------------------------------------------------------------------------
log "Ajustando regras de firewall (UFW)..."
ufw allow 22/tcp comment 'SSH' >> "$LOG_FILE" 2>&1 || true
ufw allow "${WEB_PORT}/tcp" comment 'Academia Web' >> "$LOG_FILE" 2>&1 || true
ufw allow "${API_PORT}/tcp" comment 'Academia API' >> "$LOG_FILE" 2>&1 || true
ufw --force enable >> "$LOG_FILE" 2>&1 || true
success "Firewall configurado."

# ------------------------------------------------------------------------------
# 13. Verificacao de Integridade e Testes de Saude
# ------------------------------------------------------------------------------
log "Validando funcionamento dos servicos..."

HEALTH_URL="http://127.0.0.1:${API_PORT}/health"
LOGIN_URL="http://127.0.0.1:${API_PORT}/api/auth/login"
WEB_URL="http://127.0.0.1:${WEB_PORT}/"

# Aguarda API responder
API_READY=false
for i in {1..15}; do
  if curl --fail --silent "$HEALTH_URL" >/dev/null 2>&1; then
    API_READY=true
    break
  fi
  sleep 1
done

if [ "$API_READY" = false ]; then
  systemctl status academia-api.service --no-pager >> "$LOG_FILE" 2>&1 || true
  error_exit "A API nao respondeu no endpoint $HEALTH_URL apos 15 segundos."
fi
success "Endpoint de saude da API respondendo OK."

# Valida login do usuario admin criado
LOGIN_RESPONSE="$(curl --silent --header "Content-Type: application/json" \
  --data "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
  "$LOGIN_URL" || true)"

if [[ "$LOGIN_RESPONSE" != *"token"* ]]; then
  error_exit "Falha ao validar login do admin ($ADMIN_EMAIL). Resposta: $LOGIN_RESPONSE"
fi
success "Autenticacao do Administrador ($ADMIN_EMAIL / $ADMIN_PASSWORD) validada com sucesso."

# Valida Frontend Web
if ! curl --fail --silent "$WEB_URL" >/dev/null 2>&1; then
  error_exit "O servidor Web nao respondeu em $WEB_URL."
fi
success "Servidor Web respondendo perfeitamente."

# ------------------------------------------------------------------------------
# 14. Relatorio Final e Informacoes de Acesso
# ------------------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}================================================================${NC}"
echo -e "${GREEN}${BOLD}       INSTALACAO DA ACADEMIA CONCLUIDA COM SUCESSO!            ${NC}"
echo -e "${GREEN}${BOLD}================================================================${NC}"
echo ""
echo -e "${BOLD}Acesso Web:${NC}"
echo -e "  Rede Local:       ${BLUE}http://${HOST_IP}:${WEB_PORT}/${NC}"
if [ -n "$TAILSCALE_IP" ]; then
echo -e "  Tailscale:        ${BLUE}http://${TAILSCALE_IP}:${WEB_PORT}/${NC}"
fi
echo -e "  Painel Admin:     ${BLUE}http://${HOST_IP}:${WEB_PORT}/admin.html${NC}"
echo ""
echo -e "${BOLD}Credenciais do Administrador:${NC}"
echo -e "  E-mail:           ${YELLOW}${ADMIN_EMAIL}${NC}"
echo -e "  Senha:            ${YELLOW}${ADMIN_PASSWORD}${NC}"
echo ""
echo -e "${BOLD}Banco de Dados PostgreSQL:${NC}"
echo -e "  Host:             127.0.0.1:5432"
echo -e "  Banco:            ${DB_NAME}"
echo -e "  Usuario:          ${YELLOW}${DB_USER}${NC} (alias: ${DB_USER_ALIAS})"
echo -e "  Senha:            ${YELLOW}${DB_PASS}${NC}"
echo -e "  URL de Conexao:   postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"
echo ""
echo -e "${BOLD}Acesso Remoto Tailscale SSH:${NC}"
if [ -n "$TAILSCALE_IP" ]; then
echo -e "  Status:           Ativo (${TAILSCALE_IP})"
echo -e "  SSH Remoto:       ssh <usuario>@${TAILSCALE_IP}"
else
echo -e "  Para vincular sua conta Tailscale e permitir SSH seguro:"
echo -e "  ${YELLOW}sudo tailscale up --ssh${NC}"
fi
echo ""
echo -e "${BOLD}Comandos Uteis de Manutencao:${NC}"
echo -e "  Status dos servicos:   sudo systemctl status academia-api academia-web"
echo -e "  Reiniciar servicos:    sudo systemctl restart academia-api academia-web"
echo -e "  Ver logs da API:       sudo journalctl -u academia-api -f"
echo -e "  Ver logs Web:          sudo journalctl -u academia-web -f"
echo -e "  Log desta instalacao:  ${LOG_FILE}"
echo ""
echo -e "${GREEN}${BOLD}================================================================${NC}"
