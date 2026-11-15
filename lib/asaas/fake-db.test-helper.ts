/* eslint-disable @typescript-eslint/no-explicit-any */
// Banco em memória que imita só o que a integração usa do supabase-js (filtros, insert, update, upsert, delete),
// com as mesmas chaves únicas das tabelas. Só para testes.
type Row = Record<string, any>;

export function fakeSupabase(seed: Record<string, Row[]>, unique: Record<string, string[][]> = {}) {
  const db: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const failures: { table: string; op: string; message: string }[] = [];
  let nextId = 1;

  function from(table: string) {
    const all = () => (db[table] ??= []);
    let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    const filters: ((r: Row) => boolean)[] = [];
    let payload: any;
    let opts: any = {};
    let single = false;
    let lim: number | undefined;

    const conflict = (row: Row, cols: string[]) => all().find((r) => cols.every((c) => r[c] === row[c] && row[c] != null));
    const violates = (row: Row) => (unique[table] ?? []).some((cols) => conflict(row, cols));

    function run(): { data: any; error: any } {
      const f = failures.findIndex((x) => x.table === table && x.op === op);
      if (f >= 0) { const [x] = failures.splice(f, 1); return { data: null, error: { code: "XX000", message: x.message } }; }
      const match = () => all().filter((r) => filters.every((fn) => fn(r)));
      if (op === "select") { const rows = match().slice(0, lim); return { data: single ? rows[0] ?? null : rows, error: null }; }
      if (op === "delete") { const gone = new Set(match()); db[table] = all().filter((r) => !gone.has(r)); return { data: null, error: null }; }
      if (op === "update") { match().forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
      const list: Row[] = Array.isArray(payload) ? payload : [payload];
      for (const raw of list) {
        const row = { id: raw.id ?? `${table}-${nextId++}`, ...raw };
        if (op === "insert") {
          if (violates(row)) return { data: null, error: { code: "23505", message: "duplicate key" } };
          all().push(row);
        } else {
          const cols = String(opts.onConflict ?? "id").split(",");
          const existing = conflict(row, cols);
          if (existing) { if (!opts.ignoreDuplicates) Object.assign(existing, raw); } else all().push(row);
        }
      }
      return { data: null, error: null };
    }

    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), api),
      neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), api),
      in: (c: string, v: any[]) => (filters.push((r) => v.includes(r[c])), api),
      ilike: (c: string, pat: string) => { const re = new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i"); filters.push((r) => re.test(String(r[c] ?? ""))); return api; },
      limit: (n: number) => ((lim = n), api),
      order: () => api,
      insert: (p: any) => ((op = "insert"), (payload = p), api),
      update: (p: any) => ((op = "update"), (payload = p), api),
      upsert: (p: any, o: any) => ((op = "upsert"), (payload = p), (opts = o ?? {}), api),
      delete: () => ((op = "delete"), api),
      maybeSingle: () => ((single = true), api),
      single: () => ((single = true), api),
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  }
  return { client: { from } as any, db, failNext: (table: string, op: string, message = "falha simulada") => failures.push({ table, op, message }) };
}
