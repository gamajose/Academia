# Credencial dinâmica de acesso do aluno

## Regra de negócio

O aluno precisa estar autenticado no aplicativo. A credencial é vinculada ao cadastro e à conta do próprio aluno. Antes de emitir a credencial e novamente quando a catraca tenta utilizá-la, a API consulta cadastro, matrícula, vigência e situação financeira.

- Situação regular: acesso liberado.
- Pendência dentro da carência configurada: acesso liberado com alerta.
- Pendência acima da carência: acesso bloqueado.
- Cadastro ou matrícula inativa: acesso bloqueado.

A carência padrão pode ser alterada com `ACCESS_GRACE_DAYS`. A credencial expira em 30 segundos por padrão e pode ser ajustada com `ACCESS_QR_TTL_SECONDS` entre 15 e 120 segundos.

## O que aparece no aplicativo

A API gera simultaneamente:

- um QR Code temporário;
- um código numérico de 6 dígitos;
- uma única validade para os dois formatos.

QR e código representam a mesma credencial. Quando um deles é utilizado, o outro também deixa de funcionar. O aplicativo renova os dois automaticamente antes do vencimento.

## Fluxo

1. O aluno entra no aplicativo usando `/api/student/auth/login`.
2. O aplicativo consulta `/api/student/access/status`.
3. O aplicativo solicita a credencial em `POST /api/student/access/credential`.
4. A tela exibe o QR e o código numérico, renovados automaticamente.
5. O leitor envia o QR ou o código para `POST /api/access/redeem-student-credential` com a chave do dispositivo.
6. A API identifica o cadastro vinculado, revalida a situação e cria o check-in apenas quando o acesso estiver liberado.

Os endpoints antigos com sufixo `qr` continuam aceitos para compatibilidade com leitores já configurados.

## Cadastrar uma catraca ou leitor

Somente usuários com a permissão `access` podem cadastrar dispositivos.

```bash
curl -X POST http://localhost:3004/api/access/devices \
  -H "Authorization: Bearer TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Catraca principal"}'
```

A resposta mostra `api_key` uma única vez. Essa chave deve ser guardada no software do leitor e nunca colocada no aplicativo do aluno.

## Validar o QR no leitor

```bash
curl -X POST http://localhost:3004/api/access/redeem-student-credential \
  -H "X-Access-Device-Key: CHAVE_DA_CATRACA" \
  -H "Content-Type: application/json" \
  -d '{"qr_payload":"CONTEUDO_LIDO_DO_QR"}'
```

## Validar o código numérico

```bash
curl -X POST http://localhost:3004/api/access/redeem-student-credential \
  -H "X-Access-Device-Key: CHAVE_DA_CATRACA" \
  -H "Content-Type: application/json" \
  -d '{"access_code":"483921"}'
```

Quando liberado, a resposta contém `allowed: true` e `action: unlock`. Quando bloqueado, contém `allowed: false` e `action: deny`.

Credencial expirada, reutilizada ou inválida retorna HTTP 410 e nunca libera a catraca.

## Segurança

- O QR contém apenas um segredo aleatório temporário.
- O código numérico dura poucos segundos e só vale na academia vinculada.
- QR e código são de uso único.
- O banco armazena somente hashes, nunca o token ou código em texto puro.
- A utilização registra dispositivo, aluno, resultado, motivo e horário.
- Um novo ciclo invalida a credencial anterior do mesmo aluno.

## Auditoria

As estruturas principais são:

- `access_devices`: leitores e catracas autorizados;
- `student_access_tokens`: credenciais temporárias emitidas;
- `access_decisions`: tentativas liberadas e bloqueadas;
- `checkins`: entradas efetivamente autorizadas.

Administradores podem consultar as últimas decisões em `GET /api/access/decisions/recent`.
