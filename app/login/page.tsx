"use client";

import { useState } from "react";
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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Caixa Aventure</h1>
      {estado === "enviado" ? (
        <p>Enviamos um link para <strong>{email}</strong>. Abra o e-mail neste aparelho.</p>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-zinc-300 px-4 py-3 text-base"
          />
          <button
            disabled={estado === "enviando"}
            className="rounded-lg bg-zinc-900 px-4 py-3 text-white disabled:opacity-60"
          >
            {estado === "enviando" ? "Enviando…" : "Entrar com link por e-mail"}
          </button>
          {estado === "erro" && (
            <p className="text-sm text-red-600">Não foi possível enviar. Este e-mail está autorizado?</p>
          )}
        </form>
      )}
    </main>
  );
}
