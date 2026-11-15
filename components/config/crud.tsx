import type { ReactNode } from "react";
import { ConfirmButton } from "@/components/config/confirm-button";

export type Option = { value: string; label: string };
export type Field = {
  name: string;
  label: string;
  type: "text" | "select" | "money" | "percent" | "number" | "checkbox" | "month" | "date";
  options?: Option[];
  required?: boolean;
  hint?: string;
};
export type Values = Record<string, string>;

const input = "w-full rounded-lg border border-line-strong bg-surface-2 text-ink px-3 py-2.5 text-base";

function FieldInput({ f, value }: { f: Field; value: string }) {
  if (f.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 py-2">
        <input type="checkbox" name={f.name} defaultChecked={value === "on"} className="size-5" />
        <span>{f.label}</span>
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{f.label}{f.required && " *"}</span>
      {f.type === "select" ? (
        <select name={f.name} defaultValue={value} required={f.required} className={input}>
          {!f.required && <option value="">—</option>}
          {f.required && value === "" && <option value="" disabled>Escolha…</option>}
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          name={f.name}
          defaultValue={value}
          required={f.required}
          type={f.type === "month" ? "month" : f.type === "date" ? "date" : "text"}
          inputMode={f.type === "text" || f.type === "month" || f.type === "date" ? undefined : "decimal"}
          className={input}
        />
      )}
      {f.hint && <span className="text-xs text-muted">{f.hint}</span>}
    </label>
  );
}

export function RecordForm({
  action, fields, values = {}, id, submitLabel = "Salvar",
}: {
  action: (fd: FormData) => void | Promise<void>;
  fields: Field[];
  values?: Values;
  id?: string;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-3">
      {id && <input type="hidden" name="id" value={id} />}
      {fields.map((f) => <FieldInput key={f.name} f={f} value={values[f.name] ?? ""} />)}
      <button className="rounded-lg bg-gold px-4 py-3 font-semibold text-canvas hover:brightness-110">{submitLabel}</button>
    </form>
  );
}

export function CrudList<R extends { id: string }>({
  rows, title, subtitle, fields, valuesOf, saveAction, deleteAction, newLabel, newValues, renderDelete, deleteConfirm, emptyText = "Nada cadastrado ainda.",
}: {
  newValues?: Values;
  renderDelete?: (row: R) => ReactNode; // campos extras do formulário de apagar (ex.: mover para outra entidade)
  deleteConfirm?: (row: R) => string;
  rows: R[];
  title: (r: R) => ReactNode;
  subtitle?: (r: R) => ReactNode;
  fields: Field[];
  valuesOf: (r: R) => Values;
  saveAction: (fd: FormData) => void | Promise<void>;
  deleteAction: (fd: FormData) => void | Promise<void>;
  newLabel: string;
  emptyText?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && <p className="text-muted">{emptyText}</p>}
      {rows.map((r) => (
        <details key={r.id} className="rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer list-none p-4">
            <div className="font-medium">{title(r)}</div>
            {subtitle && <div className="text-sm text-muted">{subtitle(r)}</div>}
          </summary>
          <div className="flex flex-col gap-3 border-t border-line p-4">
            <RecordForm action={saveAction} fields={fields} values={valuesOf(r)} id={r.id} />
            <form action={deleteAction} className="flex flex-col gap-2 border-t border-line pt-3">
              <input type="hidden" name="id" value={r.id} />
              {renderDelete?.(r)}
              <ConfirmButton message={deleteConfirm?.(r) ?? "Apagar este registro?"} className="w-fit text-sm text-red-400 underline">Apagar</ConfirmButton>
            </form>
          </div>
        </details>
      ))}
      <details className="rounded-xl border border-dashed border-line-strong">
        <summary className="cursor-pointer p-4 font-medium">+ {newLabel}</summary>
        <div className="border-t border-line p-4">
          <RecordForm action={saveAction} fields={fields} values={newValues} submitLabel="Adicionar" />
        </div>
      </details>
    </div>
  );
}

export async function Section({
  title, description, searchParams, children,
}: {
  title: string;
  description?: string;
  searchParams: Promise<{ erro?: string; ok?: string }>;
  children: ReactNode;
}) {
  const { erro, ok } = await searchParams;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <a href="/configuracoes" className="text-sm text-muted">← Configurações</a>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && <p className="text-muted">{description}</p>}
      {erro && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-red-300">{erro}</p>}
      {ok && !erro && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-emerald-300">Salvo.</p>}
      {children}
    </div>
  );
}
