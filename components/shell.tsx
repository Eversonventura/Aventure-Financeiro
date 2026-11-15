"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  IconBell, IconCalendar, IconCard, IconChart, IconChevronLeft, IconChevronRight, IconClose,
  IconFlow, IconGrid, IconHome, IconList, IconLogout, IconMenu, IconSearch, IconSettings, IconUpload,
} from "@/components/icons";
import { Logo } from "@/components/logo";

const ITENS = [
  { href: "/", label: "Início", Icon: IconHome },
  { href: "/painel", label: "Painel", Icon: IconGrid },
  { href: "/fluxo", label: "Fluxo de caixa", Icon: IconFlow, curto: "Fluxo" },
  { href: "/lancamentos", label: "Lançamentos", Icon: IconList },
  { href: "/contas", label: "Contas do mês", Icon: IconCalendar, curto: "Contas" },
  { href: "/cartoes", label: "Cartões", Icon: IconCard },
  { href: "/dre", label: "DRE", Icon: IconChart },
  { href: "/importacoes", label: "Importações", Icon: IconUpload },
  { href: "/configuracoes", label: "Configurações", Icon: IconSettings, curto: "Config." },
];
const ABAS = ["/", "/lancamentos", "/contas", "/cartoes", "/painel"]
  .map((h) => ITENS.find((i) => i.href === h)!); // barra inferior do celular; o resto fica na gaveta

// preferência "menu recolhido" guardada no aparelho
const KEY = "caixa:menu-recolhido";
const listeners = new Set<() => void>();
const lerRecolhido = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const assinar = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const gravarRecolhido = (v: boolean) => {
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* sem armazenamento */ }
  listeners.forEach((l) => l());
};

function Avatar({ size, iniciais }: { size: string; iniciais: string }) {
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full border-2 border-brand bg-surface-2 font-heading font-bold`}>
      {iniciais}
    </span>
  );
}

type Props = {
  name: string;
  role: string;
  reviewCount: number;
  signOut: () => void | Promise<void>;
  children: ReactNode;
};

export function Shell({ name, role, reviewCount, signOut, children }: Props) {
  const pathname = usePathname();
  const recolhido = useSyncExternalStore(assinar, lerRecolhido, () => false);
  const [gaveta, setGaveta] = useState(false);
  const iniciais = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "CA";
  const ativo = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const Sino = (
    <Link
      href="/lancamentos?revisao=1"
      aria-label={reviewCount > 0 ? `${reviewCount} lançamentos para revisar` : "Nada para revisar"}
      className="relative flex size-11 items-center justify-center rounded-full border border-line bg-surface hover:bg-surface-2"
    >
      <IconBell width={20} height={20} />
      {reviewCount > 0 && <span className="absolute top-2 right-2.5 size-2.5 rounded-full bg-brand" />}
    </Link>
  );

  const lista = (compacto: boolean, aoClicar?: () => void) => (
    <nav className="flex flex-col gap-1.5">
      {ITENS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={aoClicar}
          title={label}
          aria-label={label}
          className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] ${compacto ? "justify-center px-0" : ""} ${ativo(href) ? "bg-brand font-semibold text-white" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
        >
          <Icon width={20} height={20} />
          {!compacto && label}
        </Link>
      ))}
    </nav>
  );

  const sair = (compacto: boolean) => (
    <form action={signOut}>
      <button className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-muted hover:bg-surface-2 hover:text-ink ${compacto ? "justify-center px-0" : ""}`} title="Sair" aria-label="Sair">
        <IconLogout width={18} height={18} />
        {!compacto && "Sair"}
      </button>
    </form>
  );

  return (
    <div className="min-h-dvh bg-canvas">
      {/* desktop: menu lateral, recolhível para ícones */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col gap-5 border-r border-line bg-side p-4 md:flex ${recolhido ? "w-[104px]" : "w-[296px]"}`}>
        <div className={`flex items-center ${recolhido ? "justify-center" : "justify-between"}`}>
          {recolhido ? null : <Logo />}
          <button
            onClick={() => gravarRecolhido(!recolhido)}
            aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
            className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface hover:bg-surface-2"
          >
            {recolhido ? <IconChevronRight width={18} height={18} /> : <IconChevronLeft width={18} height={18} />}
          </button>
        </div>
        {recolhido ? (
          <div className="flex justify-center"><Avatar size="size-14" iniciais={iniciais} /></div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-5 text-center">
            <Avatar size="size-20 text-2xl" iniciais={iniciais} />
            <div className="font-heading font-semibold">{name}</div>
            <div className="text-sm text-muted">{role}</div>
          </div>
        )}
        {lista(recolhido)}
        <div className="mt-auto flex flex-col gap-1">
          {sair(recolhido)}
          {!recolhido && <p className="px-4 text-xs text-muted">Aventure Financeiro · uso interno</p>}
        </div>
      </aside>

      <div className={recolhido ? "md:pl-[104px]" : "md:pl-[296px]"}>
        {/* barra superior */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur md:h-[88px] md:px-11">
          <button
            onClick={() => setGaveta(true)}
            aria-label="Abrir menu"
            className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface md:hidden"
          >
            <IconMenu width={20} height={20} />
          </button>
          <div className="flex flex-1 justify-center md:hidden"><Logo compact /></div>
          <form action="/lancamentos" className="relative hidden max-w-xl flex-1 md:block">
            <IconSearch width={18} height={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
            <input
              name="q"
              placeholder="Buscar lançamentos pela descrição"
              className="w-full rounded-full border border-line bg-surface py-3 pr-4 pl-11 text-[15px] text-ink"
            />
          </form>
          <div className="hidden flex-1 md:block" />
          {Sino}
          <Link href="/lancamentos/novo" className="hidden rounded-full bg-gold px-6 py-3 font-semibold text-canvas hover:brightness-110 md:inline-block">
            Novo lançamento
          </Link>
        </header>

        <main className="px-4 py-6 pb-28 md:px-11 md:py-8">{children}</main>
      </div>

      {/* celular: barra inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-side pb-[env(safe-area-inset-bottom)] md:hidden">
        {ABAS.map(({ href, label, Icon, curto }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${ativo(href) ? "font-semibold text-gold" : "text-muted"}`}
          >
            <Icon width={22} height={22} />
            {curto ?? label}
          </Link>
        ))}
      </nav>

      {/* celular: gaveta */}
      {gaveta && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/60" onClick={() => setGaveta(false)} aria-label="Fechar menu" />
          <aside className="absolute inset-y-0 left-0 flex w-[80%] max-w-sm flex-col gap-5 overflow-y-auto border-r border-line bg-side p-4">
            <div className="flex items-center justify-between">
              <Logo />
              <button onClick={() => setGaveta(false)} aria-label="Fechar" className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface">
                <IconClose width={18} height={18} />
              </button>
            </div>
            <div className="flex items-center gap-4 rounded-2xl bg-surface p-4">
              <Avatar size="size-16 text-xl" iniciais={iniciais} />
              <div>
                <div className="font-heading font-semibold">{name}</div>
                <div className="text-sm text-muted">{role}</div>
              </div>
            </div>
            {lista(false, () => setGaveta(false))}
            <div className="mt-auto">{sair(false)}</div>
          </aside>
        </div>
      )}
    </div>
  );
}
