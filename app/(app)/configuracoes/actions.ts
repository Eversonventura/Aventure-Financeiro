"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ZodType } from "zod";
import { getCtx } from "@/lib/org";
import {
  categorySchema, classificationRuleSchema, clientSchema, entitySchema, formToObject,
  paymentMethodSchema, personSchema, recurringRuleSchema, settingsSchema,
} from "@/lib/schemas";

type Table = "entities" | "people" | "payment_methods" | "categories" | "clients" | "recurring_rules" | "classification_rules";

function friendly(error: { code?: string; message: string }): string {
  if (error.code === "23503") return "Este registro está em uso e não pode ser apagado. Desative-o, se possível.";
  if (error.code === "42501") return "Você não tem permissão para esta ação.";
  if (error.code === "23505") return "Já existe um registro igual.";
  return "Não foi possível salvar. Tente de novo.";
}

function back(section: string, erro?: string): never {
  revalidatePath(`/configuracoes/${section}`);
  redirect(`/configuracoes/${section}${erro ? `?erro=${encodeURIComponent(erro)}` : "?ok=1"}`);
}

async function save<T extends object>(
  table: Table, section: string, schema: ZodType<T>, fields: string[], fd: FormData,
) {
  const parsed = schema.safeParse(formToObject(fd, fields));
  if (!parsed.success) back(section, parsed.error.issues[0].message);
  const { supabase, orgId } = await getCtx();
  const id = String(fd.get("id") ?? "");
  const { error } = id
    ? await supabase.from(table).update(parsed.data).eq("id", id)
    : await supabase.from(table).insert({ ...parsed.data, org_id: orgId });
  back(section, error ? friendly(error) : undefined);
}

async function remove(table: Table, section: string, fd: FormData) {
  const { supabase } = await getCtx();
  const { error } = await supabase.from(table).delete().eq("id", String(fd.get("id") ?? ""));
  back(section, error ? friendly(error) : undefined);
}

export async function saveEntity(fd: FormData) {
  await save("entities", "entidades", entitySchema, ["name", "kind", "document"], fd);
}
export async function deleteEntity(fd: FormData) { await remove("entities", "entidades", fd); }

export async function savePerson(fd: FormData) {
  await save("people", "pessoas", personSchema, ["name", "default_entity_id"], fd);
}
export async function deletePerson(fd: FormData) { await remove("people", "pessoas", fd); }

export async function savePaymentMethod(fd: FormData) {
  await save("payment_methods", "meios", paymentMethodSchema,
    ["name", "kind", "holder_person_id", "owner_entity_id", "closing_day", "due_day", "credit_limit_cents", "active"], fd);
}
export async function deletePaymentMethod(fd: FormData) { await remove("payment_methods", "meios", fd); }

export async function saveCategory(fd: FormData) {
  await save("categories", "categorias", categorySchema,
    ["name", "applies_to", "direction", "dre_line", "nature", "pj_share_pct"], fd);
}
export async function deleteCategory(fd: FormData) { await remove("categories", "categorias", fd); }

export async function saveClient(fd: FormData) {
  await save("clients", "clientes", clientSchema, ["name", "document", "asaas_customer_id", "active"], fd);
}
export async function deleteClient(fd: FormData) { await remove("clients", "clientes", fd); }

export async function saveSettings(fd: FormData) {
  const parsed = settingsSchema.safeParse(formToObject(fd, ["simples_effective_rate", "opening_balance_cents", "opening_balance_date"]));
  if (!parsed.success) back("geral", parsed.error.issues[0].message);
  const { supabase, orgId } = await getCtx();
  const { error } = await supabase.from("org_settings").upsert({ org_id: orgId, ...parsed.data });
  back("geral", error ? friendly(error) : undefined);
}

export async function saveRecurringRule(fd: FormData) {
  await save("recurring_rules", "recorrencias", recurringRuleSchema,
    ["direction", "description", "amount_cents", "day_of_month", "start_month", "end_month",
      "entity_id", "category_id", "payment_method_id", "client_id", "active"], fd);
}
export async function deleteRecurringRule(fd: FormData) { await remove("recurring_rules", "recorrencias", fd); }

export async function saveClassificationRule(fd: FormData) {
  await save("classification_rules", "regras", classificationRuleSchema,
    ["match_text", "match_kind", "payment_method_id", "entity_id", "category_id", "person_id"], fd);
}
export async function deleteClassificationRule(fd: FormData) { await remove("classification_rules", "regras", fd); }
