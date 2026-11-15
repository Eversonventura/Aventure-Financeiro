"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSchema, editSchema, nFromExternal, planSync, type Commitment } from "@/lib/compromissos";
import { formToObject } from "@/lib/schemas";
import { addMonths } from "@/lib/invoice";
import { getCtx } from "@/lib/org";

const back = (q = ""): never => {
  for (const p of ["/emprestimos", "/contas", "/fluxo", "/"]) revalidatePath(p);
  redirect(`/emprestimos${q}`);
};
const fail = (msg: string): never => back(`?erro=${encodeURIComponent(msg)}`);

const CREATE_FIELDS = ["kind", "name", "entity_id", "institution", "payment_method_id", "category_id", "installment", "installments", "paid_before", "next_due", "contracted", "contemplated_on", "notes"];
const EDIT_FIELDS = ["name", "entity_id", "institution", "payment_method_id", "category_id", "installment", "installments", "contracted", "contemplated_on", "notes"];

type Ctx = Awaited<ReturnType<typeof getCtx>>;

/** Meios de pagamento que não são cartão de crédito (parcela de empréstimo sai da conta, no vencimento). */
async function checkMethod(c: Ctx, id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await c.supabase.from("payment_methods").select("kind").eq("id", id).maybeSingle();
  return data?.kind === "credit_card" ? "Parcela de empréstimo ou consórcio não vai no cartão de crédito. Escolha uma conta, Pix ou deixe em branco." : null;
}

/** Sem categoria escolhida, usa "Empréstimos e financiamentos" se existir. */
async function defaultCategory(c: Ctx, chosen: string | null): Promise<string | null> {
  if (chosen) return chosen;
  const { data } = await c.supabase.from("categories").select("id").ilike("name", "Empréstimos%").eq("direction", "out").limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Deixa as parcelas no banco iguais ao cadastro (cria, atualiza as não pagas, remove as que sobram). */
async function syncInstallments(supabase: SupabaseClient, ids: { orgId: string; userId: string }, c: Commitment) {
  const { data } = await supabase.from("transactions").select("id, external_id, status").eq("commitment_id", c.id);
  const existing = (data ?? []).flatMap((t) => {
    const n = nFromExternal(t.external_id as string | null, c.id);
    return n == null ? [] : [{ id: t.id as string, n, status: t.status as string }];
  });
  const plan = planSync(c, existing);
  if (plan.create.length) {
    const { error } = await supabase.from("transactions").upsert(plan.create.map((t) => ({ ...t, org_id: ids.orgId, created_by: ids.userId })), { onConflict: "org_id,source,external_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  for (const u of plan.update) {
    const { error } = await supabase.from("transactions").update(u.patch).eq("id", u.id);
    if (error) throw new Error(error.message);
  }
  if (plan.remove.length) {
    const { error } = await supabase.from("transactions").delete().in("id", plan.remove);
    if (error) throw new Error(error.message);
  }
}

async function load(c: Ctx, id: string): Promise<Commitment | null> {
  const { data } = await c.supabase.from("commitments").select("*").eq("id", id).maybeSingle();
  return (data as Commitment | null) ?? null;
}

export async function createCommitment(fd: FormData) {
  const p = createSchema.safeParse(formToObject(fd, CREATE_FIELDS));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dados inválidos.");
  const c = await getCtx();
  const methodError = await checkMethod(c, p.data.payment_method_id);
  if (methodError) return fail(methodError);

  // a data da 1ª parcela vem do próximo vencimento, recuando as parcelas já pagas
  const firstDue = addMonths(p.data.next_due, -p.data.paid_before);
  const { data, error } = await c.supabase.from("commitments").insert({
    org_id: c.orgId, kind: p.data.kind, name: p.data.name, entity_id: p.data.entity_id, institution: p.data.institution,
    payment_method_id: p.data.payment_method_id, category_id: await defaultCategory(c, p.data.category_id),
    installment_cents: p.data.installment, installments: p.data.installments, paid_before: p.data.paid_before, first_due_date: firstDue,
    contracted_cents: p.data.contracted, contemplated_on: p.data.contemplated_on, notes: p.data.notes,
  }).select("*").single();
  if (error || !data) return fail(error?.code === "42501" ? "Você não tem permissão para cadastrar." : "Não foi possível cadastrar.");
  try {
    await syncInstallments(c.supabase, { orgId: c.orgId, userId: c.userId }, data as Commitment);
  } catch {
    await c.supabase.from("commitments").delete().eq("id", data.id); // não deixa cadastro sem as parcelas
    return fail("Não foi possível gerar as parcelas. Nada foi salvo.");
  }
  back("?ok=1");
}

export async function updateCommitment(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const p = editSchema.safeParse(formToObject(fd, EDIT_FIELDS));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dados inválidos.");
  const c = await getCtx();
  const cur = await load(c, id);
  if (!cur) return fail("Cadastro não encontrado.");
  const methodError = await checkMethod(c, p.data.payment_method_id);
  if (methodError) return fail(methodError);

  const { count: paidInSystem } = await c.supabase.from("transactions").select("id", { count: "exact", head: true }).eq("commitment_id", id).eq("status", "paid");
  const jaPagas = cur.paid_before + (paidInSystem ?? 0);
  if (p.data.installments < jaPagas) return fail(`O total não pode ser menor que as ${jaPagas} parcelas já pagas.`);
  const next: Commitment = {
    ...cur, name: p.data.name, entity_id: p.data.entity_id, institution: p.data.institution, payment_method_id: p.data.payment_method_id,
    category_id: p.data.category_id, installment_cents: p.data.installment, installments: p.data.installments,
    contracted_cents: p.data.contracted, contemplated_on: p.data.contemplated_on, notes: p.data.notes,
  };
  const { error } = await c.supabase.from("commitments").update({
    name: next.name, entity_id: next.entity_id, institution: next.institution, payment_method_id: next.payment_method_id, category_id: next.category_id,
    installment_cents: next.installment_cents, installments: next.installments, contracted_cents: next.contracted_cents,
    contemplated_on: next.contemplated_on, notes: next.notes,
  }).eq("id", id);
  if (error) return fail("Não foi possível salvar.");
  try { await syncInstallments(c.supabase, { orgId: c.orgId, userId: c.userId }, next); } catch { return fail("Salvou o cadastro, mas não consegui atualizar todas as parcelas. Tente salvar de novo."); }
  back("?ok=1");
}

/** Para de cobrar: as parcelas futuras não pagas saem do caixa; as pagas ficam no histórico. */
export async function endCommitment(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const c = await getCtx();
  const cur = await load(c, id);
  if (!cur) return fail("Cadastro não encontrado.");
  const { error } = await c.supabase.from("commitments").update({ active: false }).eq("id", id);
  if (error) return fail("Não foi possível encerrar.");
  try { await syncInstallments(c.supabase, { orgId: c.orgId, userId: c.userId }, { ...cur, active: false }); } catch { return fail("Encerrado, mas não consegui remover todas as parcelas futuras."); }
  back("?ok=1");
}

export async function deleteCommitment(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const c = await getCtx();
  const del = await c.supabase.from("transactions").delete().eq("commitment_id", id).neq("status", "paid"); // parcelas pagas ficam no histórico
  if (del.error) return fail("Não foi possível apagar as parcelas.");
  const { error } = await c.supabase.from("commitments").delete().eq("id", id);
  back(error ? `?erro=${encodeURIComponent(error.code === "42501" ? "Só o dono pode apagar." : "Não foi possível apagar.")}` : "?ok=1");
}
