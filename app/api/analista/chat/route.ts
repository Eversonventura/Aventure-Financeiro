import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { chatModel, hasKey } from "@/lib/analista/anthropic";
import { CHAT_SYSTEM, chatLoop, runTool } from "@/lib/analista/chat";
import { chatDeps } from "@/lib/analista/data";
import { todayFortaleza } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) })).min(1).max(20),
});

// Chat com os dados: o Claude só consulta pelas ferramentas de leitura pré-definidas (nunca SQL livre),
// sempre com a sessão do usuário e restrito à organização dele.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { data: m } = await supabase.from("memberships").select("org_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!m) return NextResponse.json({ error: "Usuário sem organização." }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.messages[parsed.data.messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Escreva uma pergunta." }, { status: 400 });
  }
  if (!hasKey()) return NextResponse.json({ error: "A IA não está configurada (ANTHROPIC_API_KEY)." }, { status: 503 });

  try {
    const today = todayFortaleza();
    const deps = await chatDeps(supabase, m.org_id as string, today);
    const r = await chatLoop({
      history: parsed.data.messages,
      model: chatModel(CHAT_SYSTEM.replace("{HOJE}", today)),
      run: (name, input) => runTool(name, input, deps),
    });
    return NextResponse.json(r);
  } catch (e) {
    console.error("chat analista", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui responder agora. Tente de novo." }, { status: 502 });
  }
}
