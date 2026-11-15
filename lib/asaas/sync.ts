import type { SupabaseClient } from "@supabase/supabase-js";
import { applyAsaasPayment, type Ctx } from "@/lib/asaas/apply";
import type { Asaas } from "@/lib/asaas/http";
import { PAID_STATUSES } from "@/lib/asaas/types";

export type SyncResult = { seen: number; paid: number; baixadas: number; ignoradas: number; erros: number };

/**
 * Sincroniza as cobranças (últimos ~45 dias e próximos 30): baixa as que foram pagas e o webhook perdeu.
 * Idempotente: o que já foi baixado vira "ignorada".
 */
export async function syncPayments(s: SupabaseClient, ctx: Ctx, api: Asaas): Promise<SyncResult> {
  const from = new Date(Date.UTC(+ctx.today.slice(0, 4), +ctx.today.slice(5, 7) - 1, +ctx.today.slice(8, 10) - 45)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(+ctx.today.slice(0, 4), +ctx.today.slice(5, 7) - 1, +ctx.today.slice(8, 10) + 30)).toISOString().slice(0, 10);
  const payments = await api.listPayments(from, to);
  const out: SyncResult = { seen: payments.length, paid: 0, baixadas: 0, ignoradas: 0, erros: 0 };
  for (const p of payments) {
    if (!(PAID_STATUSES as readonly string[]).includes(p.status ?? "")) continue;
    out.paid++;
    try {
      const r = await applyAsaasPayment(s, ctx, `PAYMENT_${p.status}`, p);
      if (r.result === "done") out.baixadas++; else out.ignoradas++;
    } catch (e) {
      console.error("sync asaas", p.id, e instanceof Error ? e.message : e);
      out.erros++;
    }
  }
  return out;
}
