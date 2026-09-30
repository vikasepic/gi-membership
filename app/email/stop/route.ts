import { stopSequence, verifyStopToken } from "@/lib/post-purchase-stop";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function page(status: number, message: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#fafaf8;color:#0b0b0d;">
<main style="max-width:480px;margin:15vh auto;padding:0 20px;font-size:16px;line-height:1.6;"><p>${message}</p></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function handle(req: Request): Promise<Response> {
  const id = verifyStopToken(new URL(req.url).searchParams.get("t"));
  if (!id) return page(400, "This link is not valid. If you want to stop these emails, reply to any of them and we will do it for you.");
  const { name } = await stopSequence(id);
  return page(200, `Done. You won't get any more of these emails${name ? ` about ${esc(name)}` : ""}.`);
}

export async function GET(req: Request) {
  return handle(req);
}

/** One-click unsubscribe (RFC 8058): inboxes POST to the List-Unsubscribe URL. */
export async function POST(req: Request) {
  return handle(req);
}
