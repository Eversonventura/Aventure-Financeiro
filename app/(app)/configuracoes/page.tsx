import Link from "next/link";

const SECOES = [
  { href: "/configuracoes/entidades", titulo: "Entidades", desc: "Aventure, Ventura, Amanda e Casa" },
  { href: "/configuracoes/pessoas", titulo: "Pessoas", desc: "Quem faz os gastos" },
  { href: "/configuracoes/meios", titulo: "Meios de pagamento", desc: "Cartões, contas e dia de fechamento e vencimento" },
  { href: "/configuracoes/categorias", titulo: "Categorias", desc: "Linha do DRE, natureza e rateio da casa" },
  { href: "/configuracoes/recorrencias", titulo: "Recorrências", desc: "Assinaturas, contas fixas e mensalidades que se repetem todo mês" },
  { href: "/configuracoes/regras", titulo: "Regras de classificação", desc: "O que o sistema aprendeu: “sempre que aparecer X, é Y”" },
  { href: "/configuracoes/clientes", titulo: "Clientes", desc: "Quem paga a Aventure" },
  { href: "/configuracoes/asaas", titulo: "Integração Asaas", desc: "Baixa automática das mensalidades quando o cliente paga" },
  { href: "/configuracoes/geral", titulo: "Geral", desc: "Alíquota efetiva do Simples Nacional" },
];

export default function Page() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      {SECOES.map((s) => (
        <Link key={s.href} href={s.href} className="rounded-xl border border-line bg-surface p-4 hover:bg-surface-2">
          <div className="font-medium">{s.titulo}</div>
          <div className="text-sm text-muted">{s.desc}</div>
        </Link>
      ))}
    </div>
  );
}
