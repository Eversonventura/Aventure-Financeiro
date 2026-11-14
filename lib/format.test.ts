import { describe, expect, it } from "vitest";
import { brlToCents, centsToBRL, centsToInput, parsePercent } from "./format";

describe("dinheiro", () => {
  it("converte texto em centavos inteiros", () => {
    expect(brlToCents("300")).toBe(30000);
    expect(brlToCents("300,5")).toBe(30050);
    expect(brlToCents("1.234,56")).toBe(123456);
    expect(brlToCents("R$ 49,90")).toBe(4990);
    expect(brlToCents("0,07")).toBe(7);
    expect(brlToCents("")).toBeNull();
  });
  it("rejeita valores inválidos", () => {
    expect(brlToCents("abc")).toBeNaN();
    expect(brlToCents("10,999")).toBeNaN();
    expect(brlToCents("-5")).toBeNaN();
  });
  it("formata em reais", () => {
    expect(centsToBRL(30000)).toBe("R$ 300,00");
    expect(centsToBRL(123456)).toBe("R$ 1.234,56");
    expect(centsToBRL(5)).toBe("R$ 0,05");
    expect(centsToBRL(null)).toBe("—");
    expect(centsToInput(30050)).toBe("300,50");
  });
  it("percentuais", () => {
    expect(parsePercent("30")).toBe(30);
    expect(parsePercent("6,5%")).toBe(6.5);
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("x")).toBeNaN();
  });
});
