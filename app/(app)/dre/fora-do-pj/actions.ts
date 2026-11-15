"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCtx } from "@/lib/org";

const schema = z.object({ rule: z.uuid(), card: z.uuid(), mes: z.string().regex(/^\d{4}-\d{2}$/) });

/** Troca o cartão de uma recorrência da Aventure para um meio da própria empresa (vale a partir da próxima geração). */
export async function migrateRule(fd: FormData) {
  const p = schema.safeParse({ rule: String(fd.get("rule") ?? ""), card: String(fd.get("card") ?? ""), mes: String(fd.get("mes") ?? "") });
  const back = (q: string): never => { revalidatePath("/dre/fora-do-pj"); redirect(`/dre/fora-do-pj?${q}`); };
  if (!p.success) return back("erro=" + encodeURIComponent("Escolha o cartão da empresa."));
  const { supabase } = await getCtx();
  // o destino precisa ser um meio cujo dinheiro é da Aventure (PJ)
  const { data: target } = await supabase.from("payment_methods").select("id, owner_entity_id").eq("id", p.data.card).maybeSingle();
  const { data: owner } = target ? await supabase.from("entities").select("kind").eq("id", target.owner_entity_id).maybeSingle() : { data: null };
  if (!target || owner?.kind !== "pj") return back("erro=" + encodeURIComponent("O cartão escolhido não é da empresa."));
  const { error } = await supabase.from("recurring_rules").update({ payment_method_id: p.data.card }).eq("id", p.data.rule);
  return back(error ? "erro=" + encodeURIComponent("Não foi possível migrar.") : `mes=${p.data.mes}&ok=1`);
}
