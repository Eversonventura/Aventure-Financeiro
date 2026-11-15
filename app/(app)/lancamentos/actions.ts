"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCtx } from "@/lib/org";

export async function deleteLaunch(fd: FormData) {
  const { supabase } = await getCtx();
  const group = String(fd.get("group") ?? "");
  const pair = String(fd.get("pair") ?? "");
  const id = String(fd.get("id") ?? "");
  // compra parcelada: apaga o grupo (as parcelas saem em cascata); transferência: as duas pernas
  const { error } = group
    ? await supabase.from("installment_groups").delete().eq("id", group)
    : pair
      ? await supabase.from("transactions").delete().eq("transfer_pair_id", pair)
      : await supabase.from("transactions").delete().eq("id", id);
  revalidatePath("/lancamentos");
  redirect(`/lancamentos${error ? "?erro=" + encodeURIComponent("Não foi possível apagar.") : ""}`);
}
