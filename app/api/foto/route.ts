import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sonnetVision } from "@/lib/capture/anthropic";
import { isJpeg, MAX_IMAGE_BYTES, parseReceipt, RECEIPT_SYSTEM } from "@/lib/capture/receipt";
import { loadCaptureRefs, whoCanWrite } from "@/lib/capture/server";
import { todayFortaleza } from "@/lib/dates";
import { hasAnthropicKey } from "@/lib/sheet/anthropic";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// Foto do cupom: guarda em bucket privado (receipts/{org}/{lançamento}.jpg) e pede ao Claude os dados da compra.
// A foto fica anexada mesmo se a IA falhar: a pessoa preenche à mão.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const who = await whoCanWrite(supabase);
  if (!who) return NextResponse.json({ error: "Sessão expirada ou sem permissão." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const launchId = z.uuid().safeParse(String(form?.get("launch_id") ?? ""));
  if (!(file instanceof File) || !launchId.success) return NextResponse.json({ error: "Envie a foto." }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Foto grande demais." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isJpeg(bytes)) return NextResponse.json({ error: "Formato de imagem não suportado." }, { status: 400 });

  const path = `${who.orgId}/${launchId.data}.jpg`;
  const up = await supabase.storage.from("receipts").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (up.error) return NextResponse.json({ error: "Não foi possível guardar a foto." }, { status: 500 });

  if (!hasAnthropicKey()) return NextResponse.json({ path, capture: null, warning: "A IA não está configurada: preencha à mão. A foto foi anexada." });
  try {
    const refs = await loadCaptureRefs(supabase, todayFortaleza());
    const capture = parseReceipt(await sonnetVision(RECEIPT_SYSTEM, bytes, "Extraia os dados desta compra."), refs);
    return NextResponse.json({ path, capture });
  } catch (e) {
    console.error("foto", e instanceof Error ? e.message : e);
    return NextResponse.json({ path, capture: null, warning: "Não consegui ler a foto: preencha à mão. Ela foi anexada." });
  }
}
