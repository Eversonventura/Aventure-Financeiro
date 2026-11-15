import type { SupabaseClient } from "@supabase/supabase-js";
import { applyAsaasPayment, type Ctx } from "@/lib/asaas/apply";
import type { AsaasWebhook } from "@/lib/asaas/types";

export type Processed = { duplicate: boolean; result: string; detail: string };

/**
 * Processa um evento do webhook uma única vez. O id do evento é a chave: o mesmo evento duas vezes não duplica nada.
 * Evento que falhou no meio é reprocessado quando o Asaas reenviar (a baixa em si também é idempotente).
 */
export async function processWebhook(s: SupabaseClient, ctx: Ctx, body: AsaasWebhook): Promise<Processed> {
  const p = body.payment ?? null;
  const eventId = body.id || `${body.event}:${p?.id ?? "-"}:${p?.status ?? "-"}`;

  const ins = await s.from("asaas_events").insert({ org_id: ctx.orgId, event_id: eventId, event: body.event, payment_id: p?.id ?? null, payload: body, result: "processing" });
  if (ins.error) {
    if (ins.error.code !== "23505") throw new Error(`evento: ${ins.error.message}`);
    const { data: old } = await s.from("asaas_events").select("result").eq("org_id", ctx.orgId).eq("event_id", eventId).maybeSingle();
    if (old && (old.result === "done" || old.result === "ignored")) return { duplicate: true, result: String(old.result), detail: "evento já processado" };
    await s.from("asaas_events").update({ result: "processing" }).eq("org_id", ctx.orgId).eq("event_id", eventId); // reprocessa o que falhou
  }
  const finish = (result: string, detail: string) => s.from("asaas_events").update({ result, detail: detail.slice(0, 300) }).eq("org_id", ctx.orgId).eq("event_id", eventId);

  if (!p) { await finish("ignored", "evento sem cobrança"); return { duplicate: false, result: "ignored", detail: "evento sem cobrança" }; }
  try {
    const out = await applyAsaasPayment(s, ctx, body.event, p);
    await finish(out.result, out.detail);
    return { duplicate: false, ...out };
  } catch (e) {
    await finish("error", e instanceof Error ? e.message : "erro");
    throw e;
  }
}
