import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Complete } from "@/lib/sheet/ai-layout";

export const hasAnthropicKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Claude Sonnet para ler o layout. O nome do modelo fica em variável de ambiente. */
export function sonnetComplete(): Complete {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada na Vercel.");
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-5-5";
  return async (system, user) => {
    const res = await client.messages.create({ model, max_tokens: 12000, system, messages: [{ role: "user", content: user }] });
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  };
}
