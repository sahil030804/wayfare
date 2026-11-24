import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function supabase() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return jar.getAll(); },
        setAll(items) {
          try { items.forEach(({ name, value, options }) => jar.set(name, value, options)); }
          catch { /* Server Components cannot write cookies. */ }
        },
      },
    },
  );
}

export function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
