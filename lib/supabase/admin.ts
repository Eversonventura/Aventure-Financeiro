import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Cliente com a service role: ignora a RLS. Só em rotas de servidor protegidas (cron, webhooks). */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
