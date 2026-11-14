<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Caixa Aventure — regras do projeto
- Especificação completa em docs/ESPECIFICACAO.md. Siga-a; em dúvida, pergunte antes de inventar.
- Stack: Next.js App Router + TypeScript estrito, Tailwind, shadcn/ui, Supabase (@supabase/ssr), Zod.
- Interface em português do Brasil. Moeda R$ com vírgula decimal. Fuso America/Fortaleza.
- Mobile first: toda tela funciona em 375 px de largura antes do desktop.
- Dinheiro sempre em centavos (bigint/number inteiro). Nunca float para valores.
- Toda tabela com org_id e RLS. Nunca use a service_role no navegador.
- Views sempre com `security_invoker = true` (senão ignoram a RLS).
- Chamadas à Claude API e ao Asaas só em rotas de servidor; resposta de IA sempre validada com Zod.
- Migrations em supabase/migrations, uma por mudança. Nunca edite migration já aplicada.
- Testes com Vitest para regras de dinheiro, datas e faturas.
- Ao terminar uma tarefa: rode lint, typecheck e testes, e liste o que mudou.
- Next 16: o antigo `middleware` agora é `proxy.ts`. Veja node_modules/next/dist/docs/.
