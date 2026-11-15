import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { THRESHOLD } from "@/lib/classify/engine";
import { classifyItems } from "@/lib/classify/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const bodySchema = z.object({
  description: z.string().trim().min(2).max(200),
  amount_cents: z.number().int().min(0).max(100_000_000_00),
  payment_method_id: z.uuid().nullable(),
  person_id: z.uuid().nullable(),
  type: z.enum(["expense", "income"]),
});

// Sugestão de entidade e categoria enquanto a pessoa digita. Não grava nada (nem conta uso de regra).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const { data: m } = await supabase.from("memberships").select("org_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!m) return NextResponse.json({ error: "Usuário sem organização." }, { status: 403 });

  try {
    const { results } = await classifyItems(supabase, m.org_id as string, [parsed.data], { learn: false });
    const r = results[0];
    return NextResponse.json({
      entity_id: r.entity_id, category_id: r.category_id, person_id: r.person_id,
      confidence: r.confidence, source: r.source, question: r.question ?? null, sure: r.confidence >= THRESHOLD,
    });
  } catch (e) {
    console.error("classificar", e instanceof Error ? e.message : e);
    return NextResponse.json({ source: "none", confidence: 0, sure: false }); // sugestão é opcional: nunca trava o lançamento
  }
}
