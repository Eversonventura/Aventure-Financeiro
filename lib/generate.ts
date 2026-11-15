import type { SupabaseClient } from "@supabase/supabase-js";
import type { MethodInfo } from "@/lib/launch";
import { buildRecurring, type RecurringTx, type RuleRow } from "@/lib/recurrence";

export type GenerateResult = { rules: number; generated: number; created: number; skipped: number };

/**
 * Gera os lançamentos previstos de um mês (dia 1) a partir das regras ativas.
 * Idempotente: a chave (org_id, source, external_id) impede duplicar; rodar de novo cria 0.
 * Com `orgId`, restringe a uma organização (uso pelo usuário); sem ele, todas (uso pelo cron).
 */
export async function generateMonth(supabase: SupabaseClient, month: string, orgId?: string): Promise<GenerateResult> {
  let q = supabase.from("recurring_rules").select("*").eq("active", true);
  if (orgId) q = q.eq("org_id", orgId);
  const { data: rules, error } = await q;
  if (error) throw new Error(`regras: ${error.message}`);
  const list = (rules ?? []) as RuleRow[];

  const pmIds = [...new Set(list.map((r) => r.payment_method_id).filter((x): x is string => !!x))];
  const { data: pms, error: pmErr } = pmIds.length
    ? await supabase.from("payment_methods").select("id, kind, closing_day, due_day").in("id", pmIds)
    : { data: [] as MethodInfo[], error: null };
  if (pmErr) throw new Error(`meios: ${pmErr.message}`);
  const byId = new Map((pms ?? []).map((p) => [p.id as string, p as MethodInfo]));

  const rows: RecurringTx[] = [];
  let skipped = 0;
  for (const rule of list) {
    const r = buildRecurring(rule, month, rule.payment_method_id ? byId.get(rule.payment_method_id) ?? null : null);
    if (r.ok) rows.push(r.row);
    else if (r.reason === "card_without_days") skipped++;
  }

  let created = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error: upErr } = await supabase
      .from("transactions")
      .upsert(rows.slice(i, i + 200), { onConflict: "org_id,source,external_id", ignoreDuplicates: true })
      .select("id");
    if (upErr) throw new Error(`lançamentos: ${upErr.message}`);
    created += data?.length ?? 0;
  }
  return { rules: list.length, generated: rows.length, created, skipped };
}
