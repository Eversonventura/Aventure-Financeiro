"use client";

import { useEffect } from "react";

// Se uma tela quebrar, mostra uma mensagem em vez de uma página em branco, sem expor detalhes técnicos.
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("erro de tela", error.digest ?? ""); }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Algo deu errado</h1>
      <p className="text-muted">Não foi possível carregar esta tela. Seus dados estão seguros. Tente de novo; se continuar, avise quem cuida do sistema{error.digest ? ` (código ${error.digest})` : ""}.</p>
      <button onClick={reset} className="rounded-xl bg-gold px-6 py-3 font-semibold text-canvas hover:brightness-110">Tentar de novo</button>
    </div>
  );
}
