import { Nav } from "@/components/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Nav />
      <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">{children}</main>
    </div>
  );
}
