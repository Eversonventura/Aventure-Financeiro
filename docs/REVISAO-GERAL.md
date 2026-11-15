# Revisão geral antes da V3

Data: 15/11/2026 · Escopo: MVP + V2 (etapas 1 a 13) e os ajustes de uso.

## 1. O que foi verificado e está bem
- **Banco:** as 17 tabelas têm RLS; as 12 views (`security_invoker`) respeitam a RLS; as 3 funções com privilégio elevado fixam `search_path`; as funções de apagar rodam com as permissões de quem chama; nenhum anônimo lê nada. Há testes de isolamento entre organizações e de papéis (viewer só lê, só o dono apaga).
- **Rotas e ações:** as 12 rotas `/api` e todas as ações de servidor exigem login (ou token próprio, no caso do cron e do webhook, comparado em tempo constante). A chave de serviço só existe em `lib/supabase/admin.ts` (`server-only`); só URL e chave pública vão para o navegador.
- **Entradas:** uploads com limite de tamanho e conferência do conteúdo (não só da extensão); respostas da IA validadas com Zod antes de gravar; nenhum HTML cru nem `eval`; erros não vazam detalhes.
- **Dinheiro:** sempre em centavos inteiros; testes de arredondamento; lançamento, recorrência e webhook do Asaas são idempotentes (provado com testes).
- **Testes:** 329+ testes (lógica, banco em Postgres local e rotas).

## 2. Corrigido nesta revisão
| Item | Antes | Agora |
|---|---|---|
| Autenticação por página | 2 a 3 consultas de login por navegação | 1 (`getCtx` com `cache`); cron e webhook pulam a consulta |
| Índices | quase nenhuma chave estrangeira indexada | migration `…0009_indexes.sql` |
| Cabeçalhos de segurança | nenhum | nosniff, anti-frame, HSTS, referrer, permissões; `noindex` + `robots.txt` |
| Telas que quebram | página em branco | `error.tsx`, `loading.tsx`, `not-found.tsx` |
| Sair do sistema | cache de telas ficava no aparelho | apaga o cache ao sair |
| Verificação do que falta | manual | tela **Configurações → Diagnóstico** (chaves, migrations, configurações) |
| Cobertura dos caminhos que gravam no banco | endpoint de lançamento e gerador de recorrências sem teste | 12 + 6 testes novos |

## 3. Pendências, por prioridade

### Antes de usar de verdade (bloqueia)
1. Aplicar as migrations 1 a 9 no Supabase, em ordem (a tela Diagnóstico mostra quais faltam).
2. Cadastrar na Vercel: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, e `ASAAS_API_KEY` + `ASAAS_WEBHOOK_TOKEN` se for usar o Asaas.
3. Colocar o código em produção: hoje tudo está na branch `claude/new-session-isoe9a` (não existe `main`). Criar `main`, apontar a produção da Vercel para ela e proteger a branch.
4. Confirmar o **backup** do Supabase (diário no plano Pro; ponto no tempo é opcional e pago).
5. Validar com dados reais o que eu não consegui testar: webhook e API do Asaas, leitura de PDF da fatura, importação da sua planilha, nomes dos modelos da Anthropic no seu ambiente.

### Importante (primeiras semanas)
6. Ligar a verificação em dois fatores no GitHub, Vercel, Supabase e Asaas.
7. Definir um **limite de gasto** no console da Anthropic (a IA é chamada em lançamento, voz, foto, importação, relatório e chat) e, se quiser, limite de uso por usuário.
8. Configurar um **SMTP próprio** no Supabase para o link de login (o envio padrão tem limite baixo de e-mails por hora).
9. **CI no GitHub** (lint, typecheck, testes e build a cada envio). Não criei o arquivo porque o acesso que tenho ao GitHub não publica workflows.
10. **Monitoramento de erros** (por exemplo, Sentry) e alerta quando o webhook ou o cron falharem. Hoje só há os logs da Vercel.
11. **Alerta semanal de fila de revisão pendente** (previsto na tabela de riscos da especificação; não implementado).
12. **Testes ponta a ponta** (Playwright) das jornadas críticas: login, lançar, lançar sem internet e voltar. Hoje as telas e as ações de servidor não têm teste automatizado (cobertura de `lib` + `api` ≈ 74%).

### Dívida técnica (baixo risco)
- `exceljs` depende de uma versão do `uuid` com aviso moderado; não afeta o nosso uso (não passamos buffer), acompanhar atualização.
- Consultas com limite de 1.000 linhas do servidor: histórico de classificação (usa as 1.000 mais recentes) e "parcelamentos em andamento" em Cartões. Hoje cabem; paginar se crescer.
- `auth.getUser()` pode virar verificação local do token (mais rápida).
- Sem política de conteúdo (CSP): exige ajuste fino com o Next; fazer na V3.
- Fotos de cupom e planilhas ficam no Storage mesmo quando o lançamento é apagado (limpeza de órfãos).
- O fuso `America/Fortaleza` está fixo no código (por organização só na V3).

## 4. Decisões de produto que tomei e você deve confirmar
- DRE: parcelas contam no mês de cada parcela; "% da receita" usa receita bruta; média = 3 meses anteriores; empréstimo/consórcio da Aventure entra inteiro como despesa (o correto é só juros — falar com a contadora).
- Importação da planilha: data de compra no cartão = meio do período da fatura; tudo entra sem categoria.
- Cartão sem fechamento/vencimento bloqueia o lançamento.
- Conferência de fatura: valor e data iguais bastam (descrição só desempata).
- Decisões em aberto da especificação (seção 10): titular do Itaú e do cartão de R$ 300, alíquota e anexo do Simples, pró-labore formal, rateio da casa, situação do contador, nome definitivo, preço do BPO.

## 5. O que a V3 exige (e o código de hoje ainda não faz)
- **Várias organizações:** `getCtx` pega a primeira organização do usuário (`limit(1)`). Com um analista BPO em várias, precisa de seleção de organização. O webhook do Asaas e o `ASAAS_ORG_ID` assumem uma organização só: precisa de token e chave por organização.
- **Papéis:** `bpo_analyst` existe no banco, mas não há tela de convite nem de permissões por organização.
- **Cadastro de clientes BPO:** criação de organização, termo de tratamento de dados (LGPD), exclusão em cascata **inclusive dos arquivos no Storage**.
- **Planos e cobrança:** não existe.
- **Open Finance:** não existe (precisa escolher o provedor).
- **Auditoria:** não há registro de quem alterou o quê.
- **Limites por organização:** IA, armazenamento, usuários.
- **Teste de isolamento ampliado:** hoje cobre as tabelas; incluir Storage, funções e as rotas com `org_id` explícito.
