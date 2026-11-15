import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { asaasFromEnv, hasAsaasKey } from "@/lib/asaas/client";
import { resolveOrgId } from "@/lib/asaas/org";
import { syncPayments } from "@/lib/asaas/sync";
import { todayFortaleza } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Todo dia: baixa as cobranças pagas que o webhook possa ter perdido.
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!hasAsaasKey()) return NextResponse.json({ skipped: "ASAAS_API_KEY não configurada." });
  try {
    const admin = createAdminClient();
    const orgId = await resolveOrgId(admin);
    const result = await syncPayments(admin, { orgId, userId: null, today: todayFortaleza() }, asaasFromEnv());
    return NextResponse.json(result);
  } catch (e) {
    console.error("cron asaas", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Falha na sincronização com o Asaas." }, { status: 500 });
  }
}
