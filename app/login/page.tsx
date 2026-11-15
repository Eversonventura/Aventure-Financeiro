"use client";

import { useState } from "react";
import { Logo } from "@/components/logo";
import { Orbits } from "@/components/orbits";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "erro">("idle");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
        shouldCreateUser: false, // só e-mails já cadastrados (Ventura e Amanda)
      },
    });
    setEstado(error ? "erro" : "enviado");
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
      <Orbits className="top-0 right-0 h-full w-full opacity-60" />
      <div className="relative flex w-full max-w-sm flex-col gap-6 rounded-3xl border border-line bg-surface p-8">
        <Logo />
        <div>
          <h1 className="text-2xl font-bold">Entrar no Financeiro</h1>
          <p className="mt-1 text-sm text-muted">Enviamos um link de acesso para o seu e-mail.</p>
        </div>
        {estado === "enviado" ? (
          <p className="rounded-xl bg-emerald-500/10 p-4 text-emerald-300">
            Enviamos um link para <strong>{email}</strong>. Abra o e-mail neste aparelho.
          </p>
        ) : (
          <form onSubmit={enviar} className="flex flex-col gap-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="seu e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-line-strong bg-surface-2 px-4 py-3 text-base text-ink"
            />
            <button
              disabled={estado === "enviando"}
              className="rounded-xl bg-gold px-4 py-3 font-semibold text-canvas hover:brightness-110 disabled:opacity-60"
            >
              {estado === "enviando" ? "Enviando…" : "Entrar com link por e-mail"}
            </button>
            {estado === "erro" && (
              <p className="text-sm text-red-400">Não foi possível enviar. Este e-mail está autorizado?</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
