import type { SupabaseClient } from "@supabase/supabase-js";
import { planPayment, toCents, type Defaults, type ExistingLink, type ExpectedTx, type FeeTx } from "@/lib/asaas/payments";
import type { AsaasPayment } from "@/lib/asaas/types";

export type Ctx = { orgId: string; userId: string | null; today: string };
export type Outcome = { result: "done" | "ignored"; detail: string };

async function loadDefaults(s: SupabaseClient): Promise<Defaults> {
  const [pj, rev, fee, pm] = await Promise.all([
    s.from("entities").select("id").eq("kind", "pj").limit(1).maybeSingle(),
    s.from("categories").select("id, name").eq("direction", "in").eq("dre_line", "gross_revenue"),
    s.from("categories").select("id, name").eq("direction", "out").in("dre_line", ["admin_expenses", "financial"]),
    s.from("payment_methods").select("id, name").eq("kind", "bank_account").ilike("name", "%asaas%").limit(1).maybeSingle(),
  ]);
  const revs = (rev.data ?? []) as { id: string; name: string }[];
  const fees = (fee.data ?? []) as { id: string; name: string }[];
  return {
    pjEntityId: (pj.data?.id as string | undefined) ?? null,
    revenueCategoryId: (revs.find((c) => c.name.toLowerCase().startsWith("mensalidade")) ?? revs[0])?.id ?? null,
    feeCategoryId: (fees.find((c) => /sistemas|tarifa/i.test(c.name)) ?? null)?.id ?? null,
    methodId: (pm.data?.id as string | undefined) ?? null,
  };
}

/** Aplica uma cobrança do Asaas (webhook ou sincronização). Repetir a mesma cobrança não duplica nada. */
export async function applyAsaasPayment(s: SupabaseClient, ctx: Ctx, event: string, p: AsaasPayment): Promise<Outcome> {
  const { data: client } = await s.from("clients").select("id, name").eq("asaas_customer_id", p.customer).maybeSingle();
  const { data: ex } = await s.from("asaas_payments").select("status, transaction_id, fee_transaction_id, prev_cash_date").eq("payment_id", p.id).maybeSingle();
  const { data: cands } = client
    ? await s.from("transactions").select("id, amount_cents, cash_date, status").eq("client_id", client.id as string).eq("type", "income").neq("status", "paid").limit(60)
    : { data: [] };

  const plan = planPayment({
    event, payment: p, client: (client as { id: string; name: string } | null) ?? null, existing: (ex as ExistingLink) ?? null,
    candidates: (cands ?? []) as ExpectedTx[], defaults: await loadDefaults(s), today: ctx.today,
  });
  if (plan.kind === "ignore") return { result: "ignored", detail: plan.reason };
  if (plan.kind === "already") return { result: "ignored", detail: "cobrança já baixada antes" };

  const base = { org_id: ctx.orgId, ...(ctx.userId ? { created_by: ctx.userId } : {}) };
  const saveFee = async (fee: FeeTx | null): Promise<string | null> => {
    if (!fee) return null;
    await s.from("transactions").upsert({ ...fee, ...base }, { onConflict: "org_id,source,external_id", ignoreDuplicates: true });
    const { data } = await s.from("transactions").select("id").eq("source", "asaas").eq("external_id", fee.external_id).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };
  const link = { org_id: ctx.orgId, payment_id: p.id, customer_id: p.customer, value_cents: toCents(p.value), net_cents: p.netValue != null ? toCents(p.netValue) : null, due_date: p.dueDate || null };

  if (plan.kind === "refund") {
    if (plan.txId) {
      const { error } = await s.from("transactions").update(plan.patch).eq("id", plan.txId);
      if (error) throw new Error(`estorno: ${error.message}`);
    }
    if (plan.removeFeeTxId) await s.from("transactions").delete().eq("id", plan.removeFeeTxId);
    await s.from("asaas_payments").update({ status: "refunded" }).eq("payment_id", p.id);
    return { result: "done", detail: "estorno: mensalidade voltou para pendente" };
  }

  if (plan.kind === "mark") {
    const { error } = await s.from("transactions").update(plan.patch).eq("id", plan.txId);
    if (error) throw new Error(`baixa: ${error.message}`);
    const feeId = await saveFee(plan.fee);
    await s.from("asaas_payments").upsert({ ...link, transaction_id: plan.txId, fee_transaction_id: feeId, status: "paid", paid_date: plan.patch.cash_date, prev_cash_date: plan.prevCashDate }, { onConflict: "org_id,payment_id" });
    return { result: "done", detail: `mensalidade de ${client?.name ?? "cliente"} baixada` };
  }

  // create
  const { error } = await s.from("transactions").upsert({ ...plan.row, ...base }, { onConflict: "org_id,source,external_id", ignoreDuplicates: true });
  if (error) throw new Error(`entrada: ${error.message}`);
  const { data: created } = await s.from("transactions").select("id").eq("source", "asaas").eq("external_id", plan.row.external_id).maybeSingle();
  const feeId = await saveFee(plan.fee);
  await s.from("asaas_payments").upsert({ ...link, transaction_id: (created?.id as string | undefined) ?? null, fee_transaction_id: feeId, status: "paid", paid_date: plan.row.cash_date, prev_cash_date: null }, { onConflict: "org_id,payment_id" });
  return { result: "done", detail: `recebimento de ${client?.name ?? "cliente"} lançado` };
}
