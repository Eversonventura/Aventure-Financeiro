import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { processWebhook } from "@/lib/asaas/process";
import { resolveOrgId } from "@/lib/asaas/org";
import { webhookSchema } from "@/lib/asaas/types";
import { todayFortaleza } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;
const MAX_BYTES = 256 * 1024;

function authorized(request: NextRequest): boolean {
  const secret = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("asaas-access-token") ?? "");
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Webhook do Asaas: confere o token, ignora evento repetido (pelo id) e baixa a mensalidade do cliente.
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const text = await request.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: true, ignored: "formato desconhecido" }); // 200: não faz o Asaas reenviar à toa

  try {
    const admin = createAdminClient();
    const orgId = await resolveOrgId(admin);
    const r = await processWebhook(admin, { orgId, userId: null, today: todayFortaleza() }, parsed.data);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("webhook asaas", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Falha ao processar." }, { status: 500 }); // o Asaas tenta de novo
  }
}
