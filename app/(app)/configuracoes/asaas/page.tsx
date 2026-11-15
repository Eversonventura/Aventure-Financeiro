import { headers } from "next/headers";
import Link from "next/link";
import { asaasFromEnv, hasAsaasKey, hasWebhookToken } from "@/lib/asaas/client";
import type { AsaasCustomer } from "@/lib/asaas/http";
import { centsToBRL } from "@/lib/format";
import { getCtx } from "@/lib/org";
import { norm } from "@/lib/sheet/extract";
import { linkClient, syncNow, testConnection } from "./actions";

const sel = "min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-2 px-2 py-2 text-sm text-ink";

function Check({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-sm">
      <span className={`mt-0.5 size-4 shrink-0 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} aria-hidden />
      <div><div className="font-medium">{label} <span className="font-normal text-muted">— {ok ? "configurada" : "faltando"}</span></div>{!ok && hint && <div className="text-muted">{hint}</div>}</div>
    </li>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string; saldo?: string; sync?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await getCtx();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "seu-dominio";
  const webhookUrl = `https://${host}/api/webhooks/asaas`;

  const [clientsRes, eventsRes] = await Promise.all([
    supabase.from("clients").select("id, name, asaas_customer_id").eq("active", true).order("name"),
    supabase.from("asaas_events").select("id, event, payment_id, result, detail, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const clients = (clientsRes.data ?? []) as { id: string; name: string; asaas_customer_id: string | null }[];
  const events = (eventsRes.data ?? []) as { id: string; event: string; payment_id: string | null; result: string; detail: string | null; created_at: string }[];

  let customers: AsaasCustomer[] = [];
  let customersError = "";
  if (hasAsaasKey()) {
    try { customers = await asaasFromEnv().listCustomers(); } catch (e) { customersError = e instanceof Error ? e.message : "Não foi possível listar os clientes do Asaas."; }
  }
  const sync = sp.sync?.split(",").map(Number);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/configuracoes" className="text-sm text-muted">← Configurações</Link>
      <div>
        <h1 className="text-2xl font-semibold">Integração com o Asaas</h1>
        <p className="text-sm text-muted">Quando o cliente paga, a mensalidade é baixada sozinha. Todo dia o sistema também confere as cobranças dos últimos 45 dias.</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-red-300">{sp.erro}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-emerald-300">Salvo.</p>}
      {sp.saldo && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-emerald-300">Conexão ok. Saldo da conta Asaas: <strong>{centsToBRL(Number(sp.saldo))}</strong>.</p>}
      {sync && sync.length === 5 && (
        <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-emerald-300">
          Sincronizado: {sync[0]} cobranças vistas, {sync[1]} pagas, {sync[2]} baixadas agora, {sync[3]} já estavam em dia{sync[4] ? `, ${sync[4]} com erro` : ""}.
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-semibold">1. Chaves na Vercel</h2>
        <ul className="flex flex-col gap-2">
          <Check ok={hasAsaasKey()} label="ASAAS_API_KEY" hint="No Asaas: Integrações → Chaves de API. Cadastre em Vercel → Settings → Environment Variables (nunca no chat)." />
          <Check ok={hasWebhookToken()} label="ASAAS_WEBHOOK_TOKEN" hint="Invente uma senha longa (32+ caracteres) e use a mesma aqui e no webhook do Asaas." />
        </ul>
        <p className="text-xs text-muted">Para testar antes em produção, use o sandbox do Asaas: cadastre também <code>ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3</code> com a chave do sandbox.</p>
        <form action={testConnection}><button className="rounded-xl border border-line-strong px-4 py-2.5 text-sm hover:bg-surface-2">Testar conexão</button></form>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-semibold">2. Webhook no Asaas</h2>
        <ol className="list-decimal pl-5 text-sm text-muted">
          <li>No Asaas, abra Integrações → Webhooks → Novo webhook (cobranças).</li>
          <li>URL: <code className="break-all text-ink">{webhookUrl}</code></li>
          <li>Token de autenticação: o mesmo valor da <code>ASAAS_WEBHOOK_TOKEN</code>.</li>
          <li>Marque os eventos de pagamento: recebida, confirmada e estornada. Fila de envio ativa.</li>
        </ol>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-semibold">3. Ligar os clientes</h2>
        <p className="text-sm text-muted">Cada cliente daqui precisa estar ligado ao cliente do Asaas, para a baixa achar a mensalidade certa.</p>
        {customersError && <p className="rounded-lg bg-amber-400/10 p-3 text-sm text-amber-300">{customersError}</p>}
        {clients.length === 0 && <p className="text-muted">Cadastre clientes em <Link href="/clientes" className="underline">Clientes</Link>.</p>}
        <ul className="flex flex-col gap-2">
          {clients.map((c) => {
            const guess = customers.find((x) => norm(x.name) === norm(c.name))?.id ?? "";
            const current = c.asaas_customer_id ?? guess;
            return (
              <li key={c.id} className="rounded-xl bg-surface-2 p-3">
                <form action={linkClient} className="flex flex-col gap-2 md:flex-row md:items-center">
                  <input type="hidden" name="client" value={c.id} />
                  <div className="min-w-0 md:w-48"><div className="truncate font-medium">{c.name}</div>{c.asaas_customer_id ? <div className="text-xs text-emerald-300">ligado</div> : guess ? <div className="text-xs text-amber-300">sugestão pelo nome</div> : <div className="text-xs text-muted">não ligado</div>}</div>
                  {customers.length > 0 ? (
                    <select name="asaas" defaultValue={current} className={sel}>
                      <option value="">— sem ligação —</option>
                      {customers.map((x) => <option key={x.id} value={x.id}>{x.name}{x.cpfCnpj ? ` · ${x.cpfCnpj}` : ""}</option>)}
                    </select>
                  ) : (
                    <input name="asaas" defaultValue={c.asaas_customer_id ?? ""} placeholder="cus_…" className={sel} />
                  )}
                  <button className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-canvas">Salvar</button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-semibold">4. Sincronizar agora</h2>
        <p className="text-sm text-muted">Confere as cobranças dos últimos 45 dias e dos próximos 30 e baixa as pagas. Pode rodar quantas vezes quiser: não duplica.</p>
        <form action={syncNow}><button className="rounded-xl bg-gold px-5 py-3 font-semibold text-canvas hover:brightness-110">Sincronizar cobranças</button></form>
      </section>

      <section className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Últimos eventos</h2>
        {events.length === 0 && <p className="text-sm text-muted">Nenhum evento recebido ainda.</p>}
        <ul className="divide-y divide-line text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{e.event}</span>
                <span className={e.result === "done" ? "text-emerald-300" : e.result === "error" ? "text-red-300" : "text-muted"}>{e.result}</span>
              </div>
              <div className="text-xs text-muted">{new Date(e.created_at).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" })}{e.payment_id ? ` · ${e.payment_id}` : ""}{e.detail ? ` · ${e.detail}` : ""}</div>
            </li>
          ))}
        </ul>
      </section>

      <p className="rounded-xl bg-surface p-4 text-sm text-muted">
        <strong className="text-ink">Cartão da Aventure no Asaas:</strong> ainda não confirmei se a API do Asaas expõe as transações do cartão PJ. Até confirmar, a fatura desse cartão entra por importação de PDF ou CSV.
      </p>
    </div>
  );
}
