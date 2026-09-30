"use client";

import { useMemo, useState } from "react";
import { EmailEditor } from "@/components/admin/email-editor";
import { savePostPurchaseAction, sendPostPurchaseTestAction } from "@/app/admin/post-purchase/actions";
import { renderPostPurchaseEmail } from "@/lib/post-purchase-render";
import { EMAIL_FONTS, LAYOUT_DEFAULTS, fillLine, starterDoc, type DelayUnit, type DocNode, type EmailLayout } from "@/lib/post-purchase-layout";
import type { OwnerType, Sequence } from "@/lib/post-purchase-store";

type Draft = { key: string; id: string | null; delayAmount: number; delayUnit: DelayUnit; subject: string; preheader: string; doc: DocNode };
const SAMPLE = (name: string, accessUrl: string) => ({ first_name: "Priya", offer_name: name, access_link: accessUrl });
const FOLLOW_UP_DOC: DocNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Write your follow-up here." }] }] };
let seq = 0;
const newKey = () => `e${Date.now()}${seq++}`;

function when(d: Draft, i: number, store: boolean) {
  if (i === 0 && !store) return "Right after the welcome email";
  const unit = d.delayUnit === "hours" ? (d.delayAmount === 1 ? "hour" : "hours") : d.delayAmount === 1 ? "day" : "days";
  return `${d.delayAmount} ${unit} after ${i === 0 ? "the welcome email" : `email ${i}`}`;
}

/**
 * Post-purchase emails for one offer or product, or the store series that
 * follows the welcome email. Off until turned on. An item's first email goes
 * right after the welcome; every store email waits its delay.
 * Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
 */
export function PostPurchaseSection({ ownerType, ownerId, ownerName, initial, senderName, accessUrl }: {
  ownerType: OwnerType;
  ownerId: string;
  /** What the buyer bought, for the preview's personal details. */
  ownerName: string;
  initial: Sequence;
  /** From the store's email settings, so the preview shows what buyers get. */
  senderName: string;
  accessUrl: string;
}) {
  const store = ownerType === "store";
  const [enabled, setEnabled] = useState(initial.enabled);
  const [layout, setLayout] = useState<EmailLayout>(initial.layout);
  const [replyTo, setReplyTo] = useState(initial.replyTo ?? "");
  const [emails, setEmails] = useState<Draft[]>(initial.emails.map((e) => ({ ...e, key: newKey() })));
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const current = emails[idx];
  const patch = (p: Partial<Draft>) => setEmails((all) => all.map((e, i) => (i === idx ? { ...e, ...p } : e)));

  const turn = (on: boolean) => {
    setEnabled(on);
    if (on && emails.length === 0) {
      setEmails([
        store
          ? { key: newKey(), id: null, delayAmount: 2, delayUnit: "days", subject: "", preheader: "", doc: FOLLOW_UP_DOC }
          : { key: newKey(), id: null, delayAmount: 0, delayUnit: "days", subject: `{{first_name}}, thank you for getting ${ownerName}`, preheader: "Everything is ready in your library.", doc: starterDoc(ownerName) },
      ]);
      setIdx(0);
    }
  };
  const add = () => {
    setEmails((all) => [...all, { key: newKey(), id: null, delayAmount: 2, delayUnit: "days", subject: "", preheader: "", doc: FOLLOW_UP_DOC }]);
    setIdx(emails.length);
  };
  const move = (to: number) => {
    setEmails((all) => {
      const next = [...all];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
    setIdx(to);
  };
  const remove = () => {
    setEmails((all) => all.filter((_, i) => i !== idx));
    setIdx((i) => Math.max(0, i - 1));
  };

  const payload = () => ({
    ownerType,
    ownerId,
    enabled,
    layout,
    replyTo,
    emails: emails.map((e, i) => ({ id: e.id, delayAmount: i === 0 && !store ? 0 : e.delayAmount, delayUnit: e.delayUnit, subject: e.subject, preheader: e.preheader, doc: e.doc })),
  });

  // A thrown action (offline, a deploy mid-save) leaves the draft as it is.
  const unreachable = { kind: "error", text: "Could not reach the server. Your changes are still here; try again." } as const;
  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await savePostPurchaseAction(payload());
      if (!res.ok) return setStatus({ kind: "error", text: res.error });
      setEmails((all) => all.map((e, i) => ({ ...e, id: res.emailIds[i] ?? e.id })));
      setStatus({ kind: "ok", text: "Saved." });
    } catch {
      setStatus(unreachable);
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await sendPostPurchaseTestAction({ sequence: payload(), index: idx, ownerName });
      setStatus(res.ok ? { kind: "ok", text: `Test sent to ${res.to}.` } : { kind: "error", text: res.error });
    } catch {
      setStatus(unreachable);
    } finally {
      setBusy(false);
    }
  };

  const rendered = useMemo(
    () =>
      current && preview
        ? renderPostPurchaseEmail({ doc: current.doc, subject: current.subject, preheader: current.preheader, layout, vars: SAMPLE(ownerName, accessUrl), stopUrl: store || idx > 0 ? "https://grow.greaterinside.com/email/stop" : null })
        : null,
    [current, preview, layout, ownerName, accessUrl, idx, store],
  );

  const num = (k: keyof EmailLayout, v: string) => setLayout((l) => ({ ...l, [k]: Number(v) }));
  const inputCls = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";

  return (
    <section className="rounded-2xl border border-border bg-surface" aria-labelledby="pp-title">
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <h2 id="pp-title" className="text-base font-semibold">
            {store ? "Follow-up emails" : "Post-purchase emails"}{" "}
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${enabled ? "bg-emerald-600/10 text-emerald-700" : "bg-surface-2 text-muted"}`}>{enabled ? "On" : "Off"}</span>
          </h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">
            {store
              ? "Sent after the welcome email, on a buyer's first purchase. Later purchases get only the welcome. A buyer who clicks Stop these emails gets no more follow-ups, from here or any offer, until they buy again."
              : "Emails sent to the buyer after they buy this, in addition to the store’s welcome email. The first goes right after the welcome. Add follow-ups with a delay between each."}
          </p>
        </div>
        <label className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer">
          <input type="checkbox" className="peer sr-only" checked={enabled} onChange={(e) => turn(e.target.checked)} aria-label={store ? "Send follow-up emails after the welcome" : `Send post-purchase emails for ${ownerName}`} />
          <span className="absolute inset-0 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-primary" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </label>
      </div>

      {!enabled && emails.length === 0 ? (
        <p className="border-t border-border px-5 py-4 text-sm text-muted">
          {store
            ? "No follow-ups are sent after the welcome. Turn this on to write the first one."
            : "Nothing extra is sent for this. Turn it on to write the email; a starter email is filled in for you to edit."}
        </p>
      ) : (
        current && (
          <>
            <div className="grid gap-3 border-t border-border px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">Emails in this sequence</h3>
                <span className="text-xs text-muted">
                  {store
                    ? "Each email waits its delay after the one before. Edits reach buyers who are part-way through. Turning this off stops the rest for everyone."
                    : "The rest stop if the order is refunded or access ends. Stop these emails pauses every follow-up for that buyer until they buy again. Edits reach buyers who are part-way through. Turning this off stops the rest for everyone."}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Emails in this sequence">
                {emails.map((e, i) => (
                  <button key={e.key} type="button" role="tab" aria-selected={i === idx} onClick={() => { setIdx(i); setPreview(false); }}
                    className={`grid w-52 shrink-0 gap-0.5 rounded-xl border p-3 text-left ${i === idx ? "border-primary bg-primary/5" : "border-border hover:border-primary"}`}>
                    <span className="text-[11px] font-semibold text-muted">Email {i + 1}</span>
                    <span className="text-xs font-semibold text-primary">{when(e, i, store)}</span>
                    <span className="truncate text-sm">{e.subject || "(no subject yet)"}</span>
                  </button>
                ))}
                <button type="button" onClick={add} className="w-36 shrink-0 rounded-xl border border-dashed border-border text-sm text-muted hover:border-primary hover:text-primary">+ Add email</button>
              </div>
            </div>

            <div className="grid border-t border-border lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="grid min-w-0 content-start gap-4 p-5">
                <div className="grid gap-1.5">
                  <label htmlFor="pp-subject" className="text-xs font-semibold">Subject line</label>
                  <div className="flex gap-2">
                    <input id="pp-subject" className={inputCls} maxLength={200} value={current.subject} onChange={(e) => patch({ subject: e.target.value })} />
                    <button type="button" className="shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 text-xs" onClick={() => patch({ subject: `{{first_name}} ${current.subject}`.trim() })}>+ First name</button>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="pp-preheader" className="text-xs font-semibold">Preview text</label>
                  <input id="pp-preheader" className={inputCls} maxLength={200} value={current.preheader} onChange={(e) => patch({ preheader: e.target.value })} />
                  <span className="text-xs text-muted">The grey line after the subject in most inboxes. Optional.</span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
                  <b>Email {idx + 1}</b>
                  {idx === 0 && !store ? (
                    <span>Sent right after the welcome email, once checkout is over.</span>
                  ) : (
                    <>
                      <span>Send</span>
                      <input aria-label="Delay" type="number" min={1} max={365} className="w-20 rounded-lg border border-border bg-surface px-2 py-1" value={current.delayAmount} onChange={(e) => patch({ delayAmount: Math.max(1, Number(e.target.value) || 1) })} />
                      <select aria-label="Delay unit" className="rounded-lg border border-border bg-surface px-2 py-1" value={current.delayUnit} onChange={(e) => patch({ delayUnit: e.target.value as DelayUnit })}>
                        <option value="hours">hours</option>
                        <option value="days">days</option>
                      </select>
                      <span>after {idx === 0 ? "the welcome email" : `email ${idx}`}</span>
                      <span className="flex-1" />
                      <button type="button" className="rounded-md px-2 py-1 disabled:opacity-40" disabled={idx <= (store ? 0 : 1)} onClick={() => move(idx - 1)} aria-label="Move earlier">↑</button>
                      <button type="button" className="rounded-md px-2 py-1 disabled:opacity-40" disabled={idx >= emails.length - 1} onClick={() => move(idx + 1)} aria-label="Move later">↓</button>
                      {/* The only store email stays: with none, the section would have nothing to show. */}
                      {!(store && emails.length === 1) && <button type="button" className="text-xs text-muted underline" onClick={remove}>Delete email</button>}
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex rounded-full border border-border p-0.5 text-xs" role="group" aria-label="Width">
                    {(["desktop", "mobile"] as const).map((v) => (
                      <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 ${view === v ? "bg-primary/10 font-semibold text-primary" : "text-muted"}`}>{v === "desktop" ? "Desktop" : "Mobile"}</button>
                    ))}
                  </div>
                  <div className="inline-flex rounded-full border border-border p-0.5 text-xs" role="group" aria-label="Mode">
                    <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)} className={`rounded-full px-3 py-1 ${!preview ? "bg-primary/10 font-semibold text-primary" : "text-muted"}`}>Edit</button>
                    <button type="button" aria-pressed={preview} onClick={() => setPreview(true)} className={`rounded-full px-3 py-1 ${preview ? "bg-primary/10 font-semibold text-primary" : "text-muted"}`}>Preview as Priya</button>
                  </div>
                </div>

                {preview && rendered ? (
                  <iframe title="Email preview" srcDoc={rendered.html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="mx-auto h-[640px] w-full rounded-xl border border-border bg-white" style={{ maxWidth: view === "mobile" ? 375 : "100%" }} />
                ) : (
                  <EmailEditor doc={current.doc} docKey={current.key} onChange={(doc) => patch({ doc })} layout={layout} view={view} />
                )}
              </div>

              <aside className="grid content-start gap-5 border-t border-border p-5 lg:border-l lg:border-t-0" aria-label="Email layout">
                <div className="grid gap-2">
                  <h3 className="text-sm font-semibold">Inbox preview</h3>
                  <div className="grid gap-0.5 rounded-xl border border-border p-3 text-sm">
                    <span className="font-semibold">{senderName}</span>
                    <span>{fillLine(current.subject, SAMPLE(ownerName, accessUrl)) || "(no subject yet)"}</span>
                    <span className="truncate text-xs text-muted">{fillLine(current.preheader, SAMPLE(ownerName, accessUrl)) || "Preview text shows here"}</span>
                  </div>
                </div>
                <div className="grid gap-1">
                  <label htmlFor="pp-reply-to" className="text-xs font-semibold">Replies go to</label>
                  <input id="pp-reply-to" type="email" className={inputCls} value={replyTo} placeholder="The store's reply-to address" onChange={(e) => setReplyTo(e.target.value.trim())} />
                  <span className="text-xs text-muted">Leave empty to use the store&rsquo;s reply-to address.</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <h3 className="col-span-2 text-sm font-semibold">Body width</h3>
                  {([["desktopWidth", "Desktop max (px)", 320, 900], ["mobileWidthPct", "Mobile max (%)", 60, 100], ["desktopPadding", "Desktop padding (px)", 0, 64], ["mobilePadding", "Mobile padding (px)", 0, 48]] as const).map(([k, label, min, max]) => (
                    <div key={k} className="grid gap-1">
                      <label htmlFor={`pp-${k}`} className="text-xs font-semibold">{label}</label>
                      <input id={`pp-${k}`} type="number" min={min} max={max} className={inputCls} value={layout[k]} onChange={(e) => num(k, e.target.value)} />
                    </div>
                  ))}
                </div>
                <div className="grid gap-2.5">
                  <h3 className="text-sm font-semibold">Defaults for this email</h3>
                  <label htmlFor="pp-font" className="text-xs font-semibold">Font</label>
                  <select id="pp-font" className={inputCls} value={layout.fontFamily} onChange={(e) => setLayout((l) => ({ ...l, fontFamily: e.target.value as EmailLayout["fontFamily"] }))}>
                    {EMAIL_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="grid gap-1"><label htmlFor="pp-size" className="text-xs font-semibold">Text size (px)</label><input id="pp-size" type="number" min={12} max={22} className={inputCls} value={layout.fontSize} onChange={(e) => num("fontSize", e.target.value)} /></div>
                    <div className="grid gap-1"><label htmlFor="pp-lh" className="text-xs font-semibold">Line height</label><input id="pp-lh" type="number" min={1.2} max={2} step={0.1} className={inputCls} value={layout.lineHeight} onChange={(e) => num("lineHeight", e.target.value)} /></div>
                  </div>
                  {([["textColor", "Text"], ["linkColor", "Links and buttons"], ["bodyColor", "Email body"], ["backgroundColor", "Background around it"]] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-xs text-muted">
                      <input type="color" className="h-8 w-10 rounded-lg border border-border" value={layout[k]} onChange={(e) => setLayout((l) => ({ ...l, [k]: e.target.value }))} aria-label={label} />
                      {label}
                    </label>
                  ))}
                  <button type="button" className="w-fit text-xs text-muted underline" onClick={() => setLayout(LAYOUT_DEFAULTS)}>Reset layout to defaults</button>
                </div>
              </aside>
            </div>
          </>
        )
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
        <div className="flex items-center gap-3">
          {enabled && current && (
            <button type="button" disabled={busy} onClick={test} className="rounded-full border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary disabled:opacity-50">Send a test to me</button>
          )}
          {status && (
            <span role={status.kind === "error" ? "alert" : "status"} className={`text-sm ${status.kind === "error" ? "text-primary" : "text-muted"}`}>{status.text}</span>
          )}
        </div>
        <button type="button" disabled={busy} onClick={save} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50">Save</button>
      </div>
    </section>
  );
}
