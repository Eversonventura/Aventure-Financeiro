import { LaunchForm, type RefData } from "@/components/launch-form";
import { getCtx } from "@/lib/org";

export default async function Page({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams;
  const { supabase, userId } = await getCtx();
  const [ents, people, pms, cats, cls] = await Promise.all([
    supabase.from("entities").select("id, name, kind").order("name"),
    supabase.from("people").select("id, name, user_id, default_entity_id").order("name"),
    supabase.from("payment_methods").select("id, name, kind, closing_day, due_day").eq("active", true).order("name"),
    supabase.from("categories").select("id, name, applies_to, direction").order("name"),
    supabase.from("clients").select("id, name").eq("active", true).order("name"),
  ]);
  const refs = {
    entities: ents.data ?? [],
    people: (people.data ?? []).map(({ user_id, ...p }) => ({ ...p, isMe: user_id === userId })),
    methods: pms.data ?? [],
    categories: cats.data ?? [],
    clients: cls.data ?? [],
  } as RefData;
  return <LaunchForm refs={refs} initialType={tipo === "entrada" ? "income" : "expense"} />;
}
