import { describe, expect, it } from "vitest";
import { groupOff, monthTotal, ruleFor, series, type OffTx } from "./fora-pj";

const tx = (id: string, description: string, cents: number, date: string, pm = "itau", o: Partial<OffTx> = {}): OffTx => ({
  id, description, amount_cents: cents, paid_amount_cents: null, status: "pending", competence_date: date, payment_method_id: pm, ...o,
});
const txs = [
  tx("1", "CANVA", 4990, "2026-11-05"), tx("2", "Canva", 4990, "2026-10-05"), tx("3", "ChatGPT", 10000, "2026-11-06"),
  tx("4", "CHATGPT", 10000, "2026-10-06"), tx("5", "CapCut", 3500, "2026-11-08", "nubank"), tx("6", "Uber", 2000, "2026-11-09"),
  tx("7", "Uber", 2500, "2026-11-20", "itau", { status: "paid", paid_amount_cents: 2600 }),
];

describe("gastos da Aventure fora do PJ", () => {
  it("total do mês usa o valor real pago quando existe", () => {
    expect(monthTotal(txs, "2026-11-01")).toBe(4990 + 10000 + 3500 + 2000 + 2600);
    expect(monthTotal(txs, "2026-10-01")).toBe(14990);
    expect(monthTotal(txs, "2026-09-01")).toBe(0);
  });
  it("série dos últimos 6 meses, do mais antigo ao mais novo (o número deve cair mês a mês)", () => {
    const s = series(txs, "2026-11-01");
    expect(s).toHaveLength(6);
    expect(s[0].month).toBe("2026-06-01");
    expect(s[5]).toMatchObject({ month: "2026-11-01", cents: 23090 });
    expect(s[4].cents).toBe(14990);
  });
  it("agrupa a mesma descrição no mesmo meio, sem acento nem caixa, maior primeiro", () => {
    const g = groupOff(txs, "2026-11-01");
    expect(g.map((x) => [x.description, x.methodId, x.count, x.totalCents])).toEqual([
      ["ChatGPT", "itau", 1, 10000], ["CANVA", "itau", 1, 4990], ["Uber", "itau", 2, 4600], ["CapCut", "nubank", 1, 3500],
    ].sort((a, b) => (b[3] as number) - (a[3] as number)));
  });
  it("acha a regra recorrente do grupo para migrar de cartão", () => {
    const rules = [{ id: "r1", description: "canva", payment_method_id: "itau" }, { id: "r2", description: "CapCut", payment_method_id: "itau" }];
    const g = groupOff(txs, "2026-11-01");
    expect(ruleFor(rules, g.find((x) => x.description === "CANVA")!)?.id).toBe("r1");
    expect(ruleFor(rules, g.find((x) => x.description === "CapCut")!)).toBeNull(); // regra é de outro meio
  });
});
