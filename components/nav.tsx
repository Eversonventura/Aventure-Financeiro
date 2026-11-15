"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/", label: "Início" },
  { href: "/lancamentos", label: "Lançamentos" },
  { href: "/contas", label: "Contas" },
  { href: "/cartoes", label: "Cartões" },
  { href: "/dre", label: "DRE" },
  { href: "/configuracoes", label: "Config." },
];

export function Nav() {
  const pathname = usePathname();
  const ativo = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* desktop: menu lateral */}
      <aside className="hidden w-56 shrink-0 border-r border-zinc-200 p-4 md:block">
        <p className="mb-6 text-lg font-semibold">Caixa Aventure</p>
        <nav className="flex flex-col gap-1">
          {ITENS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`rounded-md px-3 py-2 ${ativo(i.href) ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}`}
            >
              {i.label}
            </Link>
          ))}
        </nav>
      </aside>
      {/* celular: barra inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {ITENS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex-1 py-3 text-center text-xs ${ativo(i.href) ? "font-semibold text-zinc-900" : "text-zinc-500"}`}
          >
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
