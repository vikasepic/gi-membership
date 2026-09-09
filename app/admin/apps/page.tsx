import { listApps } from "@/lib/apps";
import { planNameBackfill } from "@/lib/app-backfill";
import { ResendNames } from "@/components/admin/resend-names";
import { builtinApp } from "@/lib/builtin-apps/registry";

export default async function AdminAppsPage() {
  const apps = await listApps();
  // Counted here so the button can state what it would do before it does it.
  const plans = await Promise.all(apps.map((a) => planNameBackfill(a.id)));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl">Apps</h1>
        <p className="max-w-2xl text-sm text-muted">
          Everything an offer can grant that is not a course. A connected app runs elsewhere:
          it receives a signed single-use handoff token and a server-to-server provision call
          secured by its shared secret. A built-in app runs on this site, at its own route, and
          reads the ownership row directly — nothing is sent anywhere.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {apps.map((a, i) => (
          <div key={a.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-medium">{a.name}</span>
                <code className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">{a.key}</code>
                <span className="kicker rounded-full border border-border px-2 py-0.5 text-muted">
                  {a.kind === "internal" ? "built in" : "connected"}
                </span>
              </div>
              <span className={a.active ? "text-sm text-navy" : "text-sm text-muted"}>
                {a.active ? "active" : "inactive"}
              </span>
            </div>
            {a.kind === "internal" ? (
              <InternalRows appKey={a.key} />
            ) : (
              <>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <Row label="Base URL" value={a.baseUrl ?? "⚠ not set"} />
                  <Row label="Provision" value={a.provisionEndpoint} />
                  <Row label="Handoff" value={a.handoffEndpoint} />
                  <Row label="Shared secret" value={a.sharedSecret === "REPLACE_WITH_ENV_SECRET" ? "⚠ not set (seed placeholder)" : a.sharedSecret ? "•••••• (set)" : "⚠ not set"} />
                </dl>
                <ResendNames
                  appId={a.id}
                  appName={a.name}
                  total={plans[i].total}
                  named={plans[i].named}
                  active={a.active}
                />
              </>
            )}
          </div>
        ))}
        {apps.length === 0 && <p className="text-muted">No apps registered.</p>}
      </div>
    </div>
  );
}

/**
 * What a built-in app shows instead of endpoints: where it opens, and whether
 * this build has the code for it. A row whose key nothing implements is the
 * one way the table and the codebase can drift, so it is said here rather
 * than discovered by a buyer clicking Open.
 */
function InternalRows({ appKey }: { appKey: string }) {
  const impl = builtinApp(appKey);
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      <Row label="Opens at" value={impl ? impl.route : `/apps/${appKey}`} />
      <Row
        label="Code"
        value={impl ? "in this build" : "⚠ nothing in this build implements this key"}
      />
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted">{label}:</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
