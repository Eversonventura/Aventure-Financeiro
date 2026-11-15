import { norm } from "@/lib/sheet/extract";

const STOP = new Set(["cartao", "credito", "de", "do", "da", "conta", "final"]);
const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));

/** "ITAU" -> Cartão Itaú. Se mais de um cartão combina (ex.: "NUBANK"), devolve null para a pessoa escolher. */
export function matchCard<T extends { id: string; name: string }>(sheetName: string | null, methods: T[]): T | null {
  if (!sheetName) return null;
  const want = tokens(sheetName);
  if (want.length === 0) return null;
  const cands = methods.filter((m) => {
    const have = tokens(m.name);
    return want.every((w) => have.includes(w));
  });
  if (cands.length === 1) return cands[0];
  return cands.find((m) => norm(m.name) === norm(sheetName)) ?? null;
}
