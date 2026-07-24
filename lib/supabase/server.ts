import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/lib/env";

// Server Supabase client bound to the request cookie jar (RSC / route handlers).
export async function createClient() {
  const env = publicEnv();
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll from a Server Component — safe to ignore when middleware
            // is refreshing sessions instead.
          }
        },
      },
    },
  );
}

// Service-role client — bypasses RLS, full grants. Plain supabase-js (no cookie
// auth): the service_role JWT must be the bearer, which @supabase/ssr's
// cookie-managed client won't guarantee. Server-only; never expose to browser.
export function createServiceClient() {
  const env = publicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
