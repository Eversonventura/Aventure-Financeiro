import { NextResponse, type NextRequest } from "next/server";
import { todayFortaleza } from "@/lib/dates";
import { mapLayout } from "@/lib/sheet/ai-layout";
import { hasAnthropicKey, sonnetComplete } from "@/lib/sheet/anthropic";
import { readWorkbook } from "@/lib/sheet/read";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60; // o Claude leva alguns segundos para ler o layout

const MAX_BYTES = 4 * 1024 * 1024;

// Recebe a planilha (.xlsx), guarda em bucket privado e pede ao Claude o mapa do layout.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { data: m } = await supabase.from("memberships").select("org_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!m || m.role === "viewer") return NextResponse.json({ error: "Sem permissão para importar." }, { status: 403 });
  const orgId = m.org_id as string;

  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie um arquivo .xlsx." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Use um arquivo .xlsx (no Google Sheets: Arquivo → Fazer download → Microsoft Excel)." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo grande demais (máximo 4 MB)." }, { status: 400 });
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return NextResponse.json({ error: "O arquivo não é um .xlsx válido." }, { status: 400 });

  const importId = crypto.randomUUID();
  const path = `${orgId}/${importId}.xlsx`;
  const up = await supabase.storage.from("imports").upload(path, buf, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  if (up.error) return NextResponse.json({ error: "Não foi possível guardar o arquivo." }, { status: 500 });
  const ins = await supabase.from("imports").insert({ id: importId, org_id: orgId, kind: "sheet", file_path: path, original_name: file.name.slice(0, 200), status: "mapping", created_by: user.id });
  if (ins.error) return NextResponse.json({ error: "Não foi possível registrar a importação." }, { status: 500 });

  const fail = async (error: string) => {
    await supabase.from("imports").update({ status: "failed", stats: { error } }).eq("id", importId);
    return NextResponse.json({ id: importId, status: "failed" });
  };

  try {
    if (!hasAnthropicKey()) return await fail("A chave ANTHROPIC_API_KEY não está configurada na Vercel. Cadastre-a e tente de novo.");
    const grids = await readWorkbook(buf);
    if (grids.length === 0) return await fail("A planilha está vazia.");
    const { data: methods } = await supabase.from("payment_methods").select("id, name").eq("active", true);
    const { layout, warnings } = await mapLayout({ grids, today: todayFortaleza(), methods: methods ?? [], complete: sonnetComplete() });
    await supabase.from("imports").update({ status: "ready", layout, stats: { warnings } }).eq("id", importId);
    return NextResponse.json({ id: importId, status: "ready" });
  } catch (e) {
    console.error("importacao", e);
    return await fail(e instanceof Error ? e.message.slice(0, 300) : "Falha ao ler a planilha.");
  }
}
