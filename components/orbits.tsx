/** Linhas decorativas (órbitas rosa e douradas) usadas no topo da tela Início e nos cartões. */
export function Orbits({ className = "" }: { className?: string }) {
  return (
    <svg className={`pointer-events-none absolute ${className}`} viewBox="0 0 800 400" fill="none" aria-hidden="true">
      <ellipse cx="560" cy="250" rx="360" ry="130" stroke="var(--gold)" strokeOpacity="0.55" transform="rotate(-8 560 250)" />
      <path d="M180 420C260 120 560 40 860 60" stroke="var(--brand)" strokeOpacity="0.85" />
      <path d="M120 420C230 190 520 110 860 170" stroke="var(--line-strong)" strokeOpacity="0.6" />
    </svg>
  );
}
