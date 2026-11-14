// Dinheiro sempre em centavos inteiros. Nunca float para valores.

/** "1.234,56" | "300" | "R$ 49,9" -> centavos. Vazio -> null. Inválido -> NaN. */
export function brlToCents(input: string | null | undefined): number | null {
  const s = (input ?? "").replace(/R\$|\s/g, "");
  if (s === "") return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return NaN;
  const [inteiro, dec = ""] = s.replace(/\./g, "").split(",");
  return Number(inteiro) * 100 + Number(dec.padEnd(2, "0"));
}

export function centsToBRL(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const neg = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg}R$ ${reais},${String(abs % 100).padStart(2, "0")}`;
}

/** centavos -> texto para campo de formulário ("300,00"). */
export function centsToInput(cents: number | null | undefined): string {
  return cents == null ? "" : centsToBRL(cents).replace("R$ ", "");
}

/** "30" | "30,5" -> 30 | 30.5. Vazio -> null. Inválido -> NaN. */
export function parsePercent(input: string | null | undefined): number | null {
  const s = (input ?? "").replace(/[%\s]/g, "");
  if (s === "") return null;
  if (!/^\d+(,\d{1,4})?$/.test(s)) return NaN;
  return Number(s.replace(",", "."));
}

export function percentToInput(n: number | null | undefined): string {
  return n == null ? "" : String(n).replace(".", ",");
}
