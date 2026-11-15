import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { INVOICE_SYSTEM } from "@/lib/fatura/ai";

/** Claude Sonnet lê o PDF da fatura (o PDF vai direto como documento: serve também para fatura escaneada). */
export async function sonnetReadInvoicePdf(pdf: Uint8Array): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  const res = await new Anthropic({ apiKey }).messages.create({
    model: process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-5-5", max_tokens: 8000, system: INVOICE_SYSTEM,
    messages: [{ role: "user", content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") } },
      { type: "text", text: "Extraia os lançamentos desta fatura." },
    ] }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}
