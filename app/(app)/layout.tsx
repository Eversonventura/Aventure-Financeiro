import Link from "next/link";
import { Shell } from "@/components/shell";
import { SyncStatus } from "@/components/sync-status";
import { getCtx } from "@/lib/org";
import { signOut } from "./actions";

const PAPEL: Record<string, string> = {
  owner: "Dono · Aventure", editor: "Editor · Aventure", viewer: "Leitura · Aventure", bpo_analyst: "Analista BPO",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId, role } = await getCtx();
  const [{ data: person }, { count }] = await Promise.all([
    supabase.from("people").select("name").eq("user_id", userId).maybeSingle(),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("needs_review", true),
  ]);
  return (
    <Shell name={person?.name ?? "Usuário"} role={PAPEL[role] ?? "Aventure"} reviewCount={count ?? 0} signOut={signOut}>
      <SyncStatus />
      {children}
      <Link
        href="/lancamentos/novo"
        aria-label="Novo lançamento"
        className="fixed right-4 bottom-20 z-10 flex size-14 items-center justify-center rounded-full bg-gold text-3xl text-canvas shadow-lg shadow-black/40 md:hidden"
      >
        +
      </Link>
    </Shell>
  );
}
