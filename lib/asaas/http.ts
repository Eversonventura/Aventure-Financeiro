import { paymentSchema, type AsaasPayment } from "@/lib/asaas/types";

export class AsaasError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export type AsaasConfig = { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number };
export type AsaasCustomer = { id: string; name: string; cpfCnpj: string | null };

const PROD = "https://api.asaas.com/v3";

/** Cliente mínimo da API v3 do Asaas (autenticação pelo cabeçalho `access_token`). */
export function createAsaas(cfg: AsaasConfig) {
  const base = (cfg.baseUrl || PROD).replace(/\/$/, "");
  const doFetch = cfg.fetchImpl ?? fetch;

  async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
    let res: Response;
    try {
      res = await doFetch(`${base}${path}${q ? `?${q}` : ""}`, {
        headers: { access_token: cfg.apiKey, "content-type": "application/json", "user-agent": "aventure-financeiro" },
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 15_000),
      });
    } catch {
      throw new AsaasError("Não consegui falar com o Asaas (sem resposta).", 0);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { errors?: { description?: string }[] } | null;
      const msg = body?.errors?.[0]?.description ?? `Erro ${res.status} do Asaas.`;
      throw new AsaasError(res.status === 401 ? "Chave do Asaas recusada (401). Confira a ASAAS_API_KEY e se é de produção ou sandbox." : msg, res.status);
    }
    return (await res.json()) as T;
  }

  /** Saldo da conta: serve para testar a chave. */
  const getBalance = async () => Number((await get<{ balance?: number }>("/finance/balance")).balance ?? 0);

  async function paginate<T>(path: string, params: Record<string, string | number | undefined>, max: number): Promise<T[]> {
    const out: T[] = [];
    for (let offset = 0; out.length < max; offset += 100) {
      const page = await get<{ data?: T[]; hasMore?: boolean }>(path, { ...params, limit: 100, offset });
      out.push(...(page.data ?? []));
      if (!page.hasMore || (page.data?.length ?? 0) === 0) break;
    }
    return out.slice(0, max);
  }

  /** Cobranças com vencimento no intervalo (AAAA-MM-DD). Itens fora do formato esperado são ignorados. */
  async function listPayments(dueFrom: string, dueTo: string, max = 1000): Promise<AsaasPayment[]> {
    const raw = await paginate<unknown>("/payments", { "dueDate[ge]": dueFrom, "dueDate[le]": dueTo }, max);
    return raw.flatMap((r) => { const p = paymentSchema.safeParse(r); return p.success ? [p.data] : []; });
  }

  async function listCustomers(max = 300): Promise<AsaasCustomer[]> {
    const raw = await paginate<{ id?: string; name?: string; cpfCnpj?: string | null }>("/customers", {}, max);
    return raw.flatMap((c) => (c.id && c.name ? [{ id: c.id, name: c.name, cpfCnpj: c.cpfCnpj ?? null }] : []));
  }

  return { getBalance, listPayments, listCustomers };
}
export type Asaas = ReturnType<typeof createAsaas>;
