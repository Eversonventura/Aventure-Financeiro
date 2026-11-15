import { describe, expect, it } from "vitest";
import { ENV_CHECKS, isMissing, MIGRATIONS } from "./diagnostico";
import { readdirSync } from "node:fs";
import { join } from "node:path";

describe("diagnóstico", () => {
  it("reconhece erro de 'não existe' (migration não aplicada) e não confunde com outros erros", () => {
    expect(isMissing({ code: "42703", message: "column x does not exist" })).toBe(true);
    expect(isMissing({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(isMissing({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(isMissing({ code: "P0001", message: "Pessoa não encontrada." })).toBe(false); // a função existe e respondeu
    expect(isMissing({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissing(null)).toBe(false);
  });
  it("a lista de migrations do diagnóstico cobre todos os arquivos da pasta, na ordem", () => {
    const files = readdirSync(join(__dirname, "../supabase/migrations")).map((f) => f.replace(/\.sql$/, "")).sort();
    expect(MIGRATIONS.map((m) => m.file)).toEqual(files);
  });
  it("as chaves obrigatórias são as que derrubam o sistema", () => {
    expect(ENV_CHECKS.filter((e) => e.required).map((e) => e.name)).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]);
  });
});
