"use client";

import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { centsToBRL, compactBRL } from "@/lib/format";

// Cores validadas contra a superfície escura (luminosidade, contraste e daltonismo).
export const COR = { receita: "#b8860b", despesa: "#e5197d", resultado: "#2c9fd0" } as const;
const GRID = "#24242e";
const TEXTO = "#9a9aa8";

type TipProps = { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string };
function Tip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line-strong bg-surface-2 px-3 py-2 text-sm shadow-lg">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto pl-4 font-medium">{centsToBRL(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { nome: string; cor: string; linha?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
      {items.map((i) => (
        <span key={i.nome} className="flex items-center gap-2">
          <span className={i.linha ? "h-0.5 w-4 rounded" : "size-2.5 rounded-sm"} style={{ background: i.cor }} />
          {i.nome}
        </span>
      ))}
    </div>
  );
}

export function MonthlyChart({ data }: { data: { label: string; receita: number; despesa: number; resultado: number }[] }) {
  return (
    <figure className="flex flex-col gap-3" aria-label="Receita, despesa e resultado dos últimos 12 meses">
      <Legend items={[{ nome: "Receita", cor: COR.receita }, { nome: "Despesa", cor: COR.despesa }, { nome: "Resultado", cor: COR.resultado, linha: true }]} />
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 288 }}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: TEXTO, fontSize: 12 }} />
            <YAxis tickFormatter={compactBRL} tickLine={false} axisLine={false} width={84} tick={{ fill: TEXTO, fontSize: 12 }} />
            <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <ReferenceLine y={0} stroke={GRID} />
            <Bar dataKey="receita" name="Receita" fill={COR.receita} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="despesa" name="Despesa" fill={COR.despesa} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Line dataKey="resultado" name="Resultado" stroke={COR.resultado} strokeWidth={2} dot={{ r: 4, fill: COR.resultado, stroke: "#15151c", strokeWidth: 2 }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function BalanceChart({ data }: { data: { date: string; label: string; balance: number }[] }) {
  return (
    <figure className="flex flex-col gap-3" aria-label="Saldo previsto dia a dia">
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 288 }}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: TEXTO, fontSize: 12 }} minTickGap={48} />
            <YAxis tickFormatter={compactBRL} tickLine={false} axisLine={false} width={84} tick={{ fill: TEXTO, fontSize: 12 }} />
            <Tooltip content={<Tip />} />
            <ReferenceLine y={0} stroke={COR.despesa} strokeOpacity={0.6} />
            <Area type="monotone" dataKey="balance" name="Saldo previsto" stroke={COR.resultado} strokeWidth={2} fill={COR.resultado} fillOpacity={0.1} dot={false} activeDot={{ r: 4, stroke: "#15151c", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Entradas e saídas por dia do mês. */
export function DailyChart({ data }: { data: { day: number; label: string; saida: number; entrada: number }[] }) {
  return (
    <figure className="flex flex-col gap-3" aria-label="Entradas e saídas por dia do mês">
      <Legend items={[{ nome: "Saídas", cor: COR.despesa }, { nome: "Entradas", cor: COR.receita }]} />
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 360, height: 224 }}>
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: TEXTO, fontSize: 11 }} interval="preserveStartEnd" minTickGap={14} />
            <YAxis tickFormatter={compactBRL} tickLine={false} axisLine={false} width={76} tick={{ fill: TEXTO, fontSize: 11 }} />
            <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} labelFormatter={(l) => `Dia ${l}`} />
            <Bar dataKey="saida" name="Saídas" fill={COR.despesa} radius={[4, 4, 0, 0]} maxBarSize={14} />
            <Bar dataKey="entrada" name="Entradas" fill={COR.receita} radius={[4, 4, 0, 0]} maxBarSize={14} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Quanto pesa por mês (parcelas de empréstimos e consórcios ainda não pagas). */
export function CommitmentsChart({ data }: { data: { label: string; cents: number }[] }) {
  return (
    <figure aria-label="Parcelas a pagar por mês">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 360, height: 224 }}>
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: TEXTO, fontSize: 11 }} interval={0} />
            <YAxis tickFormatter={compactBRL} tickLine={false} axisLine={false} width={76} tick={{ fill: TEXTO, fontSize: 11 }} />
            <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="cents" name="Parcelas" fill={COR.despesa} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
