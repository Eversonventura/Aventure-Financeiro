import Link from "next/link";
import { FaturaUpload } from "@/components/fatura-upload";
import { ImportUpload } from "@/components/import-upload";
import { getCtx } from "@/lib/org";

const STATUS: Record<string, { label: string; cls: string }> = {
  mapping: { label: "Lendo o layout", cls: "bg-amber-400/10 text-amber-300" },
  ready: { label: "Aguardando conferência", cls: "bg-amber-400/10 text-amber-300" },
  importing: { label: "Importando", cls: "bg-amber-400/10 text-amber-300" },
  done: { label: "Importada", cls: "bg-emerald-500/10 text-emerald-300" },
  undone: { label: "Desfeita", cls: "bg-surface-2 text-muted" },
  failed: { label: "Falhou", cls: "bg-red-500/10 text-red-300" },
};

export default async function Page() {
  const { supabase } = await getCtx();
  const [{ data }, { data: cards }] = await Promise.all([
    supabase.from("imports").select("id, kind, status, original_name, created_at, stats").order("created_at", { ascending: false }).limit(30),
    supabase.from("payment_methods").select("id, name").eq("kind", "credit_card").eq("active", true).order("name"),
  ]);
  const rows = (data ?? []) as { id: string; kind: string; status: string; original_name: string | null; created_at: string; stats: { created?: number; duplicate?: number } | null }[];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Importações</h1>
      <ImportUpload />
      <FaturaUpload cards={(cards ?? []) as { id: string; name: string }[]} />
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Histórico</h2>
        {rows.length === 0 && <p className="text-muted">Nenhuma importação ainda.</p>}
        {rows.map((r) => {
          const st = STATUS[r.status] ?? STATUS.failed;
          return (
            <Link key={r.id} href={r.kind === "sheet" ? `/importacoes/${r.id}` : `/importacoes/fatura/${r.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 hover:bg-surface-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{r.kind === "sheet" ? "" : "Fatura · "}{r.original_name ?? "Planilha"}</div>
                <div className="text-xs text-muted">
                  {new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" })}
                  {r.status === "done" && r.stats?.created != null ? ` · ${r.stats.created} lançamentos` : ""}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs ${st.cls}`}>{st.label}</span>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
