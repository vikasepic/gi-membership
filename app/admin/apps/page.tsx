import { listApps } from "@/lib/apps";

export default async function AdminAppsPage() {
  const apps = await listApps();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl">Connected apps</h1>
        <p className="max-w-2xl text-sm text-muted">
          Apps the store provisions and hands users into. Each app receives a signed single-use
          handoff token and a server-to-server provision call secured by its shared secret.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {apps.map((a) => (
          <div key={a.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-medium">{a.name}</span>
                <code className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">{a.key}</code>
              </div>
              <span className={a.active ? "text-sm text-navy" : "text-sm text-muted"}>
                {a.active ? "active" : "inactive"}
              </span>
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Row label="Base URL" value={a.baseUrl} />
              <Row label="Provision" value={a.provisionEndpoint} />
              <Row label="Handoff" value={a.handoffEndpoint} />
              <Row label="Shared secret" value={a.sharedSecret === "REPLACE_WITH_ENV_SECRET" ? "⚠ not set (seed placeholder)" : "•••••• (set)"} />
            </dl>
          </div>
        ))}
        {apps.length === 0 && <p className="text-muted">No apps registered.</p>}
      </div>
    </div>
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
