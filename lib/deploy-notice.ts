import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

/**
 * The deploy warning: raising one, and asking whether one is running.
 *
 * The whole feature is two functions and a row. What makes it work is that the
 * countdown is expressed as an INSTANT rather than a duration — every tab
 * computes its own seconds from the same `startsAt`, so one that polls late
 * shows less time instead of promising sixty seconds that do not exist.
 */

export type ActiveNotice = { startsAt: string; backInMinutes: number };

/** Sixty seconds, and the reason it is not thirty. */
export const DEFAULT_WARNING_SECONDS = 60;

/**
 * Announce a deploy.
 *
 * Called before a push, never by a page. Returns when the deploy should begin,
 * so the caller can wait for exactly that instant rather than counting its own.
 */
export async function announceDeploy(args: {
  seconds?: number;
  backInMinutes?: number;
  source?: string;
}): Promise<ActiveNotice> {
  const db = createServiceClient();
  // Clamped rather than trusted. A negative value would announce a deploy that
  // already started, and an enormous one would leave a bar on the screen for
  // the rest of the day with nothing able to clear it.
  const seconds = Math.min(Math.max(Math.round(args.seconds ?? DEFAULT_WARNING_SECONDS), 5), 600);
  const backInMinutes = Math.min(Math.max(Math.round(args.backInMinutes ?? 5), 1), 60);
  const startsAt = new Date(Date.now() + seconds * 1000).toISOString();

  const { error } = await db.from("deploy_notices").insert({
    store_id: await getStoreId(),
    starts_at: startsAt,
    back_in_minutes: backInMinutes,
    source: (args.source ?? "api").slice(0, 40),
  });
  if (error) throw new Error(`announceDeploy: ${error.message}`);
  return { startsAt, backInMinutes };
}

/**
 * The notice an admin should currently be seeing, or null.
 *
 * A notice stays live from the moment it is written until the app is expected
 * to be back — the second half of its life is the "it is going out now, come
 * back shortly" state, which is what somebody who was away from the keyboard
 * for the whole countdown needs to see.
 *
 * Never throws. This is polled from every admin page, and a warning system that
 * can break the admin is worse than no warning system.
 */
export async function currentNotice(): Promise<ActiveNotice | null> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("deploy_notices")
      .select("starts_at, back_in_minutes")
      .eq("store_id", await getStoreId())
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;

    const startsAt = new Date(data.starts_at as string).getTime();
    const endsAt = startsAt + (data.back_in_minutes as number) * 60_000;
    if (Date.now() > endsAt) return null;

    return {
      // Canonical ISO, not whatever Postgres formatted. It returns "+00:00"
      // where JavaScript writes "Z" — the same instant, a different string, and
      // the sort of difference that survives right up until something compares
      // the two and quietly decides they are different notices.
      startsAt: new Date(startsAt).toISOString(),
      backInMinutes: data.back_in_minutes as number,
    };
  } catch {
    return null;
  }
}
