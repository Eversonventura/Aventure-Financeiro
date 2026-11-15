"use server";

import { z } from "zod";
import { DRE_LINES } from "@/lib/schemas";
import { getCtx } from "@/lib/org";

const dreKeys = Object.keys(DRE_LINES) as [keyof typeof DRE_LINES & string, ...(keyof typeof DRE_LINES & string)[]];
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

const categorySchema = z.object({
  name: z.string().trim().min(2, { error: "Informe o nome da categoria." }).max(60),
  direction: z.enum(["in", "out"]),
  applies_to: z.enum(["pj", "pf", "shared"]).nullable(),
  dre_line: z.enum(dreKeys),
});
export type NewCategory = { id: string; name: string; applies_to: "pj" | "pf" | "shared" | null; direction: "in" | "out" };
export type CreateCategoryResult = { ok: true; category: NewCategory } | { ok: false; error: string };

/** Cria uma categoria sem sair do lançamento. Se já existe uma com o mesmo nome, devolve a existente. */
export async function createCategoryInline(raw: z.input<typeof categorySchema>): Promise<CreateCategoryResult> {
  const p = categorySchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const { supabase, orgId } = await getCtx();
  const { data: existing } = await supabase.from("categories").select("id, name, applies_to, direction")
    .ilike("name", escapeLike(p.data.name)).eq("direction", p.data.direction).limit(1).maybeSingle();
  if (existing) return { ok: true, category: existing as NewCategory };
  const { data, error } = await supabase.from("categories")
    .insert({ org_id: orgId, name: p.data.name, applies_to: p.data.applies_to, direction: p.data.direction, dre_line: p.data.dre_line })
    .select("id, name, applies_to, direction").single();
  if (error || !data) return { ok: false, error: error?.code === "42501" ? "Você não tem permissão para criar categorias." : "Não foi possível criar a categoria." };
  return { ok: true, category: data as NewCategory };
}

export type CreateClientResult = { ok: true; client: { id: string; name: string } } | { ok: false; error: string };

/** Cria um cliente só com o nome (o básico), sem sair do lançamento. */
export async function createClientInline(raw: { name: string }): Promise<CreateClientResult> {
  const p = z.object({ name: z.string().trim().min(2, { error: "Informe o nome do cliente." }).max(80) }).safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const { supabase, orgId } = await getCtx();
  const { data: existing } = await supabase.from("clients").select("id, name").ilike("name", escapeLike(p.data.name)).limit(1).maybeSingle();
  if (existing) return { ok: true, client: existing as { id: string; name: string } };
  const { data, error } = await supabase.from("clients").insert({ org_id: orgId, name: p.data.name }).select("id, name").single();
  if (error || !data) return { ok: false, error: error?.code === "42501" ? "Você não tem permissão para criar clientes." : "Não foi possível criar o cliente." };
  return { ok: true, client: data as { id: string; name: string } };
}
