import { describe, expect, it } from "vitest";
import { parseInvoiceAnswer } from "./ai";
import { parseInvoiceCsv, splitCsv } from "./csv";
import { matchInvoice, similar, type SysTx } from "./match";
import { isNonPurchase, parseInvoiceDate, parseMoney } from "./normalize";
import { parseOfx } from "./ofx";
import type { InvoiceLine } from "./types";

const REF = "2026-11-20";

describe("valores e datas de fatura", () => {
  it("aceita os formatos brasileiro, americano, negativo e entre parênteses", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("128,90")).toBe(12890);
    expect(parseMoney("1234.56")).toBe(123456);
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("R$ 45,9")).toBe(4590);
    expect(parseMoney("-3.500,00")).toBe(-350000);
    expect(parseMoney("(45,90)")).toBe(-4590);
    expect(parseMoney("45,90-")).toBe(-4590);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
  it("datas completas, curtas, ISO e sem ano (com virada de ano)", () => {
    expect(parseInvoiceDate("14/11/2026", REF)).toBe("2026-11-14");
    expect(parseInvoiceDate("14/11/26", REF)).toBe("2026-11-14");
    expect(parseInvoiceDate("2026-11-14", REF)).toBe("2026-11-14");
    expect(parseInvoiceDate("20261114", REF)).toBe("2026-11-14");
    expect(parseInvoiceDate("14/11", REF)).toBe("2026-11-14");
    expect(parseInvoiceDate("28/12", "2027-01-15")).toBe("2026-12-28"); // compra de dezembro numa fatura de janeiro
    expect(parseInvoiceDate("31/02/2026", REF)).toBeNull();
    expect(parseInvoiceDate("não é data", REF)).toBeNull();
  });
  it("pagamentos, totais e saldos não são compras", () => {
    for (const d of ["Pagamento recebido", "PAGAMENTO DE FATURA", "Total da fatura", "Saldo anterior", "Obrigado pelo pagamento"]) expect(isNonPurchase(d)).toBe(true);
    for (const d of ["Pagamento Cometa Supermercado", "Uber *Trip", "Anuidade diferenciada"]) expect(isNonPurchase(d)).toBe(false);
  });
});

describe("CSV da fatura", () => {
  it("formato Nubank (data,categoria,título,valor): tira o pagamento e separa a parcela", () => {
    const csv = `date,category,title,amount\n2026-11-05,restaurante,Cometa Supermercados,128.90\n2026-11-08,transporte,Uber *Trip,27.90\n2026-11-10,,Macbook - Parcela 11/12,1200.00\n2026-11-12,,Pagamento recebido,-3500.00\n2026-11-13,,Estorno Uber,-12.00\n`;
    const r = parseInvoiceCsv(csv, REF);
    expect(r.lines).toEqual([
      { date: "2026-11-05", description: "Cometa Supermercados", amount_cents: 12890, installment: null },
      { date: "2026-11-08", description: "Uber *Trip", amount_cents: 2790, installment: null },
      { date: "2026-11-10", description: "Macbook", amount_cents: 120000, installment: { n: 11, total: 12 } },
      { date: "2026-11-13", description: "Estorno Uber", amount_cents: -1200, installment: null },
    ]);
  });
  it("formato Itaú (ponto e vírgula, valor em BR, data sem ano)", () => {
    const csv = `data;lançamento;valor\n14/11;COMETA SUPERMERCADO;128,90\n15/11;MACBOOK 03/12;1.200,00\n`;
    const r = parseInvoiceCsv(csv, REF);
    expect(r.lines).toEqual([
      { date: "2026-11-14", description: "COMETA SUPERMERCADO", amount_cents: 12890, installment: null },
      { date: "2026-11-15", description: "MACBOOK", amount_cents: 120000, installment: { n: 3, total: 12 } },
    ]);
  });
  it("banco que mostra a compra como negativa: ajusta o sinal e avisa", () => {
    const csv = `Data;Descrição;Valor\n05/11/2026;Cometa;-128,90\n08/11/2026;Uber;-27,90\n09/11/2026;Estorno;12,00\n`;
    const r = parseInvoiceCsv(csv, REF);
    expect(r.lines.map((l) => l.amount_cents)).toEqual([12890, 2790, -1200]);
    expect(r.warnings.join(" ")).toContain("negativos");
  });
  it("sem cabeçalho: descobre as colunas pela cara dos dados", () => {
    const csv = `05/11/2026;COMETA SUPERMERCADOS;128,90\n08/11/2026;UBER TRIP;27,90\n`;
    expect(parseInvoiceCsv(csv, REF).lines).toHaveLength(2);
  });
  it("campos entre aspas com vírgula, BOM e linhas sem dados", () => {
    const csv = `﻿date,title,amount\n2026-11-05,"Loja, Centro",10.00\n2026-11-06,,5.00\nlinha solta,x,y\n`;
    const r = parseInvoiceCsv(csv, REF);
    expect(r.lines).toEqual([{ date: "2026-11-05", description: "Loja, Centro", amount_cents: 1000, installment: null }]);
    expect(r.warnings.join(" ")).toContain("ignorada");
    expect(splitCsv('a,"b,c",d\n', ",")).toEqual([["a", "b,c", "d"]]);
  });
  it("arquivo vazio ou sem colunas reconhecíveis vira aviso, não erro", () => {
    expect(parseInvoiceCsv("", REF).warnings[0]).toContain("vazio");
    expect(parseInvoiceCsv("a;b\nc;d\n", REF).lines).toEqual([]);
  });
});

describe("OFX", () => {
  const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105120000[-3:BRT]<TRNAMT>-128.90<FITID>1<MEMO>COMETA SUPERMERCADOS</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261108<TRNAMT>-27.90<FITID>2<NAME>UBER *TRIP</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261112<TRNAMT>3500.00<FITID>3<MEMO>Pagamento recebido</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  it("lê as transações, ajusta o sinal (compra negativa) e tira o pagamento", () => {
    const r = parseOfx(ofx, REF);
    expect(r.lines).toEqual([
      { date: "2026-11-05", description: "COMETA SUPERMERCADOS", amount_cents: 12890, installment: null },
      { date: "2026-11-08", description: "UBER *TRIP", amount_cents: 2790, installment: null },
    ]);
  });
  it("sem transações vira aviso", () => { expect(parseOfx("<OFX></OFX>", REF).warnings[0]).toContain("Não encontrei"); });
});

describe("leitura do PDF pela IA", () => {
  it("converte a resposta: estorno negativo, parcela, vencimento e linhas inválidas descartadas", () => {
    const r = parseInvoiceAnswer("```json\n" + JSON.stringify({
      due_date: "2026-11-20",
      lines: [
        { date: "2026-11-05", description: "COMETA SUPERMERCADOS", amount: 128.9, installment: null },
        { date: "2026-10-30", description: "MACBOOK", amount: 1200, installment: "11/12" },
        { date: "2026-11-09", description: "ESTORNO UBER", amount: -12 },
        { date: "data ruim", description: "X", amount: 5 },
        { date: "2026-11-10", description: "SEM VALOR", amount: 0 },
      ],
    }) + "\n```", REF);
    expect(r.lines).toEqual([
      { date: "2026-11-05", description: "COMETA SUPERMERCADOS", amount_cents: 12890, installment: null },
      { date: "2026-10-30", description: "MACBOOK", amount_cents: 120000, installment: { n: 11, total: 12 } },
      { date: "2026-11-09", description: "ESTORNO UBER", amount_cents: -1200, installment: null },
    ]);
    expect(r.dueDate).toBe("2026-11-20");
    expect(r.warnings[0]).toContain("descartadas");
  });
  it("resposta fora do formato é erro (nada é inventado)", () => {
    expect(() => parseInvoiceAnswer("Aqui estão as linhas...", REF)).toThrow();
    expect(() => parseInvoiceAnswer(JSON.stringify({ lines: [{ date: "2026-11-05" }] }), REF)).toThrow();
  });
});

// ---- cruzamento -------------------------------------------------------------------------------------------------------
const L = (date: string, description: string, cents: number, inst: [number, number] | null = null): InvoiceLine => ({ date, description, amount_cents: cents, installment: inst ? { n: inst[0], total: inst[1] } : null });
const T = (id: string, date: string, description: string, cents: number, inst: number | null = null): SysTx => ({ id, date, description, amount_cents: cents, installment_number: inst });

describe("descrição parecida", () => {
  it("o estabelecimento da fatura e o nome digitado", () => {
    expect(similar("UBER *TRIP", "Uber")).toBe(true);
    expect(similar("COMETA SUPERMERCADOS", "Cometa")).toBe(true);
    expect(similar("PAG*PostoIpiranga", "Posto Ipiranga")).toBe(true);
    expect(similar("COMETA", "Gasolina")).toBe(false);
    expect(similar("", "x")).toBe(false);
  });
});

describe("conferência da fatura: só as diferenças", () => {
  it("tudo lançado: nada a mostrar", () => {
    const r = matchInvoice([L("2026-11-05", "COMETA SUPERMERCADOS", 12890), L("2026-11-08", "UBER *TRIP", 2790)], [T("a", "2026-11-05", "Cometa", 12890), T("b", "2026-11-08", "Uber", 2790)]);
    expect(r.matched).toHaveLength(2);
    expect([r.amountDiff, r.missing, r.extra].map((x) => x.length)).toEqual([0, 0, 0]);
  });
  it("tolerância de ±3 dias na data", () => {
    const dentro = matchInvoice([L("2026-11-08", "UBER", 2790)], [T("a", "2026-11-05", "Uber", 2790)]);
    expect(dentro.matched).toHaveLength(1);
    const fora = matchInvoice([L("2026-11-09", "UBER", 2790)], [T("a", "2026-11-05", "Uber", 2790)]);
    expect(fora.matched).toHaveLength(0);
    expect(fora.missing).toHaveLength(1);
    expect(fora.extra).toHaveLength(1);
  });
  it("na fatura e não lançado (esquecido) / lançado e que não está na fatura", () => {
    const r = matchInvoice([L("2026-11-05", "COMETA", 12890), L("2026-11-12", "POSTO IPIRANGA", 25000)], [T("a", "2026-11-05", "Cometa", 12890), T("z", "2026-11-14", "Pizza", 8000)]);
    expect(r.missing.map((l) => l.description)).toEqual(["POSTO IPIRANGA"]);
    expect(r.extra.map((t) => t.id)).toEqual(["z"]);
  });
  it("valor diferente: descrição e data batem, valor não (digitei errado)", () => {
    const r = matchInvoice([L("2026-11-12", "POSTO IPIRANGA", 25000)], [T("g", "2026-11-12", "Posto Ipiranga", 20000)]);
    expect(r.amountDiff).toEqual([{ line: L("2026-11-12", "POSTO IPIRANGA", 25000), tx: T("g", "2026-11-12", "Posto Ipiranga", 20000) }]);
    expect(r.missing).toHaveLength(0);
    expect(r.extra).toHaveLength(0);
  });
  it("o nome digitado costuma diferir do estabelecimento: valor e data iguais bastam", () => {
    const r = matchInvoice([L("2026-11-12", "AUTO POSTO SAO JOAO LTDA", 25000)], [T("g", "2026-11-12", "Gasolina", 25000)]);
    expect(r.matched).toHaveLength(1);
  });
  it("dois gastos iguais no mesmo dia casam um com cada, sem usar o mesmo lançamento duas vezes", () => {
    const r = matchInvoice([L("2026-11-10", "UBER", 2000), L("2026-11-10", "UBER", 2000)], [T("a", "2026-11-10", "Uber", 2000)]);
    expect(r.matched).toHaveLength(1);
    expect(r.missing).toHaveLength(1); // o segundo não foi lançado
  });
  it("prefere o casamento mais forte quando há candidatos parecidos", () => {
    const r = matchInvoice([L("2026-11-10", "COMETA", 5000)], [T("longe", "2026-11-12", "Mercado", 5000), T("certo", "2026-11-10", "Cometa", 5000)]);
    expect(r.matched[0].tx.id).toBe("certo");
    expect(r.extra.map((t) => t.id)).toEqual(["longe"]);
  });
  it("parcela casa pelo número da parcela, sem olhar a data da compra", () => {
    const r = matchInvoice([L("2026-01-10", "MACBOOK", 120000, [11, 12])], [T("p", "2026-11-03", "MACBOOK", 120000, 11)]);
    expect(r.matched).toHaveLength(1);
    const errada = matchInvoice([L("2026-01-10", "MACBOOK", 120000, [11, 12])], [T("p", "2026-11-03", "MACBOOK", 120000, 10)]);
    expect(errada.matched).toHaveLength(0);
  });
  it("estorno (valor negativo) casa com a entrada lançada", () => {
    const r = matchInvoice([L("2026-11-13", "ESTORNO UBER", -1200)], [T("e", "2026-11-13", "Estorno Uber", -1200)]);
    expect(r.matched).toHaveLength(1);
  });
  it("fatura ou lançamentos vazios", () => {
    expect(matchInvoice([], [T("a", "2026-11-05", "x", 1)]).extra).toHaveLength(1);
    expect(matchInvoice([L("2026-11-05", "x", 1)], []).missing).toHaveLength(1);
  });
});
