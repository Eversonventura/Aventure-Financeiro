import { InicioView } from "@/components/inicio-view";
import { diffDays, monthStart, todayFortaleza } from "@/lib/dates";
import { loadContasDoMes } from "@/lib/contas";
import { getCtx } from "@/lib/org";

export default async function Page() {
  const { supabase } = await getCtx();
  const hoje = todayFortaleza();
  const mes = monthStart(hoje);
  const [c, { count: revisar }] = await Promise.all([
    loadContasDoMes(supabase, mes, hoje),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("needs_review", true),
  ]);
  return (
    <InicioView
      mes={mes} aPagar={c.aPagar} aReceber={c.aReceber} pagoCents={c.pagoCents} recebidoCents={c.recebidoCents}
      atrasadas={c.atrasadas} revisar={revisar ?? 0}
      proximas={c.contas.filter((x) => !x.paid && diffDays(hoje, x.due) <= 7).slice(0, 5)}
    />
  );
}
