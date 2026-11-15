import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaptureRefs } from "@/lib/capture/types";

/** Meios e entidades da organização do usuário, para reconhecer nomes ditos ou lidos. */
export async function loadCaptureRefs(supabase: SupabaseClient, today: string): Promise<CaptureRefs> {
  const [m, e] = await Promise.all([
    supabase.from("payment_methods").select("id, name").eq("active", true),
    supabase.from("entities").select("id, name"),
  ]);
  return { today, methods: (m.data ?? []) as CaptureRefs["methods"], entities: (e.data ?? []) as CaptureRefs["entities"] };
}

export type Who = { orgId: string; userId: string };
export async function whoCanWrite(supabase: SupabaseClient): Promise<Who | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: m } = await supabase.from("memberships").select("org_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!m || m.role === "viewer") return null;
  return { orgId: m.org_id as string, userId: user.id };
}
