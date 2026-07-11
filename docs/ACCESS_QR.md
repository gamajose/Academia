# Acesso por QR Code do aluno

## Regra de negocio

O aluno precisa estar autenticado no aplicativo. A API consulta o cadastro, a matricula e a mensalidade antes de emitir o QR e novamente quando a catraca tenta utiliza-lo.

- Situacao regular: acesso liberado.
- Pendencia entre 1 e 10 dias: acesso liberado com alerta de carencia.
- Pendencia a partir do 11o dia: acesso bloqueado.
- Cadastro ou matricula inativa: acesso bloqueado.

A carencia padrao pode ser alterada com `ACCESS_GRACE_DAYS`. O QR expira em 30 segundos por padrao e pode ser ajustado com `ACCESS_QR_TTL_SECONDS` entre 15 e 120 segundos.

## Fluxo

1. O aluno entra no app usando `/api/student/auth/login`.
2. O app consulta `/api/student/access/status`.
3. O app solicita um codigo em `POST /api/student/access/qr`.
4. A tela exibe um QR opaco, temporario e de uso unico.
5. O leitor envia o conteudo para `POST /api/access/redeem-student-qr` com sua chave de dispositivo.
6. A API revalida a situacao financeira, registra a decisao e cria o check-in apenas quando o acesso estiver liberado.

## Cadastrar uma catraca ou leitor

Somente `owner` ou `admin` pode cadastrar dispositivos.

```bash
curl -X POST http://localhost:3004/api/access/devices \
  -H "Authorization: Bearer TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Catraca principal"}'
```

A resposta mostra `api_key` uma unica vez. Essa chave deve ser guardada no software do leitor e nunca colocada no aplicativo do aluno.

Para listar os dispositivos:

```bash
curl http://localhost:3004/api/access/devices \
  -H "Authorization: Bearer TOKEN_ADMIN"
```

## Validar o QR no leitor

```bash
curl -X POST http://localhost:3004/api/access/redeem-student-qr \
  -H "X-Access-Device-Key: CHAVE_DA_CATRACA" \
  -H "Content-Type: application/json" \
  -d '{"qr_payload":"CONTEUDO_LIDO_DO_QR"}'
```

Quando liberado:

```json
{
  "allowed": true,
  "action": "unlock",
  "access": {
    "status": "current",
    "overdue_days": 0
  }
}
```

Durante a carencia, `action` continua como `unlock`, mas `access.status` sera `grace_period` e o aplicativo exibira o alerta.

Quando bloqueado:

```json
{
  "allowed": false,
  "action": "deny",
  "access": {
    "status": "blocked",
    "overdue_days": 11
  }
}
```

QR expirado, reutilizado ou invalido retorna HTTP 410 e nunca libera a catraca.

## Auditoria

As tabelas abaixo sao criadas pela migration `022_student_access_qr.sql`:

- `access_devices`: leitores e catracas autorizados.
- `student_access_tokens`: codigos temporarios emitidos para alunos.
- `access_decisions`: tentativas liberadas e bloqueadas, com motivo e dias de atraso.

Administradores podem consultar as ultimas decisoes em:

```text
GET /api/access/decisions/recent
```

O QR nao contem nome, e-mail, identificador direto do aluno ou dados financeiros. Ele carrega somente um segredo aleatorio temporario, armazenado no banco apenas como hash.
