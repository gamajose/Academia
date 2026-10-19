# Guia de Instalação Automática em VM Ubuntu (Máquina do Cliente)

Este guia documenta o processo de provisionamento do sistema **Academia** em uma máquina ou máquina virtual com **Ubuntu recém-instalado (a seco)**, sem necessidade de configuração manual prévia.

---

## 1. Comando Único de Instalação (Recomendado)

Na VM recém-instalada, abra o terminal e execute o comando abaixo como root (ou via `sudo`):

```bash
curl -fsSL https://raw.githubusercontent.com/gamajose/Academia/main/scripts/install-ubuntu.sh | sudo bash
```

Se o repositório já foi clonado na máquina:
```bash
cd /opt/academia # ou onde estiver clonado
sudo ./scripts/install-ubuntu.sh
```

---

## 2. O que o Script Executa Automaticamente

1. **Tratamento de Travas do Sistema Operacional**:
   - Aguarda liberação de locks automáticos do APT (`unattended-upgrades`, `apt-daily`) típicos de VMs recém-iniciadas.
2. **Instalação de Pacotes Base**:
   - `git`, `curl`, `wget`, `ufw`, `ca-certificates`, `gnupg`, `build-essential`.
   - `python3`, `python3-pip`, `python3-venv` (necessários para o servidor Web da aplicação).
   - `postgresql`, `postgresql-contrib` (PostgreSQL nativo na máquina).
   - `jq`, `net-tools`.
3. **Instalação do Node.js 20 LTS**:
   - Adiciona repositório oficial NodeSource e instala `nodejs` e `npm`.
4. **Instalação e Configuração do Tailscale**:
   - Instala o pacote oficial do Tailscale.
   - Ativa o serviço `tailscaled`.
   - Prepara para acesso SSH remoto seguro.
5. **Configuração Nativa do PostgreSQL**:
   - Cria o banco `academia`.
   - Cria o usuário `pauloacad` com a senha `Paulo1`.
   - Cria o alias `pauloacade` com senha `Paulo1` para evitar falha por digitação.
   - Habilita extensões (`pgcrypto`) e permissões completas de superusuário e schema.
6. **Clone e Estrutura de Pastas**:
   - Clona o repositório `https://github.com/gamajose/Academia.git` em `/opt/academia`.
   - Cria o symlink `/mnt/Projetos/Academia` -> `/opt/academia` para compatibilidade total com rotinas legadas e pipelines.
7. **Configuração de Ambiente (`apps/api/.env`)**:
   - Configura a string de conexão: `postgresql://pauloacad:Paulo1@127.0.0.1:5432/academia`.
   - Gera `AUTH_SECRET` seguro com 64 caracteres hexadecimais.
   - Detecta IP local da máquina e IP do Tailscale e configura `CORS_ALLOWED_ORIGINS` e `APP_PUBLIC_URL`.
8. **Migrações e Inicialização do Administrador**:
   - Executa `npm install` e `npm run migrate` (todas as tabelas do banco).
   - Executa `node scripts/init-admin.js`, criando:
     - Academia ativa padrão (`Academia Lobo`).
     - Perfis de acesso e permissões.
     - Planos padrão (`Essencial`, `Performance`, `Premium`).
     - Níveis de treino padrão (`Frango`, `Intermediário`, `Avançado`).
     - Usuário Administrador com credenciais:
       - **E-mail:** `admin@academia.com`
       - **Senha:** `Paulo1`
9. **Serviços Systemd (Reinício Automático)**:
   - Registra e ativa `academia-api.service` (Node.js porta 3004).
   - Registra e ativa `academia-web.service` (Python porta 8084).
   - Registra timer de backup diário do banco.
10. **Firewall (UFW)**:
    - Libera portas 22 (SSH), 8084 (Web) e 3004 (API).
11. **Validação e Teste de Saúde**:
    - Testa endpoint `/health` da API.
    - Simula autenticação do usuário `admin@academia.com` com `Paulo1` no endpoint `/api/auth/login` e valida geração de token JWT.
    - Valida resposta do servidor Web.

---

## 3. Credenciais e Dados de Acesso

| Recurso | Detalhe |
|---|---|
| **Painel Web da Academia** | `http://<IP_DA_VM>:8084/` |
| **Painel Administrativo** | `http://<IP_DA_VM>:8084/admin.html` |
| **E-mail do Admin** | `admin@academia.com` |
| **Senha do Admin** | `Paulo1` |
| **Banco de Dados** | `postgresql://pauloacad:Paulo1@127.0.0.1:5432/academia` |
| **Usuário PostgreSQL** | `pauloacad` (e `pauloacade`) |
| **Senha PostgreSQL** | `Paulo1` |
| **Porta Web** | `8084` |
| **Porta API** | `3004` |
| **Porta Banco** | `5432` |

---

## 4. Habilitar Acesso Remoto com Tailscale SSH

Após a instalação, para conectar a máquina à sua conta do Tailscale e acessar o SSH de qualquer lugar sem precisar abrir portas no roteador do cliente:

```bash
sudo tailscale up --ssh
```

O comando exibirá uma URL de autenticação para você abrir no navegador e vincular a máquina à sua rede Tailscale.

---

## 5. Comandos de Manutenção

- **Ver status dos serviços:**
  ```bash
  sudo systemctl status academia-api academia-web
  ```
- **Reiniciar os serviços:**
  ```bash
  sudo systemctl restart academia-api academia-web
  ```
- **Acompanhar logs em tempo real:**
  ```bash
  sudo journalctl -u academia-api -f
  sudo journalctl -u academia-web -f
  ```
- **Consultar log da instalação:**
  ```bash
  cat /var/log/academia-install.log
  ```
