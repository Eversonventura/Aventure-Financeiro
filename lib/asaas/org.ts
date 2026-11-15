import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Organização dona da conta Asaas. Hoje há uma só: usa ela. Com mais de uma, exige ASAAS_ORG_ID.
 * (Na V3, cada organização terá o seu token de webhook.)
 */
export async function resolveOrgId(admin: SupabaseClient): Promise<string> {
  if (process.env.ASAAS_ORG_ID) return process.env.ASAAS_ORG_ID;
  const { data, error } = await admin.from("organizations").select("id").limit(2);
  if (error) throw new Error("Não consegui ler a organização.");
  if (!data || data.length === 0) throw new Error("Nenhuma organização cadastrada.");
  if (data.length > 1) throw new Error("Há mais de uma organização: defina ASAAS_ORG_ID na Vercel.");
  return data[0].id as string;
}
