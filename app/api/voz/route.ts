import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sonnetText } from "@/lib/capture/anthropic";
import { loadCaptureRefs, whoCanWrite } from "@/lib/capture/server";
import { buildVoiceUser, parseVoice, VOICE_SYSTEM } from "@/lib/capture/voice";
import { todayFortaleza } from "@/lib/dates";
import { hasAnthropicKey } from "@/lib/sheet/anthropic";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const body = z.object({ text: z.string().trim().min(3).max(500) });

// Frase falada (já transcrita pelo navegador) -> campos do lançamento. Só sugere: a pessoa confirma no formulário.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const who = await whoCanWrite(supabase);
  if (!who) return NextResponse.json({ error: "Sessão expirada ou sem permissão." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Diga ou digite o lançamento." }, { status: 400 });
  if (!hasAnthropicKey()) return NextResponse.json({ error: "A IA não está configurada (ANTHROPIC_API_KEY)." }, { status: 503 });

  try {
    const refs = await loadCaptureRefs(supabase, todayFortaleza());
    const capture = parseVoice(await sonnetText(VOICE_SYSTEM, buildVoiceUser(parsed.data.text, refs)), refs);
    return NextResponse.json({ capture });
  } catch (e) {
    console.error("voz", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui entender. Tente falar de novo ou preencha à mão." }, { status: 502 });
  }
}
