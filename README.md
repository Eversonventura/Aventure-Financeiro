# Caixa Aventure

Caixa único da família e da Aventure: lançamento rápido pelo celular, DRE e fluxo de caixa no computador.
Especificação: [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md). Regras de desenvolvimento: [AGENTS.md](AGENTS.md).

## Rodar localmente
```bash
cp .env.example .env.local   # preencha as chaves do Supabase
npm install
npm run dev
```
Scripts: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Banco (Supabase)
1. Aplique `supabase/migrations/*.sql` em ordem (cada arquivo uma única vez; a `20261115000001_cash_opening_balance.sql` é a da etapa 6) (SQL Editor do Supabase ou `supabase db push`).
2. Crie os dois usuários em Authentication → Users, troque os e-mails em `supabase/seeds/aventure.sql` e rode o arquivo uma única vez.
3. `npm test` valida o schema, a RLS e o cálculo de fatura em um Postgres local (PGlite), sem tocar no banco real.

## Variáveis de ambiente (Vercel)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (só servidor), `CRON_SECRET` e `ANTHROPIC_API_KEY` (importação da planilha e classificação). O nome do modelo pode ser trocado em `ANTHROPIC_MODEL_SONNET`.

## Recorrências
`vercel.json` agenda `GET /api/cron/recorrencias` todo dia às 05:00 (Fortaleza). A rota exige `Authorization: Bearer $CRON_SECRET`
(a Vercel envia isso sozinha quando `CRON_SECRET` está cadastrada) e gera os lançamentos previstos do mês. É idempotente.

## Importação da planilha
`Importações` → enviar o .xlsx. O Claude lê o layout e monta um mapa de blocos; você confere (tipo, mês, cartão) e vê uma prévia antes de importar.
Parcelas `n/N` viram um único grupo, assinaturas e contas fixas viram recorrências, a fatura do cartão não entra como despesa e reimportar não duplica.
Dá para desfazer a importação inteira. Aplique antes a migration `20261115000002_imports.sql`.

## Classificação (etapa 8)
Cada lançamento novo (lançamento rápido e importação) passa por: regra exata (`classification_rules`) → histórico (mesmo texto confirmado 3 vezes vira regra) → Claude Haiku.
Confiança de 0,80 ou mais entra direto; abaixo disso vai para `Revisão`, com a sugestão guardada e sem alterar o DRE até alguém confirmar.
Variáveis: `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL_HAIKU` (padrão `claude-haiku-5-5`). Aplique antes a migration `20261115000003_ai_suggestion.sql`.

## Voz e foto (etapa 9)
No lançamento rápido, o botão **Voz** transcreve no navegador (Web Speech API, ou o ditado do teclado) e o Claude Sonnet vira a frase em campos do formulário.
O botão **Foto do cupom** reduz a imagem no celular, guarda em `receipts/{org}/{lançamento}.jpg` (bucket privado) e o Claude Sonnet lê estabelecimento, data, total e parcelas.
Nada é salvo sozinho: a pessoa confere e toca em Salvar. Valor ilegível volta vazio. O cupom abre por link assinado de 60 segundos. Não precisa de migration nova.

## DRE completo (etapa 10)
`DRE` mostra o mês na estrutura da especificação (ME, Simples Nacional), com % da receita, mês anterior, variação e média dos 3 meses anteriores. Clicar numa linha abre os lançamentos dela (`/dre/<linha>`).
O DAS vale o pago quando há lançamento; sem ele, usa a alíquota efetiva × receita (Configurações → Geral) e mostra a conferência quando os dois existem.
`DRE → Gastos da Aventure fora do PJ` lista o que é da empresa mas caiu em meio pessoal e permite migrar a recorrência para o cartão PJ.
Aplique antes a migration `20261115000004_dre_signed.sql` (separa entradas e saídas dentro de cada linha do DRE).

## Ajustes de uso (feedback)
- Lançamento: categoria em lista suspensa com "+ Nova categoria"; entrada com "Quem recebe" e cliente (com "+ Novo cliente").
- Configurações: apagar pessoas, entidades, categorias e clientes que já têm lançamentos (entidades movem o que as usa para outra). Aplique a migration `20261115000005_safe_deletes.sql`.
- `Clientes`: cadastro mensal simples (nome, valor, dia), painel do mês (esperado, recebido, atrasados, concentração) e marcar como recebido.

## Empréstimos e consórcios
`Empréstimos e consórcios` cadastra empréstimo, financiamento ou consórcio (nome, parcela, total, quantas já foram pagas, próximo vencimento) e gera as parcelas que faltam como lançamentos previstos ligados por `commitment_id`.
Elas entram no fluxo de caixa, em Contas do mês (onde se marca como paga, com o valor real) e no Início. Editar valor ou total atualiza só as parcelas não pagas; encerrar remove as futuras.
Aplique antes a migration `20261115000006_commitments.sql`.

## Asaas (etapa 11)
Variáveis na Vercel: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` (e, para testar no sandbox, `ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3`).
Webhook do Asaas apontando para `https://<seu-dominio>/api/webhooks/asaas`, com o mesmo token no cabeçalho `asaas-access-token`.
Cobrança recebida ou confirmada baixa a mensalidade do cliente (valor real e data do dinheiro, tarifa registrada); o id do evento garante que repetir não duplica; estorno desfaz.
`/api/cron/asaas` roda todo dia às 05:30 (Fortaleza) e baixa o que o webhook possa ter perdido. Tela: Configurações → Integração Asaas. Aplique antes a migration `20261115000007_asaas.sql`.

## Analista financeiro (etapa 12)
Todo dia 1 (06:00 em Fortaleza, `/api/cron/analista`) o Claude Opus escreve o relatório do mês anterior (`ANTHROPIC_MODEL_OPUS`, padrão `claude-opus-5-5`).
Ele recebe só **dados agregados** (DRE, gasto por categoria, entidade e pessoa, assinaturas, alertas), nunca a lista de lançamentos. A resposta é validada por Zod antes de salvar em `ai_insights`.
O chat usa 4 ferramentas de leitura pré-definidas (`gasto_por_categoria`, `dre_do_mes`, `fluxo_projetado`, `lancamentos_filtrados`), sem SQL livre, sempre com a sessão do usuário e filtrando pela organização (`ANTHROPIC_MODEL_CHAT`, padrão Sonnet).
Aplique antes a migration `20261115000008_ai_insights_unique.sql`. Tela: Analista IA.
