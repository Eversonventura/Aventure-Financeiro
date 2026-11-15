import Link from "next/link";
import { Nav } from "@/components/nav";
import { SyncStatus } from "@/components/sync-status";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Nav />
      <SyncStatus />
      <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">{children}</main>
      <Link
        href="/lancamentos/novo"
        aria-label="Novo lançamento"
        className="fixed right-4 bottom-20 z-10 flex size-14 items-center justify-center rounded-full bg-zinc-900 text-3xl text-white shadow-lg md:bottom-8 md:right-8"
      >
        +
      </Link>
    </div>
  );
}
