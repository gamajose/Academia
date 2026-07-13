# Credenciais de acesso do aluno

## Visão geral

O acesso possui dois modos complementares:

1. **Credencial dinâmica:** QR Code e código de 6 dígitos, renovados automaticamente.
2. **Credencial sem internet:** matrícula fixa de 6 dígitos e PIN fixo de 4 dígitos.

A credencial dinâmica é o modo principal. A matrícula e o PIN existem para situações em que o celular do aluno está sem conexão. Nos dois casos, a catraca consulta a API e revalida cadastro, matrícula, vigência e situação financeira antes de liberar.

## Regras de negócio

- Situação regular: acesso liberado.
- Pendência dentro da carência configurada: acesso liberado com alerta.
- Pendência acima da carência: acesso bloqueado.
- Cadastro ou matrícula inativa: acesso bloqueado.

A carência pode ser configurada por `ACCESS_GRACE_DAYS`. A credencial dinâmica expira em 30 segundos por padrão e pode ser ajustada por `ACCESS_QR_TTL_SECONDS`, entre 15 e 120 segundos.

## Credencial dinâmica

A API gera simultaneamente:

- um QR Code temporário;
- um código numérico de 6 dígitos;
- uma única validade para os dois formatos.

QR e código representam a mesma credencial. Quando um deles é utilizado, o outro também deixa de funcionar. O aplicativo renova ambos automaticamente.

### Gerar no aplicativo

```text
POST /api/student/access/credential
```

### Validar na catraca

```bash
curl -X POST http://localhost:3004/api/access/redeem-student-credential \
  -H "X-Access-Device-Key: CHAVE_DA_CATRACA" \
  -H "Content-Type: application/json" \
  -d '{"qr_payload":"CONTEUDO_LIDO_DO_QR"}'
```

Ou:

```bash
curl -X POST http://localhost:3004/api/access/redeem-student-credential \
  -H "X-Access-Device-Key: CHAVE_DA_CATRACA" \
  -H "Content-Type: application/json" \
  -d '{"access_code":"483921"}'
```

## Acesso sem internet no celular

Cada aluno recebe:

- uma matrícula aleatória e única de 6 dígitos dentro da academia;
- um PIN de 4 dígitos derivado de um segredo individual;
- armazenamento local no aplicativo após a primeira sincronização.

O PIN não é armazenado em texto puro no banco. O banco guarda um segredo aleatório do aluno e a API calcula o PIN usando HMAC com `AUTH_SECRET`.

### Consultar no aplicativo

```text
GET /api/student/access/offline-credential
```

O aplicativo salva matrícula e PIN no aparelho. Assim, mesmo sem internet, o aluno consegue visualizá-los e digitá-los na catraca.

### Validar na catraca

```bash
curl -X POST http://localhost:3004/api/access/redeem-student-credential \
  -H "X-Access-Device-Key: CHAVE_DA_CATRACA" \
  -H "Content-Type: application/json" \
  -d '{"registration_number":"123456","pin":"4821"}'
```

A catraca ou computador conectado continua precisando alcançar a API. O modo offline elimina somente a necessidade de internet no celular do aluno.

Após tentativas incorretas consecutivas, o uso do PIN é bloqueado temporariamente. Os padrões são 5 tentativas em 5 minutos e podem ser alterados por:

```text
ACCESS_OFFLINE_PIN_FAILURE_LIMIT
ACCESS_OFFLINE_PIN_WINDOW_MINUTES
```

## Prévia administrativa

Na tela **Alunos**, o botão **Ver credencial** abre uma prévia real da tela do aluno com:

- QR Code temporário;
- código temporário;
- contagem regressiva;
- situação do acesso;
- matrícula fixa;
- PIN fixo;
- opção para gerar um novo PIN.

A prévia exige permissão do módulo `access`. O QR gerado na prévia possui curta duração e não invalida a credencial dinâmica que já esteja aberta no celular do aluno.

Endpoints:

```text
POST /api/access/member-credential/preview
POST /api/access/member-offline-pin/reset
```

## Cadastrar uma catraca ou leitor

```bash
curl -X POST http://localhost:3004/api/access/devices \
  -H "Authorization: Bearer TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Catraca principal"}'
```

A resposta mostra `api_key` uma única vez. Essa chave deve ficar no software da catraca e nunca no aplicativo do aluno.

## Segurança e auditoria

- QR e código dinâmico são temporários e de uso único.
- Matrícula e PIN sempre são revalidados no servidor.
- O PIN possui bloqueio temporário após erros consecutivos.
- A API não inclui nome, e-mail ou dados financeiros no QR.
- O banco armazena hashes dos códigos dinâmicos.
- Toda tentativa gera decisão de acesso com resultado, motivo, aluno, dispositivo e horário.
- Check-in só é criado quando a liberação é autorizada.

Estruturas principais:

- `access_devices`;
- `student_access_tokens`;
- `access_decisions`;
- `checkins`;
- `members.access_number`;
- `members.offline_pin_seed`.
