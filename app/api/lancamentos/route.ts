import { NextResponse, type NextRequest } from "next/server";
import { buildLaunch, launchSchema, type MethodInfo } from "@/lib/launch";
import { createClient } from "@/lib/supabase/server";

// Recebe um lançamento do celular (direto ou da fila offline) e grava com idempotência:
// o id do lançamento vira o id do grupo e o external_id de cada parcela, então reenviar não duplica.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const parsed = launchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Lançamento inválido." }, { status: 400 });
  }
  const input = parsed.data;

  const { data: m } = await supabase.from("memberships").select("org_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!m) return NextResponse.json({ error: "Usuário sem organização." }, { status: 403 });
  if (m.role === "viewer") return NextResponse.json({ error: "Seu acesso é só de leitura." }, { status: 403 });
  const orgId = m.org_id as string;

  const ids = [input.payment_method_id, input.to_payment_method_id].filter((x): x is string => !!x);
  const { data: pms } = ids.length
    ? await supabase.from("payment_methods").select("id, kind, closing_day, due_day").in("id", ids)
    : { data: [] as MethodInfo[] };
  const byId = new Map((pms ?? []).map((p) => [p.id as string, p as MethodInfo]));
  const method = input.payment_method_id ? byId.get(input.payment_method_id) ?? null : null;
  const toMethod = input.to_payment_method_id ? byId.get(input.to_payment_method_id) ?? null : null;
  if ((input.payment_method_id && !method) || (input.to_payment_method_id && !toMethod)) {
    return NextResponse.json({ error: "Meio de pagamento não encontrado." }, { status: 400 });
  }

  const built = buildLaunch(input, method, toMethod);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

  if (built.group) {
    const { error } = await supabase
      .from("installment_groups")
      .upsert({ ...built.group, org_id: orgId }, { onConflict: "id", ignoreDuplicates: true });
    if (error) return dbError(error);
  }
  const { error } = await supabase
    .from("transactions")
    .upsert(
      built.rows.map((r) => ({ ...r, org_id: orgId, created_by: user.id })),
      { onConflict: "org_id,source,external_id", ignoreDuplicates: true },
    );
  if (error) return dbError(error);

  return NextResponse.json({ ok: true, count: built.rows.length });
}

function dbError(error: { code?: string }) {
  // 23503/42501: dado de outra organização ou sem permissão -> recusa definitiva (4xx).
  if (error.code === "23503" || error.code === "42501") {
    return NextResponse.json({ error: "Dados inválidos para esta organização." }, { status: 400 });
  }
  return NextResponse.json({ error: "Erro ao salvar. Tente de novo." }, { status: 500 });
}
