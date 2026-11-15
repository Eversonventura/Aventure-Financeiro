/** Erros do PostgREST/Postgres que significam "isto não existe no banco" (migration não aplicada). */
const MISSING = new Set(["42703", "42P01", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"]);
export const isMissing = (error: { code?: string; message?: string } | null | undefined): boolean =>
  !!error && (MISSING.has(error.code ?? "") || /does not exist|could not find|schema cache/i.test(error.message ?? ""));

export type EnvCheck = { name: string; label: string; required: boolean; why: string };
export const ENV_CHECKS: EnvCheck[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", label: "Endereço do Supabase", required: true, why: "O app não abre sem ele." },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Chave pública do Supabase", required: true, why: "Login e leitura dos dados." },
  { name: "SUPABASE_SERVICE_ROLE_KEY", label: "Chave de serviço do Supabase", required: true, why: "Rotinas automáticas (recorrências, Asaas, relatório mensal)." },
  { name: "CRON_SECRET", label: "Senha das rotinas automáticas", required: true, why: "Sem ela as rotinas diárias e mensais não rodam." },
  { name: "ANTHROPIC_API_KEY", label: "Chave da IA (Claude)", required: false, why: "Classificação, voz, foto, importação da planilha, PDF da fatura e Analista." },
  { name: "ASAAS_API_KEY", label: "Chave do Asaas", required: false, why: "Baixa automática das mensalidades." },
  { name: "ASAAS_WEBHOOK_TOKEN", label: "Token do webhook do Asaas", required: false, why: "Receber o aviso de pagamento do Asaas." },
];

export type MigrationCheck = { file: string; title: string; probe: "table" | "column" | "view" | "rpc" | "manual"; detail: string };
/** Cada migration e como saber se ela foi aplicada (por uma coisa que ela criou). */
export const MIGRATIONS: MigrationCheck[] = [
  { file: "20261114000001_initial_schema", title: "Estrutura inicial", probe: "table", detail: "organizations" },
  { file: "20261115000001_cash_opening_balance", title: "Saldo de abertura do caixa", probe: "column", detail: "org_settings.opening_balance_cents" },
  { file: "20261115000002_imports", title: "Importação da planilha", probe: "column", detail: "imports.layout" },
  { file: "20261115000003_ai_suggestion", title: "Sugestão da IA na revisão", probe: "column", detail: "transactions.ai_suggestion" },
  { file: "20261115000004_dre_signed", title: "DRE com entradas e saídas", probe: "view", detail: "v_dre_monthly.income_cents" },
  { file: "20261115000005_safe_deletes", title: "Apagar cadastros em uso", probe: "rpc", detail: "delete_person_safe" },
  { file: "20261115000006_commitments", title: "Empréstimos e consórcios", probe: "table", detail: "commitments" },
  { file: "20261115000007_asaas", title: "Integração com o Asaas", probe: "table", detail: "asaas_events" },
  { file: "20261115000008_ai_insights_unique", title: "Um relatório por mês", probe: "manual", detail: "índice único (não dá para verificar daqui)" },
  { file: "20261115000009_indexes", title: "Índices de desempenho", probe: "manual", detail: "índices (não dá para verificar daqui)" },
];
