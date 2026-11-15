"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayFortaleza } from "@/lib/dates";
import { classifyPlan } from "@/lib/classify/plan";
import { classifyItems } from "@/lib/classify/server";
import { getCtx } from "@/lib/org";
import { mapLayout } from "@/lib/sheet/ai-layout";
import { hasAnthropicKey, sonnetComplete } from "@/lib/sheet/anthropic";
import { applyPlan, undoImport } from "@/lib/sheet/apply";
import { loadPlanContext } from "@/lib/sheet/context";
import { extract } from "@/lib/sheet/extract";
import { layoutSchema, REGION_KINDS, sanitizeLayout, type Layout, type RegionKind } from "@/lib/sheet/layout";
import { buildPlan } from "@/lib/sheet/plan";
import { readWorkbook } from "@/lib/sheet/read";

type Ctx = Awaited<ReturnType<typeof getCtx>>;

const to = (id: string, erro?: string): never => {
  revalidatePath(`/importacoes/${id}`);
  revalidatePath("/importacoes");
  redirect(`/importacoes/${id}${erro ? `?erro=${encodeURIComponent(erro)}` : ""}`);
};

async function loadImport(c: Ctx, id: string) {
  const { data } = await c.supabase.from("imports").select("*").eq("id", id).maybeSingle();
  return data as { id: string; file_path: string; status: string; layout: Layout | null; stats: Record<string, unknown> | null } | null;
}

/** Aplica no mapa as escolhas da conferência (tipo, mês e cartão de cada bloco). */
function applyEdits(layout: Layout, fd: FormData): Layout {
  return {
    ...layout,
    regions: layout.regions.map((r) => {
      const kind = String(fd.get(`r:${r.id}:kind`) ?? r.kind) as RegionKind;
      const month = String(fd.get(`r:${r.id}:month`) ?? r.month ?? "");
      const cardId = String(fd.get(`r:${r.id}:card`) ?? r.cardId ?? "");
      return { ...r, kind: kind in REGION_KINDS ? kind : r.kind, month: /^\d{4}-\d{2}$/.test(month) ? month : null, cardId: cardId || null };
    }),
  };
}

async function persistLayout(c: Ctx, id: string, fd: FormData): Promise<Layout> {
  const imp = await loadImport(c, id);
  if (!imp?.layout) return to(id, "Esta importação ainda não tem mapa.");
  const edited = layoutSchema.safeParse(applyEdits(imp.layout, fd));
  if (!edited.success) return to(id, "Alguma escolha do mapa é inválida.");
  await c.supabase.from("imports").update({ layout: edited.data }).eq("id", id);
  return edited.data;
}

export async function saveLayout(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const c = await getCtx();
  await persistLayout(c, id, fd);
  to(id);
}

export async function confirmImport(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const c = await getCtx();
  const layout = await persistLayout(c, id, fd);
  const imp = await loadImport(c, id);
  if (!imp || (imp.status !== "ready" && imp.status !== "mapping")) return to(id, "Esta importação não está pronta.");

  await c.supabase.from("imports").update({ status: "importing" }).eq("id", id);
  try {
    const file = await c.supabase.storage.from("imports").download(imp.file_path);
    if (file.error || !file.data) throw new Error("Não foi possível ler o arquivo guardado.");
    const grids = await readWorkbook(await file.data.arrayBuffer());
    const ex = extract(grids, layout);
    const built = buildPlan(ex.items, ex.ignored, await loadPlanContext(c.supabase, todayFortaleza()));
    // regra -> histórico -> Claude Haiku; confiança abaixo de 0,80 vai para a fila de revisão
    let loaded: Awaited<ReturnType<typeof classifyItems>>["loaded"] | undefined;
    const { plan, classified } = await classifyPlan(built, async (items) => {
      const r = await classifyItems(c.supabase, c.orgId, items, { learn: false, loaded });
      loaded = r.loaded;
      return r.results;
    });
    const { created } = await applyPlan(c.supabase, { orgId: c.orgId, userId: c.userId, importId: id }, plan);
    await c.supabase.from("imports").update({
      status: "done",
      stats: { ...plan.stats, created, classified, warnings: [...ex.warnings, ...plan.warnings], ignoredReasons: countReasons(plan.ignored.map((i) => i.reason)) },
    }).eq("id", id);
  } catch (e) {
    console.error("importacao", e);
    await c.supabase.from("imports").update({ status: "ready", stats: { error: "A importação falhou e foi desfeita. Nada foi gravado." } }).eq("id", id);
    return to(id, "A importação falhou e foi desfeita. Nada foi gravado.");
  }
  to(id);
}

export async function undoImportAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const c = await getCtx();
  try {
    await undoImport(c.supabase, id);
    await c.supabase.from("imports").update({ status: "undone" }).eq("id", id);
  } catch {
    return to(id, "Não foi possível desfazer. Tente de novo.");
  }
  to(id);
}

/** Roda de novo a leitura do layout pelo Claude (por exemplo, depois de cadastrar a chave). */
export async function retryMapping(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const c = await getCtx();
  const imp = await loadImport(c, id);
  if (!imp) return to(id, "Importação não encontrada.");
  try {
    if (!hasAnthropicKey()) throw new Error("A chave ANTHROPIC_API_KEY não está configurada na Vercel.");
    const file = await c.supabase.storage.from("imports").download(imp.file_path);
    if (file.error || !file.data) throw new Error("Não foi possível ler o arquivo guardado.");
    const grids = await readWorkbook(await file.data.arrayBuffer());
    const { data: methods } = await c.supabase.from("payment_methods").select("id, name").eq("active", true);
    const { layout, warnings } = await mapLayout({ grids, today: todayFortaleza(), methods: methods ?? [], complete: sonnetComplete() });
    const clean = sanitizeLayout(layout, grids);
    await c.supabase.from("imports").update({ status: "ready", layout: clean.layout, stats: { warnings: [...warnings, ...clean.warnings] } }).eq("id", id);
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Falha ao ler a planilha.";
    await c.supabase.from("imports").update({ status: "failed", stats: { error: msg } }).eq("id", id);
    return to(id, msg);
  }
  to(id);
}

function countReasons(reasons: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of reasons) out[r] = (out[r] ?? 0) + 1;
  return out;
}
