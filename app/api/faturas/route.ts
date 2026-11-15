import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { todayFortaleza } from "@/lib/dates";
import { parseInvoiceAnswer } from "@/lib/fatura/ai";
import { sonnetReadInvoicePdf } from "@/lib/fatura/anthropic";
import { parseInvoiceCsv } from "@/lib/fatura/csv";
import { parseOfx } from "@/lib/fatura/ofx";
import { invoiceMonthFor } from "@/lib/invoice";
import { hasAnthropicKey } from "@/lib/sheet/anthropic";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;
const MAX_BYTES = 4 * 1024 * 1024;

function decode(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); } // CSV de banco costuma vir em Latin-1
}

// Recebe a fatura (PDF, CSV ou OFX), guarda em bucket privado e extrai as linhas. A conferência é feita na tela seguinte.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { data: m } = await supabase.from("memberships").select("org_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!m || m.role === "viewer") return NextResponse.json({ error: "Sem permissão para importar." }, { status: 403 });
  const orgId = m.org_id as string;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const card = z.uuid().safeParse(String(form?.get("payment_method_id") ?? ""));
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie o arquivo da fatura (PDF, CSV ou OFX)." }, { status: 400 });
  if (!card.success) return NextResponse.json({ error: "Escolha o cartão." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo grande demais (máximo 4 MB)." }, { status: 400 });

  const { data: pm } = await supabase.from("payment_methods").select("id, kind, closing_day, due_day").eq("id", card.data).maybeSingle();
  if (!pm || pm.kind !== "credit_card") return NextResponse.json({ error: "Escolha um cartão de crédito." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  const name = file.name.toLowerCase();
  const text = isPdf ? "" : decode(bytes);
  const isOfx = !isPdf && (name.endsWith(".ofx") || /<OFX>|OFXHEADER/i.test(text.slice(0, 2000)));
  if (!isPdf && !isOfx && !name.endsWith(".csv") && !name.endsWith(".txt")) return NextResponse.json({ error: "Formato não suportado. Use PDF, CSV ou OFX." }, { status: 400 });
  const kind = isPdf ? "invoice_pdf" : isOfx ? "ofx" : "invoice_csv";

  const importId = crypto.randomUUID();
  const ext = isPdf ? "pdf" : isOfx ? "ofx" : "csv";
  const path = `${orgId}/${importId}.${ext}`;
  const up = await supabase.storage.from("imports").upload(path, bytes, { contentType: isPdf ? "application/pdf" : "text/plain" });
  if (up.error) return NextResponse.json({ error: "Não foi possível guardar o arquivo." }, { status: 500 });
  const ins = await supabase.from("imports").insert({ id: importId, org_id: orgId, kind, file_path: path, original_name: file.name.slice(0, 200), status: "mapping", created_by: user.id });
  if (ins.error) return NextResponse.json({ error: "Não foi possível registrar a importação." }, { status: 500 });

  const fail = async (error: string) => {
    await supabase.from("imports").update({ status: "failed", stats: { error } }).eq("id", importId);
    return NextResponse.json({ id: importId, status: "failed" });
  };
  try {
    const today = todayFortaleza();
    let parsed;
    if (isPdf) {
      if (!hasAnthropicKey()) return await fail("A chave ANTHROPIC_API_KEY não está configurada na Vercel (necessária para ler PDF). Use o CSV ou o OFX, ou cadastre a chave.");
      parsed = parseInvoiceAnswer(await sonnetReadInvoicePdf(bytes), today);
    } else {
      parsed = isOfx ? parseOfx(text, today) : parseInvoiceCsv(text, today);
    }
    if (parsed.lines.length === 0) return await fail(parsed.warnings[0] ?? "Não encontrei compras neste arquivo.");

    // mês da fatura (mês do vencimento): pelo vencimento lido, ou pela última compra e pelo fechamento do cartão
    const last = parsed.lines.reduce((a, l) => (l.date > a ? l.date : a), parsed.lines[0].date);
    const month = parsed.dueDate ? `${parsed.dueDate.slice(0, 7)}-01` : pm.closing_day && pm.due_day ? invoiceMonthFor(last, pm.closing_day as number, pm.due_day as number) : `${last.slice(0, 7)}-01`;
    await supabase.from("imports").update({ status: "ready", layout: { card_id: card.data, month: month.slice(0, 7), lines: parsed.lines, ignored: [] }, stats: { warnings: parsed.warnings, lines: parsed.lines.length } }).eq("id", importId);
    return NextResponse.json({ id: importId, status: "ready" });
  } catch (e) {
    console.error("fatura", e instanceof Error ? e.message : e);
    return await fail("Não consegui ler a fatura. Tente o CSV ou o OFX do aplicativo do banco.");
  }
}
