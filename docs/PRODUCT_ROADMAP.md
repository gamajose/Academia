# Roadmap de produto - Academia Platform

Este documento organiza as melhorias funcionais do produto em entregas pequenas, testaveis e seguras.

## Entrega 1 - Plano, pagamentos, notificacoes e acesso

Status: implementada nesta branch.

- Minha conta do aluno
- Meu plano e vigencia
- Historico de pagamentos
- Data prevista de bloqueio
- Historico de entradas
- Frequencia semanal e mensal
- Notificacoes automaticas e administrativas
- Controle administrativo das catracas
- Status online e offline
- Abertura manual e teste
- Ativacao, desativacao e troca de chave
- Fila segura de comandos para o leitor

## Entrega 2 - Ficha completa do aluno

Status: proxima.

- Dados pessoais e foto
- CPF, nascimento, endereco e contato de emergencia
- Objetivo, restricoes e observacoes
- Professor responsavel
- Abas de matricula, financeiro, treino, avaliacoes, frequencia e documentos
- Pesquisa, filtros e indicadores de pendencia

## Entrega 3 - Criador profissional de treinos

- Ficha por dias da semana
- Series, repeticoes, carga, descanso e cadencia
- Metodo de treino e exercicio substituto
- Video e instrucoes
- Regra de progressao de carga
- Registro de carga e esforco pelo aluno
- Feedback do professor
- Revisao e vencimento da ficha

## Entrega 4 - Evolucao e metas

- Graficos de peso, medidas, gordura corporal e desempenho
- Comparacao entre avaliacoes
- Progresso percentual de metas
- Calendario de treinos realizados
- Relatorio de aderencia e frequencia

## Entrega 5 - Agenda e aulas

- Cadastro de aulas, salas, professores e capacidade
- Horarios recorrentes
- Reserva e cancelamento pelo aluno
- Fila de espera
- Lista de participantes e presenca
- Lembretes
- Restricao por plano

## Entrega 6 - Financeiro completo

- Contas a receber
- Recebimentos do dia
- Multa, juros, desconto e renegociacao
- Recibos e comprovantes
- Fechamento mensal
- Alunos em carencia e bloqueados
- Cobranca direcionada
- Historico financeiro por aluno

## Entrega 7 - Planos comerciais

- Periodicidade e taxa de matricula
- Horarios e unidades permitidas
- Servicos incluidos
- Renovacao automatica
- Multa de cancelamento
- Promocao e periodo de teste
- Comparacao publica dos planos

## Entrega 8 - Relatorios administrativos

- Receita prevista e recebida
- Inadimplencia
- Matriculas e cancelamentos
- Entradas por dia e horario
- Frequencia por aluno
- Planos mais vendidos
- Exportacao CSV e PDF

## Entrega 9 - Segunda modalidade de QR Code

- QR dinamico exibido pela academia
- Leitura pelo aplicativo autenticado do aluno
- Validade curta e uso unico
- Validacao de unidade e leitor
- Confirmacao visual do check-in

## Entrega 10 - Software operacional da academia

- Monitor de entradas em tempo real
- Foto do aluno na validacao
- Pesquisa rapida
- Abertura manual auditada
- Indicador de conexao
- Fila local durante indisponibilidade
- Caixa e recibos
- Relatorio de turno

## Entrega 11 - Pagina publica e contratacao

- Comparacao de planos
- Estrutura, professores, aulas e horarios
- Perguntas frequentes e depoimentos
- Contratacao online
- Primeiro pagamento
- Criacao de senha e orientacao de primeiro acesso

## Regra de entrega

Cada entrega deve seguir o mesmo fluxo:

1. branch separada;
2. migration aditiva e reversivel quando possivel;
3. testes da API;
4. analise Flutter;
5. pull request;
6. merge somente com validacoes verdes;
7. deploy automatico da main;
8. validacao do health check.
