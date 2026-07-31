import { listErrorEvents, MAX_ATTEMPTS } from "@/lib/errors";
import { retryNowAction } from "./actions";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const relative = (iso: string) => {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (mins <= 0) return "due now";
  if (mins < 60) return `in ${mins}m`;
  return `in ${Math.round(mins / 60)}h`;
};

export default async function AdminErrorsPage() {
  const events = await listErrorEvents();
  const unresolved = events.filter((e) => !e.resolvedAt);
  const stuck = unresolved.filter((e) => e.jobKind && e.attempts >= MAX_ATTEMPTS);
  const queued = unresolved.filter((e) => e.jobKind && e.attempts < MAX_ATTEMPTS);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl">Errors</h1>
        <p className="max-w-2xl text-sm text-muted">
          Side effects that failed after a purchase had already gone through — tagging, connected
          apps, the CRM feed. None of these can fail an order, which is exactly why they need a
          place to be seen.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi label="Unresolved" value={String(unresolved.length)} />
        <Kpi label="Waiting to retry" value={String(queued.length)} />
        <Kpi
          label="Needs a human"
          value={String(stuck.length)}
          hint={stuck.length > 0 ? `gave up after ${MAX_ATTEMPTS} tries` : undefined}
        />
      </div>

      {events.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-5 py-8 text-center text-muted">
          Nothing has failed. This page stays empty until something does.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((e) => {
            const spent = Boolean(e.jobKind) && e.attempts >= MAX_ATTEMPTS && !e.resolvedAt;
            return (
              <div
                key={e.id}
                className={`flex flex-col gap-3 rounded-2xl border bg-surface p-5 ${
                  e.resolvedAt ? "border-border opacity-60" : spent ? "border-primary/40" : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="kicker rounded-full border border-border px-2.5 py-1 text-muted">
                    {e.source}
                  </span>
                  {e.resolvedAt ? (
                    <span className="kicker text-navy">Resolved</span>
                  ) : spent ? (
                    <span className="kicker text-primary">Gave up</span>
                  ) : e.jobKind ? (
                    <span className="kicker text-muted">
                      Retry {e.attempts}/{MAX_ATTEMPTS}
                      {e.nextAttemptAt ? ` · ${relative(e.nextAttemptAt)}` : ""}
                    </span>
                  ) : (
                    <span className="kicker text-muted">Log only</span>
                  )}
                  <span className="ml-auto text-xs text-muted">{when(e.createdAt)}</span>
                </div>

                <p className="text-sm">{e.message}</p>

                {Object.keys(e.context).length > 0 && (
                  <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                    {Object.entries(e.context).map(([k, v]) => (
                      <div key={k} className="flex gap-1.5">
                        <dt>{k}:</dt>
                        <dd className="text-fg">
                          {typeof v === "string" ? v : JSON.stringify(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {/* Only offered where it can do something: a log-only row has
                    nothing to run, and a resolved one has nothing left to fix. */}
                {e.jobKind && !e.resolvedAt && (
                  <form action={retryNowAction} className="flex items-center gap-3">
                    <input type="hidden" name="id" value={e.id} />
                    <button className="w-fit rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-primary">
                      Try again now
                    </button>
                    {spent && (
                      <span className="text-xs text-muted">
                        Automatic retries stopped. Fix the cause, then run it.
                      </span>
                    )}
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5">
      <span className="kicker text-muted">{label}</span>
      <span className="font-display text-2xl">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
