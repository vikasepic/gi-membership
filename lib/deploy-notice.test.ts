import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { announceDeploy, currentNotice, DEFAULT_WARNING_SECONDS } from "@/lib/deploy-notice";
import { createServiceClient } from "@/lib/supabase/server";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("the warning is sixty seconds", () => {
  it("defaults to a minute", () => {
    // Long enough to press Save on anything open, short enough that whoever is
    // pushing will actually wait it out every time — and a rule nobody keeps is
    // worse than no rule.
    expect(DEFAULT_WARNING_SECONDS).toBe(60);
  });
});

describe.skipIf(!canRun)("announcing a deploy (integration)", () => {
  it("writes a notice the admin shell can read back", async () => {
    const { startsAt } = await announceDeploy({ seconds: 60, source: "vitest" });
    const now = await currentNotice();
    expect(now?.startsAt).toBe(startsAt);
    // An instant, not a duration — every tab computes its own seconds from it.
    expect(new Date(startsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("stops showing one that has aged out", async () => {
    // The second half of a notice's life is "it is going out now"; past that,
    // the app is back and the bar must not still be on the screen.
    await announceDeploy({ seconds: 5, backInMinutes: 1, source: "vitest" });
    const db = createServiceClient();
    await db
      .from("deploy_notices")
      .update({ starts_at: new Date(Date.now() - 90 * 60_000).toISOString() })
      .eq("source", "vitest");
    expect(await currentNotice()).toBeNull();
  });

  it("refuses a nonsense window rather than trusting it", async () => {
    // A negative one announces a deploy that already began; an enormous one
    // leaves a bar on screen all day with nothing able to clear it.
    const short = await announceDeploy({ seconds: -100, source: "vitest" });
    expect(new Date(short.startsAt).getTime()).toBeGreaterThan(Date.now());
    const long = await announceDeploy({ seconds: 99_999, source: "vitest" });
    expect(new Date(long.startsAt).getTime() - Date.now()).toBeLessThanOrEqual(600_000 + 5_000);
  });
});

describe("who may raise one", () => {
  const route = readFileSync("app/api/deploy-notice/route.ts", "utf8");

  it("needs the shared secret, in a header", () => {
    // A secret in a query string ends up in access logs, proxy logs and shell
    // history, which is the whole reason not to put one there.
    expect(route).toContain("Bearer ${secret}");
    expect(route).toContain("CRON_SECRET");
  });

  it("does not let a browser session raise one", () => {
    // The thing calling it is a terminal about to run `git push`.
    const post = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function GET"));
    expect(post).not.toContain("requireAdmin");
  });

  it("only lets an admin read one", () => {
    const get = route.slice(route.indexOf("export async function GET"));
    expect(get).toContain("requireAdmin");
  });
});

describe("the bar cannot block the thing it is asking for", () => {
  const bar = readFileSync("components/admin/deploy-notice.tsx", "utf8");

  it("is pinned to the bottom, not centred over the page", () => {
    // Save lives in the header of every editor here. A modal demanding a save
    // while covering the save button causes the loss it exists to prevent.
    expect(bar).toContain("bottom-0");
    expect(bar).toContain("pointer-events-none");
  });

  it("counts down to an instant rather than from a duration", () => {
    // A tab that hears late shows less time and is telling the truth.
    expect(bar).toContain("secondsUntil");
  });

  it("can be put down", () => {
    // "Ignore this, I already saved" is a real answer, and a notice you cannot
    // dismiss is one people learn to work around rather than read.
    expect(bar).toContain("onDismiss");
  });
});

afterAll(async () => {
  if (!canRun) return;
  await createServiceClient().from("deploy_notices").delete().eq("source", "vitest");
});

describe("the bar is readable over whatever is underneath it", () => {
  const bar = readFileSync("components/admin/deploy-notice.tsx", "utf8");

  it("is opaque, not a tint over nothing", () => {
    // It was `bg-primary/8` — eight per cent terracotta with no ground, so a
    // sales page read straight through the warning. A colour carrying a
    // message cannot be ninety per cent whatever happens to be behind it.
    // Against the CLASS LIST, not the comment that names the old value — a
    // test that reads its own explanation passes for the wrong reason.
    const classes = bar.match(/className=\{`[^`]*`\}/g)?.join(" ") ?? "";
    expect(classes).not.toContain("bg-primary/8");
    // Mixed against the surface rather than layered with alpha: opaque by
    // construction, so it holds over a hero image or a navy band.
    expect(bar).toContain("color-mix(in srgb, var(--primary) 10%, var(--surface))");
  });
});
