import Link from "next/link";
import { notFound } from "next/navigation";
import { todayFortaleza } from "@/lib/dates";
import { centsToBRL } from "@/lib/format";
import { getCtx } from "@/lib/org";
import { loadPlanContext } from "@/lib/sheet/context";
import { extract } from "@/lib/sheet/extract";
import { REGION_KINDS, type Layout } from "@/lib/sheet/layout";
import { buildPlan, type Plan } from "@/lib/sheet/plan";
import { colLetter, readWorkbook } from "@/lib/sheet/read";
import { confirmImport, retryMapping, saveLayout, undoImportAction } from "../actions";

type Imp = { id: string; status: string; original_name: string | null; layout: Layout | null; file_path: string; stats: Record<string, unknown> | null };

const input = "rounded-lg border border-line-strong bg-surface-2 px-2 py-2 text-sm text-ink";

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="font-heading text-2xl font-bold">{n}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams]);
  const { supabase } = await getCtx();
  const { data } = await supabase.from("imports").select("id, status, original_name, layout, file_path, stats").eq("id", id).maybeSingle();
  if (!data) notFound();
  const imp = data as Imp;
  const stats = (imp.stats ?? {}) as Record<string, unknown>;

  const head = (
    <>
      <Link href="/importacoes" className="text-sm text-muted">← Importações</Link>
      <h1 className="text-2xl font-semibold">{imp.original_name ?? "Planilha"}</h1>
      {erro && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-red-300">{erro}</p>}
    </>
  );

  if (imp.status === "failed" || imp.status === "mapping") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {head}
        <p className="rounded-xl bg-red-500/10 p-4 text-red-300">{(stats.error as string) ?? "A leitura do layout não terminou."}</p>
        <form action={retryMapping}>
          <input type="hidden" name="id" value={imp.id} />
          <button className="rounded-xl bg-gold px-5 py-3 font-semibold text-canvas">Tentar ler o layout de novo</button>
        </form>
      </div>
    );
  }

  if (imp.status === "done" || imp.status === "undone") {
    const reasons = (stats.ignoredReasons ?? {}) as Record<string, number>;
    const warnings = (stats.warnings ?? []) as string[];
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {head}
        {imp.status === "undone" ? (
          <p className="rounded-xl bg-surface p-4 text-muted">Esta importação foi desfeita: tudo que ela criou foi apagado.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat n={Number(stats.created ?? 0)} label="lançamentos criados" />
              <Stat n={Number(stats.duplicate ?? 0)} label="duplicados ignorados" />
              <Stat n={Number(stats.ignored ?? 0)} label="linhas ignoradas" />
              <Stat n={Number(stats.groups ?? 0)} label="compras parceladas (grupos)" />
              <Stat n={Number(stats.rules ?? 0)} label="recorrências criadas" />
              <Stat n={Number(stats.created ?? 0)} label="para revisar (sem categoria)" />
            </div>
            {Object.keys(reasons).length > 0 && (
              <ul className="rounded-xl bg-surface p-4 text-sm text-muted">
                {Object.entries(reasons).map(([k, v]) => <li key={k}>{v} × {k}</li>)}
              </ul>
            )}
            {warnings.map((w) => <p key={w} className="rounded-lg bg-amber-400/10 p-3 text-sm text-amber-300">{w}</p>)}
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/lancamentos?revisao=1" className="rounded-xl bg-gold px-5 py-3 font-semibold text-canvas">Revisar lançamentos</Link>
              <form action={undoImportAction}>
                <input type="hidden" name="id" value={imp.id} />
                <button className="text-sm text-red-400 underline">Desfazer esta importação</button>
              </form>
            </div>
          </>
        )}
      </div>
    );
  }

  // ready: conferência do mapa + prévia
  const layout = imp.layout ?? { regions: [] };
  let plan: Plan | null = null;
  let previewError = "";
  try {
    const file = await supabase.storage.from("imports").download(imp.file_path);
    if (file.error || !file.data) throw new Error("arquivo");
    const grids = await readWorkbook(await file.data.arrayBuffer());
    const ex = extract(grids, layout);
    plan = buildPlan(ex.items, ex.ignored, await loadPlanContext(supabase, todayFortaleza()));
    plan.warnings.unshift(...ex.warnings);
  } catch {
    previewError = "Não foi possível montar a prévia. Confira o mapa e tente de novo.";
  }
  const { data: methods } = await supabase.from("payment_methods").select("id, name").eq("active", true).order("name");
  const warnings = (stats.warnings ?? []) as string[];
  const reasons: Record<string, number> = {};
  for (const i of plan?.ignored ?? []) reasons[i.reason] = (reasons[i.reason] ?? 0) + 1;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {head}
      <p className="text-muted">O Claude leu a planilha e montou o mapa abaixo. Confira o tipo, o mês e o cartão de cada bloco antes de importar. Nada foi gravado ainda.</p>
      {warnings.map((w) => <p key={w} className="rounded-lg bg-amber-400/10 p-3 text-sm text-amber-300">{w}</p>)}

      <form className="flex flex-col gap-4">
        <input type="hidden" name="id" value={imp.id} />
        <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="p-3">Bloco</th><th>Tipo</th><th>Mês</th><th>Cartão</th><th className="pr-3">Onde</th></tr></thead>
            <tbody>
              {layout.regions.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="p-3"><div className="font-medium">{r.label || r.id}</div><div className="text-xs text-muted">aba {r.sheet}</div></td>
                  <td className="py-2 pr-2">
                    <select name={`r:${r.id}:kind`} defaultValue={r.kind} className={input}>
                      {Object.entries(REGION_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2"><input type="month" name={`r:${r.id}:month`} defaultValue={r.month ?? ""} className={input} /></td>
                  <td className="py-2 pr-2">
                    <select name={`r:${r.id}:card`} defaultValue={r.cardId ?? ""} className={`${input} ${r.kind === "card_purchases" && !r.cardId ? "border-red-400" : ""}`}>
                      <option value="">—</option>
                      {(methods ?? []).map((m) => <option key={m.id as string} value={m.id as string}>{m.name as string}</option>)}
                    </select>
                    {r.kind === "card_purchases" && !r.cardId && <div className="mt-1 text-xs text-red-300">escolha o cartão ({r.card ?? "?"})</div>}
                  </td>
                  <td className="pr-3 py-2 text-xs text-muted">linhas {r.firstRow}–{r.lastRow} · valor {colLetter(r.valueCol)} · descrição {colLetter(r.descriptionCol)}{r.dateCol ? ` · dia ${colLetter(r.dateCol)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {layout.regions.length === 0 && <p className="p-4 text-muted">O Claude não encontrou blocos de dados nesta planilha.</p>}
        </div>

        {previewError && <p className="rounded-lg bg-red-500/10 p-3 text-red-300">{previewError}</p>}
        {plan && (
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">Prévia</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat n={plan.txs.length} label="lançamentos a criar" />
              <Stat n={plan.stats.duplicate} label="duplicados (já existem)" />
              <Stat n={plan.groups.length} label="compras parceladas" />
              <Stat n={plan.rules.length} label="recorrências" />
              <Stat n={plan.ignored.length} label="linhas ignoradas" />
            </div>
            {plan.groups.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
                <div className="mb-1 font-medium">Parceladas (um grupo por compra, com todas as parcelas)</div>
                <ul className="text-muted">{plan.groups.map((g) => <li key={g.id}>{g.description} · {g.installments}x de {centsToBRL(g.installment_cents)} · 1ª fatura {g.first_invoice_month.slice(5, 7)}/{g.first_invoice_month.slice(0, 4)}</li>)}</ul>
              </div>
            )}
            {plan.rules.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
                <div className="mb-1 font-medium">Recorrências detectadas (assinaturas e contas fixas)</div>
                <ul className="text-muted">{plan.rules.map((r) => <li key={r.id}>{r.description} · {centsToBRL(r.amount_cents)} · {r.direction === "in" ? "entrada" : "saída"} · dia {r.day_of_month}</li>)}</ul>
              </div>
            )}
            {Object.keys(reasons).length > 0 && (
              <ul className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
                {Object.entries(reasons).map(([k, v]) => <li key={k}>{v} × {k}</li>)}
              </ul>
            )}
            {plan.warnings.map((w) => <p key={w} className="rounded-lg bg-amber-400/10 p-3 text-sm text-amber-300">{w}</p>)}
            <p className="text-xs text-muted">A planilha não traz a data da compra no cartão: o sistema usa o meio do período da fatura. Tudo entra na fila de revisão, sem categoria.</p>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <button formAction={saveLayout} className="rounded-xl border border-line-strong px-5 py-3 hover:bg-surface">Atualizar prévia</button>
          <button formAction={confirmImport} disabled={!plan || plan.txs.length === 0} className="rounded-xl bg-gold px-6 py-3 font-semibold text-canvas hover:brightness-110 disabled:opacity-50">
            Importar {plan ? `${plan.txs.length} lançamentos` : ""}
          </button>
        </div>
      </form>
    </div>
  );
}
