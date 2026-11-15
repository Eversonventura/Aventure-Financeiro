import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Abre a foto do cupom por um link assinado de curta duração (o bucket é privado).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i.test(path)) return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 60); // a RLS do bucket só deixa membros da organização
  if (error || !data) return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, 302);
}
