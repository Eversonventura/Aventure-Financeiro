import { describe, expect, it } from "vitest";
import { fitWithin } from "../image";
import { isJpeg, parseReceipt, RECEIPT_SYSTEM } from "./receipt";
import { buildVoiceUser, cleanDate, parseVoice, toCents, VOICE_SYSTEM } from "./voice";
import type { CaptureRefs } from "./types";

const refs: CaptureRefs = {
  today: "2026-11-14",
  methods: [{ id: "m-itau", name: "Cartão Itaú" }, { id: "m-nuv", name: "Nubank Ventura" }, { id: "m-nua", name: "Nubank Amanda" }],
  entities: [{ id: "e-av", name: "Aventure" }, { id: "e-casa", name: "Casa" }],
};
const json = (o: object) => "```json\n" + JSON.stringify(o) + "\n```";

describe("voz: 'gastei 45 no Cometa no Itaú em 3 vezes'", () => {
  it("vira valor, descrição, meio e parcelas", () => {
    const c = parseVoice(json({ type: "expense", amount: 45, description: "Cometa", payment_method: "Itaú", installments: 3, date: null, entity: null, confidence: 0.95 }), refs);
    expect(c).toMatchObject({ type: "expense", amount_cents: 4500, description: "Cometa", payment_method_id: "m-itau", installments: 3, date: null, entity_id: null });
    expect(c.confidence).toBe(0.95);
  });
  it("valor com centavos e entrada", () => {
    const c = parseVoice(json({ type: "income", amount: 45.5, description: "SR Tecnologia", payment_method: null, confidence: 0.9 }), refs);
    expect(c).toMatchObject({ type: "income", amount_cents: 4550, payment_method_id: null });
  });
  it("valor que não ficou claro vem vazio: nunca inventa", () => {
    expect(parseVoice(json({ type: "expense", amount: null, description: "Padaria" }), refs).amount_cents).toBeNull();
    expect(parseVoice(json({ amount: 0, description: "x" }), refs).amount_cents).toBeNull();
    expect(parseVoice(json({ amount: -5, description: "x" }), refs).amount_cents).toBeNull();
    expect(parseVoice(json({ amount: 9_999_999, description: "x" }), refs).amount_cents).toBeNull();
  });
  it("meio ambíguo (Nubank) fica em branco para a pessoa escolher; entidade pelo nome", () => {
    const c = parseVoice(json({ amount: 10, description: "Uber", payment_method: "Nubank", entity: "casa" }), refs);
    expect(c.payment_method_id).toBeNull();
    expect(c.entity_id).toBe("e-casa");
    expect(parseVoice(json({ amount: 10, description: "x", entity: "Inexistente" }), refs).entity_id).toBeNull();
  });
  it("parcelas e datas inválidas são descartadas", () => {
    const c = parseVoice(json({ amount: 10, description: "x", installments: 99, date: "2026-02-30" }), refs);
    expect(c.installments).toBeNull();
    expect(c.date).toBeNull();
    expect(parseVoice(json({ amount: 10, description: "x", installments: 2.5 }), refs).installments).toBeNull();
  });
  it("aceita data relativa já resolvida pelo Claude e rejeita data muito distante", () => {
    expect(cleanDate("2026-11-13", refs.today)).toBe("2026-11-13");
    expect(cleanDate("2020-01-01", refs.today)).toBeNull();
    expect(cleanDate("2030-01-01", refs.today)).toBeNull();
  });
  it("resposta sem JSON vira erro; o prompt traz o contexto", () => {
    expect(() => parseVoice("não entendi", refs)).toThrow();
    const u = buildVoiceUser("gastei 45 no Cometa", refs);
    expect(u).toContain("Hoje: 2026-11-14");
    expect(u).toContain("Cartão Itaú");
    expect(VOICE_SYSTEM).toContain("Nunca invente");
  });
  it("centavos arredondados sem erro de ponto flutuante", () => {
    expect(toCents(19.9)).toBe(1990);
    expect(toCents(0.07)).toBe(7);
    expect(toCents(1.005)).toBe(101);
  });
});

describe("foto do cupom", () => {
  it("extrai estabelecimento, data, total e parcelas", () => {
    const c = parseReceipt(json({ merchant: "COMETA SUPERMERCADOS", date: "2026-11-12", total: 128.9, installments: 1, payment_hint: "Itaú", confidence: 0.9 }), refs);
    expect(c).toMatchObject({ type: "expense", description: "COMETA SUPERMERCADOS", amount_cents: 12890, date: "2026-11-12", installments: 1, payment_method_id: "m-itau" });
  });
  it("valor ilegível volta vazio, nunca inventado", () => {
    const c = parseReceipt(json({ merchant: "Loja", date: null, total: null, installments: 1, confidence: 0.3 }), refs);
    expect(c.amount_cents).toBeNull();
    expect(c.date).toBeNull();
    expect(c.confidence).toBe(0.3);
  });
  it("data no futuro (além de amanhã) é descartada", () => {
    expect(parseReceipt(json({ merchant: "x", date: "2026-12-30", total: 10 }), refs).date).toBeNull();
    expect(parseReceipt(json({ merchant: "x", date: "2026-11-15", total: 10 }), refs).date).toBe("2026-11-15");
  });
  it("dica de pagamento só reconhece pelo nome (últimos 4 dígitos não casam com nada)", () => {
    expect(parseReceipt(json({ merchant: "x", total: 10, payment_hint: "final 4821" }), refs).payment_method_id).toBeNull();
    expect(parseReceipt(json({ merchant: "x", total: 10, payment_hint: "Nubank Amanda" }), refs).payment_method_id).toBe("m-nua");
  });
  it("o prompt proíbe inventar valores", () => {
    expect(RECEIPT_SYSTEM).toContain("Nunca invente");
    expect(RECEIPT_SYSTEM).toContain("total = null");
  });
});

describe("imagem", () => {
  it("só aceita JPEG de verdade", () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false); // PNG
    expect(isJpeg(new Uint8Array([]))).toBe(false);
  });
  it("reduz proporcionalmente e nunca aumenta", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 });
  });
});
