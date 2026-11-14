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
1. Aplique `supabase/migrations/*.sql` em ordem (SQL Editor do Supabase ou `supabase db push`).
2. Crie os dois usuários em Authentication → Users, troque os e-mails em `supabase/seeds/aventure.sql` e rode o arquivo uma única vez.
3. `npm test` valida o schema, a RLS e o cálculo de fatura em um Postgres local (PGlite), sem tocar no banco real.
