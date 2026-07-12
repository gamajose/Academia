# Financeiro, vendas e operação

## Financeiro administrativo

O painel **Financeiro e vendas** reúne:

- recebimentos do dia e do mês;
- contas a receber e inadimplência;
- baixa com desconto, multa, juros e forma de pagamento;
- recibo numerado gerado automaticamente;
- renegociação com parcelamento;
- abertura, reforço, retirada, despesa e fechamento de caixa;
- leads vindos da página pública.

## Página pública de planos

Arquivo: `apps/web/plans.html`

A página usa a API pública:

- `GET /api/public/catalog`
- `POST /api/public/leads`

Parâmetros opcionais da URL:

- `api`: URL base da API;
- `gym`: slug da academia.

Exemplo:

```text
/plans.html?api=https://academia.exemplo.com&gym=academia-lobo
```

## Console operacional

Arquivo: `apps/software/operations_console.py`

Execução:

```bash
python3 apps/software/operations_console.py
```

O console utiliza somente Python e Tkinter. Ele oferece:

- status das catracas;
- acessos em tempo real;
- busca de aluno;
- indicação de bloqueio financeiro;
- abertura manual auditada;
- fila local curta para indisponibilidade da API.

Por segurança, comandos offline expiram após cinco minutos e precisam de confirmação antes do reenvio.

## Rotas operacionais

- `GET /api/operations/live`
- `GET /api/operations/members?q=...`
- `POST /api/operations/manual-unlock`

## Rotas financeiras

- `GET /api/finance/operations/overview`
- `GET /api/finance/receivables`
- `POST /api/finance/payments/settle`
- `POST /api/finance/agreements`
- `GET /api/finance/receipts`
- `GET /api/finance/cash`
- `POST /api/finance/cash/open`
- `POST /api/finance/cash/movement`
- `POST /api/finance/cash/close`

## Implantação

A migration `026_finance_sales_and_operations.sql` é aplicada automaticamente pelo deploy da `main`.
