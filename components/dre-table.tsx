import Link from "next/link";
import { centsToBRL } from "@/lib/format";
import type { DreMonth, DreTableRow } from "@/lib/dre";

export const pctTxt = (n: number | null) => (n == null ? "—" : `${n.toString().replace(".", ",")}%`);

/** Tabela do DRE: mês escolhido, % da receita, mês anterior, variação e média de 3 meses. Clicar numa linha abre os lançamentos. */
export function DreTable({ rows, cur, prev, mes }: { rows: DreTableRow[]; cur: DreMonth; prev: DreMonth; mes: string }) {
  return (
      <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-right text-muted">
              <th className="sticky left-0 bg-surface p-3 text-left font-normal">Linha</th>
              <th className="p-3 font-medium text-ink">{cur.label}</th>
              <th className="p-3 font-normal">% da receita</th>
              <th className="p-3 font-normal">{prev.label}</th>
              <th className="p-3 font-normal">Variação</th>
              <th className="p-3 font-normal">Média 3 meses</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-t border-line text-right ${r.subtotal ? "bg-surface-2 font-semibold" : ""}`}>
                <td className={`sticky left-0 min-w-44 p-3 text-left ${r.subtotal ? "bg-surface-2" : "bg-surface"}`}>
                  {r.drill ? (
                    <Link href={`/dre/${r.drill}?mes=${mes}`} className="hover:underline">{r.label}</Link>
                  ) : r.label}
                  {r.key === "das" && cur.dasKind !== "pago" && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-normal text-muted">{cur.dasKind === "previsto" ? "previsto" : "sem alíquota"}</span>}
                </td>
                <td className={`p-3 whitespace-nowrap ${r.value < 0 ? "text-red-400" : ""}`}>{centsToBRL(r.value)}</td>
                <td className="p-3 whitespace-nowrap text-muted">{pctTxt(r.pct)}</td>
                <td className="p-3 whitespace-nowrap text-muted">{centsToBRL(r.prev)}</td>
                <td className="p-3 whitespace-nowrap text-muted">{pctTxt(r.vsPrev)}</td>
                <td className="p-3 whitespace-nowrap text-muted">{centsToBRL(r.avg3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

  );
}
