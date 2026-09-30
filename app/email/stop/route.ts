import { stopName, stopSequence, verifyStopToken } from "@/lib/post-purchase-stop";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const INVALID = "This link is not valid. If you want to stop these emails, reply to any of them and we will do it for you.";

function page(status: number, message: string, after = ""): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#fafaf8;color:#0b0b0d;">
<main style="max-width:480px;margin:15vh auto;padding:0 20px;font-size:16px;line-height:1.6;"><p>${message}</p>${after}</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/**
 * Opening the link only asks. Mail security gateways fetch the links in
 * incoming mail on their own, so a GET that stopped the sequence would stop
 * it for buyers who never clicked.
 */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const id = verifyStopToken(t);
  if (!id) return page(400, INVALID);
  const name = await stopName(id);
  return page(
    200,
    name ? `Stop the emails about ${esc(name)}?` : "Stop these emails?",
    `<form method="post" action="/email/stop?t=${encodeURIComponent(t)}"><button type="submit" style="font:inherit;padding:10px 18px;border:0;border-radius:6px;background:#0b0b0d;color:#ffffff;cursor:pointer;">Stop these emails</button></form>`,
  );
}

/** The page's button, and one-click unsubscribe (RFC 8058): inboxes POST to the List-Unsubscribe URL. */
export async function POST(req: Request) {
  const id = verifyStopToken(new URL(req.url).searchParams.get("t"));
  if (!id) return page(400, INVALID);
  const { ok, name } = await stopSequence(id);
  if (!ok) return page(500, "Something went wrong and your emails were not stopped. Reply to any of them and we will stop them for you.");
  return page(200, `Done. You won't get any more of these emails${name ? ` about ${esc(name)}` : ""}.`);
}
