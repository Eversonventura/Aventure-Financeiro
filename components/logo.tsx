/**
 * Logotipo provisório em texto, no estilo da marca "aventure financeiro".
 * Para usar a imagem oficial: salve em public/logo.png (fundo transparente) e troque o conteúdo
 * deste componente por <Image src="/logo.png" ... />.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex flex-col items-start leading-none">
      <span className="font-logo text-[32px] font-semibold tracking-tight text-brand">aventure</span>
      {!compact && (
        <span className="mt-1 font-logo text-[11px] font-normal tracking-[0.55em] text-gold">financeiro</span>
      )}
    </span>
  );
}
