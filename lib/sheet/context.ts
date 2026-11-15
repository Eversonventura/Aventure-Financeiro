import type { SupabaseClient } from "@supabase/supabase-js";
import { fingerprint, type PlanCtx, type PmInfo } from "@/lib/sheet/plan";

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return out;
  }
}

/** Cadastros e lançamentos existentes, para o plano evitar duplicar. */
export async function loadPlanContext(supabase: SupabaseClient, today: string): Promise<PlanCtx & { methods: PmInfo[] }> {
  const [methods, entities, clients, rules, txs] = await Promise.all([
    supabase.from("payment_methods").select("id, name, kind, owner_entity_id, holder_person_id, closing_day, due_day").eq("active", true),
    supabase.from("entities").select("id, name, kind"),
    supabase.from("clients").select("id, name").eq("active", true),
    supabase.from("recurring_rules").select("description, direction, payment_method_id"),
    fetchAll<{ description: string; amount_cents: number; cash_date: string; payment_method_id: string | null; external_id: string | null }>((a, b) =>
      supabase.from("transactions").select("description, amount_cents, cash_date, payment_method_id, external_id").range(a, b)),
  ]);
  return {
    today,
    methods: (methods.data ?? []) as PmInfo[],
    entities: (entities.data ?? []) as PlanCtx["entities"],
    clients: (clients.data ?? []) as PlanCtx["clients"],
    existingRules: (rules.data ?? []) as PlanCtx["existingRules"],
    existingKeys: new Set(txs.map((t) => t.external_id).filter((x): x is string => !!x)),
    existingFingerprints: new Set(txs.map((t) => fingerprint(t))),
  };
}
