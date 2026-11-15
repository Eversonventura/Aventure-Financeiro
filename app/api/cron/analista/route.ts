import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { hasKey, opusModel, opusText } from "@/lib/analista/anthropic";
import { generateMonthlyReport } from "@/lib/analista/data";
import { monthStart, todayFortaleza } from "@/lib/dates";
import { addInvoiceMonths } from "@/lib/invoice";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Todo dia 1: gera o relatório do mês anterior de cada organização (se ainda não existir).
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!hasKey()) return NextResponse.json({ skipped: "ANTHROPIC_API_KEY não configurada." });
  const today = todayFortaleza();
  const month = addInvoiceMonths(monthStart(today), -1);
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id");
  const results: { org: string; status: string }[] = [];
  for (const o of orgs ?? []) {
    const orgId = o.id as string;
    try {
      const { data: has } = await admin.from("ai_insights").select("id").eq("org_id", orgId).eq("period_month", month).eq("kind", "monthly_report").limit(1).maybeSingle();
      if (has) { results.push({ org: orgId, status: "já existe" }); continue; }
      await generateMonthlyReport(admin, orgId, month, today, opusText, opusModel());
      results.push({ org: orgId, status: "gerado" });
    } catch (e) {
      console.error("cron analista", orgId, e instanceof Error ? e.message : e);
      results.push({ org: orgId, status: "erro" });
    }
  }
  return NextResponse.json({ month: month.slice(0, 7), results });
}
