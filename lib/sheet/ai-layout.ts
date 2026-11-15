import { layoutSchema, sanitizeLayout, type Layout } from "@/lib/sheet/layout";
import { matchCard } from "@/lib/sheet/cards";
import { dumpGrids, type Grid } from "@/lib/sheet/read";

export type Complete = (system: string, user: string) => Promise<string>;

export const LAYOUT_SYSTEM = `Você lê uma planilha de finanças de uma família que tem uma agência de marketing (Aventure Comunicação).
A planilha tem formato próprio. Seu trabalho é devolver um MAPA dos blocos de dados, sem inventar nada.
Responda SOMENTE com JSON, sem texto antes ou depois:
{"regions":[{"id":"curto-e-unico","sheet":"nome da aba","kind":"monthly_bills|income|card_purchases|invoice_total|ignore","label":"texto curto para a pessoa","month":"AAAA-MM","card":"nome do cartão como na planilha ou null","firstRow":1,"lastRow":1,"valueCol":1,"descriptionCol":1,"dateCol":null}],"notes":""}

Regras:
- Linhas e colunas começam em 1 (A=1, B=2…), como nas coordenadas do texto recebido (L12 = linha 12, C = coluna 3).
- Um bloco por combinação de mês + tipo (+ cartão). Se há várias colunas de meses lado a lado, cada mês é um bloco.
- kind "monthly_bills": bloco "GASTOS MENSAIS" (valor, descrição, vencimento). month = mês do vencimento.
- kind "income": recebimentos por dia (dateCol = coluna do dia). month = mês do recebimento.
- kind "card_purchases": compras do cartão num mês. month = mês em que a FATURA VENCE. card = nome do cartão do bloco (ex.: "ITAU", "CARTÃO ALEXANDRE").
- kind "invoice_total": linha só com o total da fatura (não deve ser importada). Use "ignore" para o que não é dado (títulos, totais, resumos).
- firstRow/lastRow cobrem só as linhas de dados do bloco (pode incluir a linha de total; o sistema a ignora).
- valueCol = coluna do valor em reais, descriptionCol = coluna do texto, dateCol = coluna do dia/vencimento ou null.
- Deduza o ano pelo contexto (título do mês, datas). Se o ano não aparecer, use o ano de "hoje" informado.
- Em dúvida sobre um bloco, use kind "ignore" e explique em "notes". Nunca invente valores nem blocos.`;

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A resposta do Claude não trouxe um JSON.");
  return JSON.parse(t.slice(start, end + 1));
}

/** Pede ao Claude o mapa do layout; valida com Zod (uma nova tentativa com o erro) e vincula os cartões. */
export async function mapLayout(args: {
  grids: Grid[];
  today: string;
  methods: { id: string; name: string }[];
  complete: Complete;
}): Promise<{ layout: Layout; warnings: string[] }> {
  const user = `Hoje: ${args.today}\nCartões e meios cadastrados: ${args.methods.map((m) => m.name).join(", ") || "nenhum"}\n\nPLANILHA:\n${dumpGrids(args.grids)}`;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await args.complete(LAYOUT_SYSTEM, attempt === 0 ? user : `${user}\n\nSua resposta anterior era inválida (${lastError}). Corrija e responda só com o JSON.`);
    try {
      const parsed = layoutSchema.parse(parseJson(text));
      const { layout, warnings } = sanitizeLayout(parsed, args.grids);
      layout.regions = layout.regions.map((r) => ({ ...r, cardId: r.kind === "card_purchases" ? matchCard(r.card, args.methods)?.id ?? null : null }));
      return { layout, warnings };
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 300) : "formato inválido";
    }
  }
  throw new Error(`Não consegui entender o layout da planilha (${lastError}).`);
}
