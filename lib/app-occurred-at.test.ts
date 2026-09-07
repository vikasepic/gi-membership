import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `occurredAt` says WHEN THE ENTITLEMENT CHANGED, and survives a retry.
 *
 * Content Engine uses it to ignore out-of-order messages, and it has to:
 * replace-not-merge means a late retry does not merely repeat work, it UNDOES
 * newer state. Buy Instagram, add LinkedIn, and if the first message's retry
 * finally lands carrying a FRESHER timestamp than the second, LinkedIn is
 * revoked from someone who is paying for it.
 *
 * That is what happened while the stamp was taken inside the send: the retry
 * runner replays the queued payload through the same function, so every
 * attempt minted a new "now" and the guard on the other side could never fire.
 *
 * So the stamp is taken once, by the caller, and carried through the queue.
 */
const apps = readFileSync("lib/apps.ts", "utf8");
const retry = readFileSync("lib/retry.ts", "utf8");

describe("the timestamp an app orders our messages by", () => {
  it("is not minted inside the send", () => {
    // `Date.now()` on the body line is the bug: it re-stamps on every attempt.
    expect(apps).not.toMatch(/occurredAt:\s*Math\.floor\(Date\.now\(\)\s*\/\s*1000\)/);
  });

  it("comes from the arguments, so one change has one timestamp", () => {
    expect(apps).toMatch(/const occurredAt = args\.occurredAt \?\? Math\.floor\(Date\.now\(\) \/ 1000\)/);
  });

  it("queues the SAME number it sent, not the bare arguments", () => {
    // The hole this closes: a caller that passes no timestamp would otherwise
    // send one and queue none, and the replay would mint a third.
    expect(apps).toMatch(/queueRetry\(stamped,/);
    expect(apps).not.toMatch(/queueRetry\(args,/);
  });

  it("is replayed from the queued payload rather than re-taken", () => {
    // The retry runner rebuilds the call field by field. A field it forgets is
    // a field that silently reverts to "now".
    expect(retry).toMatch(/occurredAt:\s*[^,\n]*p\.occurredAt/);
  });
});
