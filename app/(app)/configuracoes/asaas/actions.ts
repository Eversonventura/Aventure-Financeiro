"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asaasFromEnv, hasAsaasKey } from "@/lib/asaas/client";
import { syncPayments } from "@/lib/asaas/sync";
import { todayFortaleza } from "@/lib/dates";
import { getCtx } from "@/lib/org";

const back = (q: string): never => { revalidatePath("/configuracoes/asaas"); redirect(`/configuracoes/asaas?${q}`); };
const erro = (m: string): never => back(`erro=${encodeURIComponent(m)}`);
const msg = (e: unknown) => (e instanceof Error ? e.message : "Falha inesperada.");

/** Chama o Asaas com a chave da Vercel e mostra o saldo: confirma que a chave e o ambiente (produção ou sandbox) estão certos. */
export async function testConnection() {
  await getCtx();
  if (!hasAsaasKey()) return erro("A ASAAS_API_KEY não está configurada na Vercel.");
  try {
    const balance = await asaasFromEnv().getBalance();
    back(`saldo=${Math.round(balance * 100)}`);
  } catch (e) {
    return erro(msg(e));
  }
}

/** Baixa as cobranças pagas dos últimos 45 dias que o webhook possa ter perdido. */
export async function syncNow() {
  const c = await getCtx();
  if (!hasAsaasKey()) return erro("A ASAAS_API_KEY não está configurada na Vercel.");
  try {
    const r = await syncPayments(c.supabase, { orgId: c.orgId, userId: c.userId, today: todayFortaleza() }, asaasFromEnv());
    back(`sync=${r.seen},${r.paid},${r.baixadas},${r.ignoradas},${r.erros}`);
  } catch (e) {
    return erro(msg(e));
  }
}

const linkSchema = z.object({ client: z.uuid(), asaas: z.string().trim().max(60) });

/** Liga o cliente daqui ao cliente do Asaas (ou desliga, deixando em branco). */
export async function linkClient(fd: FormData) {
  const p = linkSchema.safeParse({ client: String(fd.get("client") ?? ""), asaas: String(fd.get("asaas") ?? "") });
  if (!p.success) return erro("Dados inválidos.");
  const { supabase } = await getCtx();
  const { error } = await supabase.from("clients").update({ asaas_customer_id: p.data.asaas || null }).eq("id", p.data.client);
  if (error) return erro(error.code === "23505" ? "Este cliente do Asaas já está ligado a outro cliente." : "Não foi possível salvar.");
  back("ok=1");
}
