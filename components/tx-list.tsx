import { centsToBRL } from "@/lib/format";
import { effCents, type HomeTx } from "@/lib/inicio";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Lista de lançamentos no mesmo formato da tela de Lançamentos (sem o botão de apagar). */
export function TxList({ txs }: { txs: HomeTx[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {txs.map((t) => (
        <li key={t.id} className="rounded-xl border border-line bg-surface p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium">
                {t.description}
                {t.installment && ` · ${t.installment}`}
              </div>
              <div className="text-sm text-muted">
                {dataBR(t.competence_date)} · {t.entity} · {t.method}
                {t.category ? ` · ${t.category}` : " · sem categoria"}
              </div>
              {t.needsReview && <div className="text-xs text-amber-300">Precisa de revisão</div>}
              {t.receiptPath && <a href={`/api/cupom?path=${encodeURIComponent(t.receiptPath)}`} target="_blank" rel="noreferrer" className="text-xs text-gold underline">Ver cupom</a>}
            </div>
            <div className={`shrink-0 font-semibold ${t.type === "income" ? "text-emerald-300" : ""}`}>
              {t.type === "income" ? "+" : "−"} {centsToBRL(effCents(t))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
