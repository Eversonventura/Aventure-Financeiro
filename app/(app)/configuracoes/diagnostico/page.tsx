import Link from "next/link";
import { ENV_CHECKS, isMissing, MIGRATIONS, type MigrationCheck } from "@/lib/diagnostico";
import { getCtx } from "@/lib/org";

type Status = "ok" | "warn" | "fail";
const DOT: Record<Status, string> = { ok: "bg-emerald-400", warn: "bg-amber-400", fail: "bg-red-400" };

function Row({ s, title, sub, href }: { s: Status; title: string; sub?: string; href?: string }) {
  const inner = (
    <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-sm">
      <span className={`mt-1 size-3 shrink-0 rounded-full ${DOT[s]}`} aria-hidden />
      <div><div className="font-medium">{title}</div>{sub && <div className="text-muted">{sub}</div>}</div>
    </div>
  );
  return <li>{href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner}</li>;
}

export default async function Page() {
  const { supabase } = await getCtx();

  // migrations: confere uma coisa que cada uma criou
  const probe = async (m: MigrationCheck): Promise<Status> => {
    if (m.probe === "manual") return "warn";
    const [name, col] = m.detail.split(".");
    if (m.probe === "rpc") {
      const { error } = await supabase.rpc(name, { p_id: "00000000-0000-0000-0000-000000000000" });
      return isMissing(error) ? "fail" : "ok";
    }
    const { error } = await supabase.from(name).select(col ?? "id").limit(1);
    return isMissing(error) ? "fail" : "ok";
  };

  const [migrations, rate, cards, review, pj, clientsUnlinked] = await Promise.all([
    Promise.all(MIGRATIONS.map(async (m) => ({ m, s: await probe(m) }))),
    supabase.from("org_settings").select("simples_effective_rate, opening_balance_date").maybeSingle(),
    supabase.from("payment_methods").select("id, name").eq("kind", "credit_card").eq("active", true).or("closing_day.is.null,due_day.is.null"),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("needs_review", true),
    supabase.from("entities").select("id").eq("kind", "pj").limit(1),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("active", true).is("asaas_customer_id", null),
  ]);

  const faltam = migrations.filter((x) => x.s === "fail");
  const cfg = rate.data as { simples_effective_rate: number | null; opening_balance_date: string | null } | null;
  const cartoesSemDia = (cards.data ?? []) as { id: string; name: string }[];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/configuracoes" className="text-sm text-muted">← Configurações</Link>
      <div>
        <h1 className="text-2xl font-semibold">Diagnóstico</h1>
        <p className="text-sm text-muted">Confere se o sistema está completo: chaves, migrations e configurações que faltam. Só mostra se cada item existe, nunca o valor das chaves.</p>
      </div>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Chaves na Vercel</h2>
        <ul className="flex flex-col gap-2">
          {ENV_CHECKS.map((e) => {
            const ok = Boolean(process.env[e.name]);
            return <Row key={e.name} s={ok ? "ok" : e.required ? "fail" : "warn"} title={`${e.label} (${e.name})`} sub={ok ? undefined : `${e.required ? "Obrigatória. " : "Opcional. "}${e.why}`} />;
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Migrations do banco</h2>
        {faltam.length > 0 && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">Faltam {faltam.length} migration(s). Rode no SQL Editor do Supabase, uma vez cada e nesta ordem: {faltam.map((x) => x.m.file).join(", ")}.</p>}
        <ul className="flex flex-col gap-2">
          {migrations.map(({ m, s }) => (
            <Row key={m.file} s={s} title={m.title} sub={s === "fail" ? `Não aplicada: ${m.file}.sql` : s === "warn" ? `${m.file}.sql — ${m.detail}. Se você já rodou, está certo.` : undefined} />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Configurações que faltam</h2>
        <ul className="flex flex-col gap-2">
          <Row s={(pj.data ?? []).length > 0 ? "ok" : "fail"} title="Entidade da empresa (PJ)" sub={(pj.data ?? []).length > 0 ? undefined : "Sem ela o DRE não funciona. Cadastre em Configurações → Entidades."} href="/configuracoes/entidades" />
          <Row s={cfg?.simples_effective_rate != null ? "ok" : "warn"} title="Alíquota efetiva do Simples" sub={cfg?.simples_effective_rate != null ? undefined : "Sem ela a linha do DAS no DRE fica zerada. Confirme com a contadora."} href="/configuracoes/geral" />
          <Row s={cfg?.opening_balance_date ? "ok" : "warn"} title="Saldo em contas (ponto de partida do fluxo de caixa)" sub={cfg?.opening_balance_date ? undefined : "Sem ele o fluxo de caixa parte de zero."} href="/configuracoes/geral" />
          <Row s={cartoesSemDia.length === 0 ? "ok" : "warn"} title="Fechamento e vencimento dos cartões" sub={cartoesSemDia.length === 0 ? undefined : `Faltam em: ${cartoesSemDia.map((c) => c.name).join(", ")}. Sem eles não dá para lançar no cartão.`} href="/configuracoes/meios" />
          <Row s={(review.count ?? 0) === 0 ? "ok" : "warn"} title="Fila de revisão" sub={(review.count ?? 0) === 0 ? "Zerada." : `${review.count} lançamento(s) sem classificação. Eles não entram no DRE.`} href="/revisao" />
          <Row s={(clientsUnlinked.count ?? 0) === 0 ? "ok" : "warn"} title="Clientes ligados ao Asaas" sub={(clientsUnlinked.count ?? 0) === 0 ? undefined : `${clientsUnlinked.count} cliente(s) sem ligação: a baixa automática não os acha.`} href="/configuracoes/asaas" />
        </ul>
      </section>
    </div>
  );
}
