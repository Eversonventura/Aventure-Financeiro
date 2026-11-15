import { describe, expect, it } from "vitest";
import { diffDays, monthEnd, monthLabel, monthStart, todayFortaleza } from "./dates";

describe("datas", () => {
  it("hoje no fuso de Fortaleza, mesmo quando o servidor já virou o dia em UTC", () => {
    expect(todayFortaleza(new Date("2026-11-15T01:30:00Z"))).toBe("2026-11-14");
    expect(todayFortaleza(new Date("2026-11-15T03:00:00Z"))).toBe("2026-11-15");
  });
  it("início e fim do mês", () => {
    expect(monthStart("2026-11-14")).toBe("2026-11-01");
    expect(monthEnd("2026-11-01")).toBe("2026-11-30");
    expect(monthEnd("2028-02-01")).toBe("2028-02-29");
  });
  it("diferença em dias e rótulo do mês", () => {
    expect(diffDays("2026-11-14", "2026-11-20")).toBe(6);
    expect(diffDays("2026-11-14", "2026-11-10")).toBe(-4);
    expect(diffDays("2026-12-31", "2027-01-01")).toBe(1);
    expect(monthLabel("2026-03-01")).toBe("março de 2026");
  });
});
