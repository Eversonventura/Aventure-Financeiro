import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">Página não encontrada</h1>
      <p className="text-muted">O endereço não existe ou você não tem acesso a ele.</p>
      <Link href="/" className="rounded-xl bg-gold px-6 py-3 font-semibold text-canvas">Voltar ao início</Link>
    </main>
  );
}
