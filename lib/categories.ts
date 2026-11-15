export type EntityKind = "pj" | "pf" | "shared";

/**
 * A categoria vale para a entidade? Sem restrição vale para todas.
 * Categorias de pessoa física (Mercado, Moradia…) também valem para a Casa, que é o gasto compartilhado da família.
 */
export function fitsEntity(appliesTo: EntityKind | null, kind: EntityKind | undefined): boolean {
  if (!appliesTo) return true;
  if (!kind) return false;
  if (appliesTo === "pf") return kind === "pf" || kind === "shared";
  return appliesTo === kind;
}
