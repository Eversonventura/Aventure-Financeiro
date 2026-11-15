import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { monthStart, todayFortaleza } from "@/lib/dates";
import { generateMonth } from "@/lib/generate";
import { createAdminClient } from "@/lib/supabase/admin";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Vercel Cron chama esta rota com "Authorization: Bearer $CRON_SECRET".
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const month = monthStart(todayFortaleza());
  try {
    const result = await generateMonth(createAdminClient(), month);
    return NextResponse.json({ month, ...result });
  } catch (e) {
    console.error("cron recorrencias", e);
    return NextResponse.json({ error: "Falha ao gerar as recorrências." }, { status: 500 });
  }
}
