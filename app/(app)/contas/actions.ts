"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { monthStart, todayFortaleza } from "@/lib/dates";
import { brlToCents } from "@/lib/format";
import { generateMonth } from "@/lib/generate";
import { getCtx } from "@/lib/org";

const back = (mes: string, erro?: string): never => {
  revalidatePath("/contas");
  redirect(`/contas?mes=${mes.slice(0, 7)}${erro ? `&erro=${encodeURIComponent(erro)}` : ""}`);
};

/** Marca como pago/recebido. Valor vazio = o previsto. */
export async function markPaid(fd: FormData) {
  const mes = String(fd.get("mes") ?? todayFortaleza());
  const id = z.uuid().safeParse(String(fd.get("id") ?? ""));
  if (!id.success) return back(mes, "Lançamento inválido.");
  const raw = String(fd.get("valor") ?? "");
  const cents = brlToCents(raw);
  if (Number.isNaN(cents) || (cents != null && cents <= 0)) return back(mes, "Valor inválido. Use o formato 55,90.");

  const { supabase } = await getCtx();
  const { data: tx } = await supabase.from("transactions").select("amount_cents").eq("id", id.data).maybeSingle();
  if (!tx) return back(mes, "Lançamento não encontrado.");
  const { error } = await supabase
    .from("transactions")
    .update({ status: "paid", paid_amount_cents: cents ?? tx.amount_cents })
    .eq("id", id.data);
  back(mes, error ? "Não foi possível marcar como pago." : undefined);
}

export async function undoPaid(fd: FormData) {
  const mes = String(fd.get("mes") ?? todayFortaleza());
  const { supabase } = await getCtx();
  const { error } = await supabase
    .from("transactions")
    .update({ status: "pending", paid_amount_cents: null })
    .eq("id", String(fd.get("id") ?? ""));
  back(mes, error ? "Não foi possível desfazer." : undefined);
}

/** Gera agora os previstos do mês (o cron faz isso todo dia). */
export async function generateNow(fd: FormData) {
  const raw = String(fd.get("mes") ?? "");
  const mes = /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : monthStart(todayFortaleza());
  const { supabase, orgId } = await getCtx();
  try {
    await generateMonth(supabase, mes, orgId);
  } catch {
    return back(mes, "Não foi possível gerar as contas do mês.");
  }
  back(mes);
}
