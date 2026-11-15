import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan } from "@/lib/sheet/plan";

type Ids = { orgId: string; userId: string; importId: string };

/** Desfaz uma importação inteira: apaga o que ela criou e solta o vínculo de lançamentos gerados depois pelas regras dela. */
export async function undoImport(supabase: SupabaseClient, importId: string): Promise<void> {
  const del = async (table: string) => {
    const { error } = await supabase.from(table).delete().eq("import_id", importId);
    if (error) throw new Error(`${table}: ${error.message}`);
  };
  await del("transactions");
  await del("installment_groups");
  const { data: rules } = await supabase.from("recurring_rules").select("id").eq("import_id", importId);
  const ruleIds = (rules ?? []).map((r) => r.id as string);
  if (ruleIds.length) {
    const { error } = await supabase.from("transactions").update({ recurring_rule_id: null }).in("recurring_rule_id", ruleIds);
    if (error) throw new Error(`regras: ${error.message}`);
  }
  await del("recurring_rules");
}

/** Grava o plano: grupos e regras primeiro, depois os lançamentos. Se algo falhar, desfaz tudo. */
export async function applyPlan(supabase: SupabaseClient, ids: Ids, plan: Plan): Promise<{ created: number }> {
  const base = { org_id: ids.orgId, import_id: ids.importId };
  try {
    if (plan.groups.length) {
      const { error } = await supabase.from("installment_groups").insert(plan.groups.map((g) => ({ ...g, ...base })));
      if (error) throw new Error(`grupos: ${error.message}`);
    }
    if (plan.rules.length) {
      const { error } = await supabase.from("recurring_rules").insert(plan.rules.map((r) => ({ ...r, ...base })));
      if (error) throw new Error(`regras: ${error.message}`);
    }
    let created = 0;
    for (let i = 0; i < plan.txs.length; i += 200) {
      const { data, error } = await supabase
        .from("transactions")
        .upsert(plan.txs.slice(i, i + 200).map((t) => ({ ...t, ...base, created_by: ids.userId })), { onConflict: "org_id,source,external_id", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`lançamentos: ${error.message}`);
      created += data?.length ?? 0;
    }
    return { created };
  } catch (e) {
    await undoImport(supabase, ids.importId).catch(() => {});
    throw e;
  }
}
