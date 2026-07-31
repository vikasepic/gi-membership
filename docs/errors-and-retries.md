# Errors and retries

Every outbound side effect in this store is best-effort: tagging, connected-app
provisioning, the CRM feed. They run *after* the card has been charged, so an
outage at ActiveCampaign must never fail a paid order.

The cost of that was silence. A failure reached `console.error` in a container
nobody reads, and the first symptom was a customer saying they never got access.

## Where to look

**Admin → Errors.** Unresolved first, newest first.

| State | Meaning |
|---|---|
| **Retry n/5** | Queued. Will run again by itself |
| **Gave up** | Five attempts failed. Needs a human — it stays listed |
| **Resolved** | A retry eventually worked. Kept as evidence it had been failing |
| **Log only** | Recorded, not replayable |

"Gave up" deliberately stays **unresolved**: giving up must not mean forgetting.

## Retry schedule

Backoff in minutes: **1, 5, 15, 60, 180** — five attempts over about four hours.
Front-loaded because most failures are a blip that clears in minutes; the long
tail is for a provider genuinely being down, where hammering it helps nobody.

Every job is safe to run twice. Tagging a contact that is already tagged is a
no-op in ActiveCampaign, entitlement pushes are declarative state rather than
increments, and CRM events carry their own ids.

## Setting up the sweep

The queue only drains when something calls it.

**1. Add a secret to Coolify** (generate it yourself — `openssl rand -base64 32`):

```
CRON_SECRET=<your value>
```

**2. Add a scheduled task** — Coolify → gi-membership → Scheduled Tasks:

| Field | Value |
|---|---|
| Name | `retry-failed-jobs` |
| Frequency | `*/5 * * * *` |
| Timeout | `300` |
| Container name | leave empty (defaults to the app container) |

Command, one line:

```
node -e "fetch('http://127.0.0.1:3000/api/cron/retry',{method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(async r=>console.log(r.status, await r.text()))"
```

**Not curl — the container does not have it.** `node` is present and has fetch
built in. A curl command here fails silently every five minutes and the only
symptom is a queue that never drains.

It calls 127.0.0.1:3000 rather than the public domain: the task runs inside the
app container, so this skips DNS and the proxy and never leaves the box.

The secret is read from the container's own environment, so it lives on the
app's Environment Variables page — the same one as the Stripe keys — and never
appears in the task definition. Bearer header rather than a query string: a
secret in a URL ends up in access logs, proxy logs and browser history.

Without the cron, nothing retries automatically — but everything is still
recorded, and **Try again now** on each row works by hand. That button runs the
same sweep the cron does, so it cannot mislead you about whether the automatic
retry would succeed.

## What is queued

| Source | Retryable |
|---|---|
| `activecampaign` | Yes — the exact tag call is replayed |
| `app_entitlement` | Yes |
| `crm_event` | Yes |

## Still missing

- **Nothing alerts.** You have to look at the page. An email or Slack ping on
  "gave up" would be the next thing worth adding.
- **Stripe webhooks are not queued here** — Stripe does its own retries.
