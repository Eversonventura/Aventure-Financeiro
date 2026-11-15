import { z } from "zod";
import type { AiResult, Item } from "@/lib/classify/engine";
import { fitsEntity } from "@/lib/categories";
import type { Complete } from "@/lib/sheet/ai-layout";

export type Refs = {
  entities: { id: string; name: string; kind: "pj" | "pf" | "shared" }[];
  people: { id: string; name: string }[];
  categories: { id: string; name: string; applies_to: "pj" | "pf" | "shared" | null; direction: "in" | "out" }[];
  methods: { id: string; name: string }[];
  examples: { description: string; entity: string; category: string }[];
};

export const CLASSIFY_SYSTEM = `Você classifica lançamentos financeiros de uma família que tem uma agência de marketing (Aventure Comunicação, ME no Simples Nacional, Fortaleza-CE).
As contas são misturadas: um cartão pessoal pode pagar uma ferramenta da empresa. Decida pela NATUREZA do gasto, não pelo cartão.
"entity" é quem arca com o gasto (ou recebe a entrada). "person" é quem fez o gasto (pode ser null).
Use SOMENTE os códigos das listas recebidas. Nunca invente códigos. Em dúvida, baixe a confiança e escreva uma pergunta curta.
Responda só com JSON: {"items":[{"i":0,"entity":"e1","category":"c3","person":null,"confidence":0.0,"question":null}]}
- confidence de 0 a 1. Se confidence < 0.8, "question" é uma pergunta curta em português ("Este item de mercado é da Casa?"); senão null.
- Categorias de pessoa física também valem para a Casa (gasto compartilhado da família).
- "category" só pode ser de uma categoria que valha para a entidade escolhida e na mesma direção (saída/entrada) do lançamento.`;

const answerSchema = z.object({
  items: z.array(z.object({
    i: z.number().int().min(0),
    entity: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    person: z.string().nullable().optional(),
    confidence: z.number(),
    question: z.string().nullable().optional(),
  })),
});

export type Codes = { e: Map<string, string>; c: Map<string, string>; p: Map<string, string> };

export function buildPrompt(refs: Refs, items: Item[]): { user: string; codes: Codes } {
  const codes: Codes = { e: new Map(), c: new Map(), p: new Map() };
  refs.entities.forEach((e, i) => codes.e.set(`e${i + 1}`, e.id));
  refs.categories.forEach((c, i) => codes.c.set(`c${i + 1}`, c.id));
  refs.people.forEach((p, i) => codes.p.set(`p${i + 1}`, p.id));
  const kind = { pj: "empresa (PJ)", pf: "pessoa (PF)", shared: "compartilhado" } as const;
  const user = [
    `Entidades: ${refs.entities.map((e, i) => `e${i + 1}=${e.name} (${kind[e.kind]})`).join("; ")}`,
    `Pessoas: ${refs.people.map((p, i) => `p${i + 1}=${p.name}`).join("; ")}`,
    `Categorias (código=nome; vale para; direção): ${refs.categories.map((c, i) => `c${i + 1}=${c.name}; ${c.applies_to ? kind[c.applies_to] : "qualquer"}; ${c.direction === "in" ? "entrada" : "saída"}`).join(" | ")}`,
    refs.examples.length ? `Exemplos confirmados recentes: ${refs.examples.map((x) => `"${x.description}" → ${x.entity} / ${x.category}`).join("; ")}` : "",
    `Lançamentos: ${JSON.stringify(items.map((it, i) => ({
      i, description: it.description, amount: it.amount_cents / 100, type: it.type === "income" ? "entrada" : "saída",
      method: refs.methods.find((m) => m.id === it.payment_method_id)?.name ?? null,
      person: refs.people.find((p) => p.id === it.person_id)?.name ?? null,
    })))}`,
  ].filter(Boolean).join("\n");
  return { user, codes };
}

/** Valida a resposta: códigos desconhecidos viram null, categoria incompatível com a entidade é descartada. */
export function parseAnswer(text: string, codes: Codes, refs: Refs, count: number): (AiResult | null)[] {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = t.indexOf("{"), end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("resposta sem JSON");
  const parsed = answerSchema.parse(JSON.parse(t.slice(start, end + 1)));
  const out: (AiResult | null)[] = Array.from({ length: count }, () => null);
  for (const a of parsed.items) {
    if (a.i >= count) continue;
    const entityId = a.entity ? codes.e.get(a.entity) ?? null : null;
    let categoryId = a.category ? codes.c.get(a.category) ?? null : null;
    const personId = a.person ? codes.p.get(a.person) ?? null : null;
    const cat = refs.categories.find((c) => c.id === categoryId);
    const ent = refs.entities.find((e) => e.id === entityId);
    if (cat && ent && !fitsEntity(cat.applies_to, ent.kind)) categoryId = null;
    if (!entityId && !categoryId) continue;
    out[a.i] = { entity_id: entityId, category_id: categoryId, person_id: personId, confidence: Math.max(0, Math.min(1, a.confidence)), question: a.question?.slice(0, 160) ?? null };
  }
  return out;
}

const CHUNK = 40;

/** Chama o Claude Haiku em lotes. Falha de rede ou resposta inválida de um lote não derruba os outros. */
export function makeAi(refs: Refs, complete: Complete) {
  return async (items: Item[]): Promise<(AiResult | null)[]> => {
    const out: (AiResult | null)[] = [];
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      try {
        const { user, codes } = buildPrompt(refs, chunk);
        out.push(...parseAnswer(await complete(CLASSIFY_SYSTEM, user), codes, refs, chunk.length));
      } catch (e) {
        console.error("classificacao ia", e instanceof Error ? e.message : e);
        out.push(...chunk.map(() => null));
      }
    }
    return out;
  };
}
