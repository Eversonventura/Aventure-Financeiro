import { describe, expect, it, vi } from "vitest";
import { matchCard } from "./cards";
import { mapLayout } from "./ai-layout";
import type { Grid } from "./read";

const grids: Grid[] = [{ name: "Planilha", rows: [["GASTOS MENSAIS"], [850, "Condomínio", 10]] }];
const methods = [{ id: "m-itau", name: "Cartão Itaú" }, { id: "m-alex", name: "Cartão Alexandre" }, { id: "m-nuv", name: "Nubank Ventura" }, { id: "m-nua", name: "Nubank Amanda" }];
const region = (o: object = {}) => ({ id: "g1", sheet: "Planilha", kind: "monthly_bills", label: "Gastos nov", month: "2026-11", firstRow: 2, lastRow: 2, valueCol: 1, descriptionCol: 2, dateCol: 3, ...o });

describe("vincular cartão da planilha ao cadastro", () => {
  it("casa pelo nome e deixa em branco quando é ambíguo", () => {
    expect(matchCard("ITAU", methods)?.id).toBe("m-itau");
    expect(matchCard("CARTÃO ALEXANDRE", methods)?.id).toBe("m-alex");
    expect(matchCard("NUBANK", methods)).toBeNull();
    expect(matchCard("Nubank Amanda", methods)?.id).toBe("m-nua");
    expect(matchCard(null, methods)).toBeNull();
    expect(matchCard("Bradesco", methods)).toBeNull();
  });
});

describe("mapa do layout pelo Claude", () => {
  it("aceita JSON (inclusive dentro de cercas de código) e vincula os cartões", async () => {
    const complete = vi.fn().mockResolvedValue("```json\n" + JSON.stringify({ regions: [region(), region({ id: "c1", kind: "card_purchases", card: "ITAU", valueCol: 6, descriptionCol: 7, dateCol: null })] }) + "\n```");
    const r = await mapLayout({ grids, today: "2026-11-14", methods, complete });
    expect(r.layout.regions).toHaveLength(2);
    expect(r.layout.regions[1].cardId).toBe("m-itau");
    expect(r.layout.regions[0].cardId).toBeNull();
    expect(complete.mock.calls[0][1]).toContain("Hoje: 2026-11-14");
    expect(complete.mock.calls[0][1]).toContain('L2: A=850 | B="Condomínio"');
  });
  it("tenta de novo uma vez quando a resposta vem inválida, e informa o erro", async () => {
    const complete = vi.fn().mockResolvedValueOnce("não sei").mockResolvedValueOnce(JSON.stringify({ regions: [region()] }));
    const r = await mapLayout({ grids, today: "2026-11-14", methods, complete });
    expect(r.layout.regions).toHaveLength(1);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][1]).toContain("resposta anterior era inválida");
  });
  it("falha com mensagem clara se as duas tentativas forem inválidas", async () => {
    const complete = vi.fn().mockResolvedValue("{ \"regions\": [{\"id\": \"x\"}] }");
    await expect(mapLayout({ grids, today: "2026-11-14", methods, complete })).rejects.toThrow(/layout da planilha/);
  });
  it("descarta blocos fora da planilha com aviso", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({ regions: [region(), region({ id: "x", sheet: "Outra" })] }));
    const r = await mapLayout({ grids, today: "2026-11-14", methods, complete });
    expect(r.layout.regions).toHaveLength(1);
    expect(r.warnings.join(" ")).toContain("Outra");
  });
});
