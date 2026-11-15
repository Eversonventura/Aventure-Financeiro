"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { applyClassification } from "@/lib/classify/engine";
import { classifyItems } from "@/lib/classify/server";
import type { InvoiceLine } from "@/lib/fatura/types";
import { cashDateFor } from "@/lib/invoice";
import { getCtx } from "@/lib/org";

export type InvoiceLayout = { card_id: string; month: string; lines: InvoiceLine[]; ignored: string[] };
type Ctx = Awaited<ReturnType<typeof getCtx>>;

const to = (id: string, q = ""): never => { revalidatePath(`/importacoes/fatura/${id}`); revalidatePath("/importacoes"); redirect(`/importacoes/fatura/${id}${q}`); };
const fail = (id: string, msg: string): never => to(id, `?erro=${encodeURIComponent(msg)}`);

async function load(c: Ctx, id: string): Promise<InvoiceLayout | null> {
  const { data } = await c.supabase.from("imports").select("layout").eq("id", id).maybeSingle();
  return (data?.layout as InvoiceLayout | null) ?? null;
}
const save = (c: Ctx, id: string, layout: InvoiceLayout) => c.supabase.from("imports").update({ layout }).eq("id", id);
const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

const settingsSchema = z.object({ id: z.uuid(), card: z.uuid(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Mês inválido." }) });

/** Troca o cartão ou o mês da fatura (muda quais lançamentos são comparados). */
export async function saveInvoiceSettings(fd: FormData) {
  const p = settingsSchema.safeParse({ id: String(fd.get("id") ?? ""), card: String(fd.get("card") ?? ""), month: String(fd.get("month") ?? "") });
  if (!p.success) return to(String(fd.get("id") ?? ""), `?erro=${encodeURIComponent(p.error.issues[0]?.message ?? "Dados inválidos.")}`);
  const c = await getCtx();
  const layout = await load(c, p.data.id);
  if (!layout) return fail(p.data.id, "Conferência não encontrada.");
  const { data: pm } = await c.supabase.from("payment_methods").select("kind").eq("id", p.data.card).maybeSingle();
  if (pm?.kind !== "credit_card") return fail(p.data.id, "Escolha um cartão de crédito.");
  await save(c, p.data.id, { ...layout, card_id: p.data.card, month: p.data.month });
  to(p.data.id);
}

/** Lança no sistema as linhas da fatura que estavam faltando, já classificadas (regras, histórico e IA). */
export async function addMissing(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const c = await getCtx();
  const layout = await load(c, id);
  if (!layout) return fail(id, "Conferência não encontrada.");
  const idx = [...new Set(fd.getAll("l").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n < layout.lines.length))];
  if (idx.length === 0) return fail(id, "Marque pelo menos uma linha.");

  const { data: pm } = await c.supabase.from("payment_methods").select("id, owner_entity_id, holder_person_id, due_day").eq("id", layout.card_id).maybeSingle();
  if (!pm) return fail(id, "Cartão não encontrado.");
  const cash = pm.due_day ? cashDateFor(`${layout.month}-01`, pm.due_day as number) : `${layout.month}-10`;

  const lines = idx.map((i) => ({ i, l: layout.lines[i] }));
  let cls: Awaited<ReturnType<typeof classifyItems>>["results"] = [];
  try {
    cls = (await classifyItems(c.supabase, c.orgId, lines.map(({ l }) => ({
      description: l.description, amount_cents: Math.abs(l.amount_cents), payment_method_id: pm.id as string, person_id: (pm.holder_person_id as string | null) ?? null,
      type: l.amount_cents < 0 ? "income" : "expense",
    })), { learn: false })).results;
  } catch { /* sem classificação: vai para a revisão */ }

  const rows = lines.map(({ i, l }, n) => {
    const k = applyClassification({ person_id: (pm.holder_person_id as string | null) ?? null }, cls[n] ?? { entity_id: null, category_id: null, person_id: null, confidence: 0, source: "none" });
    return {
      org_id: c.orgId, created_by: c.userId, import_id: id, type: l.amount_cents < 0 ? "income" : "expense", status: "pending",
      description: l.installment ? `${l.description} ${l.installment.n}/${l.installment.total}` : l.description,
      amount_cents: Math.abs(l.amount_cents), competence_date: l.date, cash_date: cash, invoice_month: `${layout.month}-01`,
      entity_id: k.entity_id ?? (pm.owner_entity_id as string), person_id: k.person_id, payment_method_id: pm.id as string, category_id: k.category_id,
      source: "import_invoice", external_id: `inv:${sha(`${id}|${i}|${l.date}|${l.description}|${l.amount_cents}`)}`,
      needs_review: k.needs_review || k.category_id == null, ai_confidence: k.ai_confidence, ai_suggestion: k.ai_suggestion,
    };
  });
  const { error } = await c.supabase.from("transactions").upsert(rows, { onConflict: "org_id,source,external_id", ignoreDuplicates: true });
  if (error) return fail(id, "Não foi possível lançar. Tente de novo.");
  to(id, `?ok=${rows.length}`);
}

/** O valor lançado estava errado: passa para o valor da fatura. */
export async function fixAmount(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const [li, txId] = String(fd.get("fix") ?? "").split(":");
  const c = await getCtx();
  const layout = await load(c, id);
  const line = layout?.lines[Number(li)];
  if (!layout || !line || !z.uuid().safeParse(txId).success) return fail(id, "Item não encontrado.");
  const { error } = await c.supabase.from("transactions").update({ amount_cents: Math.abs(line.amount_cents) }).eq("id", txId).eq("payment_method_id", layout.card_id);
  if (error) return fail(id, "Não foi possível corrigir o valor.");
  to(id, "?ok=1");
}

/** Some da conferência (por exemplo, um lançamento que é de outra fatura, ou uma linha que não precisa ser lançada). */
export async function ignoreItem(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const key = String(fd.get("key") ?? "");
  if (!/^(L:\d+|T:[0-9a-f-]{36})$/i.test(key)) return fail(id, "Item inválido.");
  const c = await getCtx();
  const layout = await load(c, id);
  if (!layout) return fail(id, "Conferência não encontrada.");
  await save(c, id, { ...layout, ignored: [...new Set([...layout.ignored, key])] });
  to(id);
}
