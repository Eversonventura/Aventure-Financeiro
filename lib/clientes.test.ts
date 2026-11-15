import { describe, expect, it } from "vitest";
import { summarizeClients, type CRule, type CTx } from "./clientes";

const tx = (id: string, client: string | null, cents: number, cash: string, o: Partial<CTx> = {}): CTx => ({
  id, client_id: client, description: "Mensalidade", amount_cents: cents, paid_amount_cents: null, status: "forecast", cash_date: cash, ...o,
});
const rule = (client: string, cents: number, o: Partial<CRule> = {}): CRule => ({ id: `r-${client}`, client_id: client, amount_cents: cents, day_of_month: 5, start_month: "2026-09-01", end_month: null, ...o });
const clients = [{ id: "sr", name: "SR Tecnologia" }, { id: "sq", name: "Siqueira Nocrato" }, { id: "pl", name: "Plasfran" }, { id: "jl", name: "José Luiz" }];

describe("painel de clientes do mês", () => {
  const base = () => summarizeClients({
    clients, month: "2026-11-01", today: "2026-11-14",
    txs: [
      tx("1", "sr", 250000, "2026-11-05", { status: "paid", paid_amount_cents: 250000 }), // recebido
      tx("2", "sq", 180000, "2026-11-10"), // venceu há 4 dias
      tx("3", "pl", 90000, "2026-11-20"), // a receber
      tx("4", null, 30000, "2026-11-12", { status: "paid", paid_amount_cents: 30000 }), // pontual sem cliente
    ],
    rules: [rule("sr", 250000), rule("sq", 180000), rule("pl", 90000, { end_month: "2027-01-01" }), rule("jl", 70000)],
  });

  it("status de cada cliente: recebido, atrasado (com dias) e a receber", () => {
    const rows = base().rows;
    expect(rows.find((r) => r.name === "SR Tecnologia")).toMatchObject({ status: "recebido", received: 250000, open: 0 });
    expect(rows.find((r) => r.name === "Siqueira Nocrato")).toMatchObject({ status: "atrasado", lateDays: 4, open: 180000, dueDate: "2026-11-10" });
    expect(rows.find((r) => r.name === "Plasfran")).toMatchObject({ status: "a_receber", lateDays: 0, open: 90000 });
  });
  it("cobrança mensal que ainda não foi gerada aparece como previsto", () => {
    expect(base().rows.find((r) => r.name === "José Luiz")).toMatchObject({ status: "nao_gerado", expected: 70000, open: 70000 });
  });
  it("recebimento avulso (sem cliente) entra numa linha própria", () => {
    expect(base().rows.find((r) => r.id === null)).toMatchObject({ name: "Sem cliente (avulsos)", received: 30000, status: "recebido" });
  });
  it("totais, atrasados e ordem (atrasados primeiro, recebidos por último)", () => {
    const s = base();
    expect(s).toMatchObject({ expected: 250000 + 180000 + 90000 + 70000 + 30000, received: 280000, open: 180000 + 90000 + 70000, late: 1 });
    expect(s.rows[0].status).toBe("atrasado");
    expect(s.rows[s.rows.length - 1].status).toBe("recebido");
  });
  it("concentração: quanto o maior cliente representa do esperado", () => {
    expect(base().top).toEqual({ name: "SR Tecnologia", pct: 40 }); // 250 mil de 620 mil esperados (os avulsos entram no total)
  });
  it("contratos que terminam nos próximos 3 meses", () => {
    expect(base().ending).toEqual([{ name: "Plasfran", end_month: "2027-01" }]);
    const longe = summarizeClients({ clients, month: "2026-11-01", today: "2026-11-14", txs: [], rules: [rule("pl", 90000, { end_month: "2027-08-01" })] });
    expect(longe.ending).toHaveLength(0);
  });
  it("regra fora do período não cobra; mês vazio fica sem linhas", () => {
    const s = summarizeClients({ clients, month: "2026-11-01", today: "2026-11-14", txs: [], rules: [rule("sr", 100, { start_month: "2027-01-01" }), rule("sq", 100, { end_month: "2026-10-01" })] });
    expect(s.rows).toHaveLength(0);
    expect(s.top).toBeNull();
  });
  it("parcialmente pago: o que falta continua em aberto", () => {
    const s = summarizeClients({ clients, month: "2026-11-01", today: "2026-11-14", rules: [], txs: [
      tx("a", "sr", 100000, "2026-11-05", { status: "paid", paid_amount_cents: 95000 }), tx("b", "sr", 50000, "2026-11-25"),
    ] });
    expect(s.rows[0]).toMatchObject({ received: 95000, open: 50000, status: "a_receber", expected: 150000 });
  });
});
