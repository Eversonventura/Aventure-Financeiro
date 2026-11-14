import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Cliente Supabase do usuário logado (com RLS) + organização e papel dele. */
export async function getCtx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: m } = await supabase
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!m) redirect("/login?erro=sem-organizacao");
  return { supabase, orgId: m.org_id as string, role: m.role as string, userId: user.id };
}
