import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, type ModelTurn } from "@/lib/analista/chat";

const client = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  return new Anthropic({ apiKey });
};
export const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const opusModel = () => process.env.ANTHROPIC_MODEL_OPUS || "claude-opus-5-5";
export const chatModelName = () => process.env.ANTHROPIC_MODEL_CHAT || process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-5-5";

/** Claude Opus: relatório mensal. Só recebe dados agregados. */
export async function opusText(system: string, user: string): Promise<string> {
  const res = await client().messages.create({ model: opusModel(), max_tokens: 4000, system, messages: [{ role: "user", content: user }] });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

/** Modelo do chat, com as ferramentas de leitura. */
export function chatModel(system: string) {
  const c = client();
  return async (messages: unknown[]): Promise<ModelTurn> => {
    const res = await c.messages.create({
      model: chatModelName(), max_tokens: 2000, system,
      tools: TOOLS as unknown as Anthropic.Tool[], messages: messages as Anthropic.MessageParam[],
    });
    return {
      text: res.content.map((b) => (b.type === "text" ? b.text : "")).join(""),
      toolCalls: res.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, input: b.input }] : [])),
      raw: res.content,
    };
  };
}
