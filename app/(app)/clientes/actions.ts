"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { monthStart, todayFortaleza } from "@/lib/dates";
import { brlToCents } from "@/lib/format";
import { generateMonth } from "@/lib/generate";
import { getCtx } from "@/lib/org";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Mês inválido." });
const schema = z.object({
  name: z.string().trim().min(2, { error: "Informe o nome do cliente." }).max(80),
  amount: z.string().transform((s, ctx) => {
    const c = brlToCents(s);
    if (c == null || Number.isNaN(c) || c <= 0) { ctx.addIssue({ code: "custom", message: "Informe o valor mensal (ex.: 2.500,00)." }); return z.NEVER; }
    return c;
  }),
  day: z.string().transform((s, ctx) => {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 1 || n > 31) { ctx.addIssue({ code: "custom", message: "O dia do pagamento deve estar entre 1 e 31." }); return z.NEVER; }
    return n;
  }),
  start: month,
  end: z.union([month, z.literal("")]),
}).refine((v) => v.end === "" || v.end >= v.start, { error: "O mês final não pode ser antes do início." });

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");
const back = (q: string): never => { revalidatePath("/clientes"); revalidatePath("/contas"); redirect(`/clientes?${q}`); };
const fail = (msg: string): never => back(`erro=${encodeURIComponent(msg)}`);

/** Cliente mensal em um passo: só nome, valor e dia do pagamento. Cria o cliente e a cobrança que se repete todo mês. */
export async function createMonthlyClient(fd: FormData) {
  const p = schema.safeParse({
    name: String(fd.get("name") ?? ""), amount: String(fd.get("amount") ?? ""), day: String(fd.get("day") ?? ""),
    start: String(fd.get("start") ?? ""), end: String(fd.get("end") ?? ""),
  });
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dados inválidos.");
  const { supabase, orgId } = await getCtx();

  const { data: pj } = await supabase.from("entities").select("id").eq("kind", "pj").limit(1).maybeSingle();
  if (!pj) return fail("Cadastre a entidade da empresa (PJ) em Configurações antes.");

  let clientId: string;
  const { data: found } = await supabase.from("clients").select("id").ilike("name", escapeLike(p.data.name)).limit(1).maybeSingle();
  if (found) {
    clientId = found.id as string;
    const { data: existing } = await supabase.from("recurring_rules").select("id").eq("client_id", clientId).eq("active", true).eq("direction", "in").limit(1).maybeSingle();
    if (existing) return fail("Este cliente já tem uma cobrança mensal ativa.");
  } else {
    const { data: created, error } = await supabase.from("clients").insert({ org_id: orgId, name: p.data.name }).select("id").single();
    if (error || !created) return fail(error?.code === "42501" ? "Você não tem permissão para cadastrar clientes." : "Não foi possível cadastrar o cliente.");
    clientId = created.id as string;
  }

  // categoria de receita: prefere "Mensalidade…", senão qualquer entrada da linha de receita bruta
  const { data: cats } = await supabase.from("categories").select("id, name").eq("direction", "in").eq("dre_line", "gross_revenue");
  const category = (cats ?? []).find((c) => String(c.name).toLowerCase().startsWith("mensalidade")) ?? (cats ?? [])[0] ?? null;

  const { error } = await supabase.from("recurring_rules").insert({
    org_id: orgId, direction: "in", description: p.data.name, amount_cents: p.data.amount, day_of_month: p.data.day,
    start_month: `${p.data.start}-01`, end_month: p.data.end ? `${p.data.end}-01` : null,
    entity_id: pj.id, category_id: category?.id ?? null, client_id: clientId, active: true,
  });
  if (error) return fail("Não foi possível criar a cobrança mensal.");

  // já aparece neste mês (o cron também faz isso todo dia)
  try { await generateMonth(supabase, monthStart(todayFortaleza()), orgId); } catch { /* o cron gera depois */ }
  back("ok=1");
}
