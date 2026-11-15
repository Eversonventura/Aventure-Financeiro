import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const client = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  return new Anthropic({ apiKey });
};
const model = () => process.env.ANTHROPIC_MODEL_SONNET || "claude-sonnet-5-5";
const text = (res: Anthropic.Message) => res.content.map((b) => (b.type === "text" ? b.text : "")).join("");

/** Claude Sonnet interpreta a fala (texto já transcrito pelo navegador). */
export async function sonnetText(system: string, user: string): Promise<string> {
  return text(await client().messages.create({ model: model(), max_tokens: 1000, system, messages: [{ role: "user", content: user }] }));
}

/** Claude Sonnet lê a foto do cupom. A imagem vai em base64 e não fica guardada no Claude. */
export async function sonnetVision(system: string, jpeg: Uint8Array, prompt: string): Promise<string> {
  const data = Buffer.from(jpeg).toString("base64");
  return text(await client().messages.create({
    model: model(), max_tokens: 1000, system,
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }, { type: "text", text: prompt }] }],
  }));
}
