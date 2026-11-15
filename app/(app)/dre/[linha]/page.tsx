import Link from "next/link";
import { notFound } from "next/navigation";
import { monthTitle, monthStart, todayFortaleza } from "@/lib/dates";
import { loadDrill } from "@/lib/dre-drill";
import { centsToBRL } from "@/lib/format";
import { getCtx } from "@/lib/org";

export default async function Page({ params, searchParams }: { params: Promise<{ linha: string }>; searchParams: Promise<{ mes?: string }> }) {
  const [{ linha }, sp] = await Promise.all([params, searchParams]);
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : monthStart(todayFortaleza());
  const { supabase } = await getCtx();
  const { data: st } = await supabase.from("org_settings").select("simples_effective_rate").maybeSingle();
  const d = await loadDrill(supabase, linha, mes, st?.simples_effective_rate != null ? Number(st.simples_effective_rate) : null);
  if (!d.known) notFound();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link href={`/dre?mes=${mes.slice(0, 7)}`} className="text-sm text-muted">← DRE</Link>
      <div>
        <h1 className="text-2xl font-semibold">{d.title}</h1>
        <p className="text-muted">{monthTitle(mes)} · {d.items.length} lançamento(s) · total {centsToBRL(d.total)}</p>
      </div>
      {d.notes.map((n) => <p key={n} className="rounded-xl bg-surface p-3 text-sm text-muted">{n}</p>)}
      {d.items.length === 0 ? <p className="text-muted">Nenhum lançamento nesta linha no mês.</p> : (
        <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-muted"><th className="p-3 font-normal">Data</th><th className="font-normal">Descrição</th><th className="font-normal">Categoria</th><th className="font-normal">Meio</th><th className="p-3 text-right font-normal">Valor</th></tr></thead>
            <tbody>
              {d.items.map((i, idx) => (
                <tr key={`${i.id}-${idx}`} className="border-t border-line">
                  <td className="p-3 whitespace-nowrap">{i.date.slice(8, 10)}/{i.date.slice(5, 7)}</td>
                  <td className="pr-3"><div>{i.description}</div>{i.note && <div className="text-xs text-muted">{i.note}</div>}<div className="text-xs text-muted">{i.entity}</div></td>
                  <td className="pr-3 text-muted">{i.category}</td>
                  <td className="pr-3 text-muted">{i.method}</td>
                  <td className={`p-3 text-right font-medium ${i.cents < 0 ? "text-emerald-300" : ""}`}>{centsToBRL(i.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
