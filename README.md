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
