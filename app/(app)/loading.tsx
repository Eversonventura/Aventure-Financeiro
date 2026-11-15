// Esqueleto enquanto a tela carrega (o menu continua visível).
export default function Carregando() {
  return (
    <div className="mx-auto flex max-w-3xl animate-pulse flex-col gap-4" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-48 rounded-lg bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-surface" />)}</div>
      <div className="h-56 rounded-3xl bg-surface" />
      {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-surface" />)}
    </div>
  );
}
