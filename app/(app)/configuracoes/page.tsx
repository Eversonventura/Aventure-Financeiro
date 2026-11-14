import Link from "next/link";

const SECOES = [
  { href: "/configuracoes/entidades", titulo: "Entidades", desc: "Aventure, Ventura, Amanda, Alexandre, Toinha e Casa" },
  { href: "/configuracoes/pessoas", titulo: "Pessoas", desc: "Quem faz os gastos" },
  { href: "/configuracoes/meios", titulo: "Meios de pagamento", desc: "Cartões, contas e dia de fechamento e vencimento" },
  { href: "/configuracoes/categorias", titulo: "Categorias", desc: "Linha do DRE, natureza e rateio da casa" },
  { href: "/configuracoes/clientes", titulo: "Clientes", desc: "Quem paga a Aventure" },
  { href: "/configuracoes/geral", titulo: "Geral", desc: "Alíquota efetiva do Simples Nacional" },
];

export default function Page() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      {SECOES.map((s) => (
        <Link key={s.href} href={s.href} className="rounded-xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50">
          <div className="font-medium">{s.titulo}</div>
          <div className="text-sm text-zinc-500">{s.desc}</div>
        </Link>
      ))}
    </div>
  );
}
