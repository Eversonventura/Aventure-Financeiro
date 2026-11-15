import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Complete } from "@/lib/sheet/ai-layout";

/** Claude Haiku para classificar lançamentos (rápido e barato). O nome do modelo fica em variável de ambiente. */
export function haikuComplete(): Complete {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL_HAIKU || "claude-haiku-5-5";
  return async (system, user) => {
    const res = await client.messages.create({ model, max_tokens: 4000, system, messages: [{ role: "user", content: user }] });
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  };
}
