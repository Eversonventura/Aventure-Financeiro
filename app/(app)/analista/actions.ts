"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasKey, opusModel, opusText } from "@/lib/analista/anthropic";
import { generateMonthlyReport } from "@/lib/analista/data";
import { monthStart, todayFortaleza } from "@/lib/dates";
import { addInvoiceMonths } from "@/lib/invoice";
import { getCtx } from "@/lib/org";

/** Gera (ou refaz) o relatório do mês escolhido, que por padrão é o mês anterior. */
export async function generateReport(fd: FormData) {
  const c = await getCtx();
  const today = todayFortaleza();
  const raw = String(fd.get("mes") ?? "");
  const month = /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : addInvoiceMonths(monthStart(today), -1);
  const back = (q: string): never => { revalidatePath("/analista"); redirect(`/analista?${q}`); };
  if (!hasKey()) return back("erro=" + encodeURIComponent("A ANTHROPIC_API_KEY não está configurada na Vercel."));
  try {
    await generateMonthlyReport(c.supabase, c.orgId, month, today, opusText, opusModel());
  } catch (e) {
    console.error("gerar relatorio", e instanceof Error ? e.message : e);
    return back("erro=" + encodeURIComponent("Não consegui gerar o relatório agora. Tente de novo em instantes."));
  }
  back(`mes=${month.slice(0, 7)}`);
}
