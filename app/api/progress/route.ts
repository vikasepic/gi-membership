import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ownsProduct } from "@/lib/library";
import { setItemCompletion, type CompletionSource } from "@/lib/progress";

const SOURCES: CompletionSource[] = ["manual", "video", "download", "dwell"];

// Idempotent: clients may fire freely. setItemCompletion decides whether the
// signal is allowed to move the row (manual_override wins permanently).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    itemId?: string;
    productId?: string;
    completed?: boolean;
    source?: CompletionSource;
  };
  const { itemId, productId, completed, source } = body;
  if (
    !itemId ||
    !productId ||
    typeof completed !== "boolean" ||
    !source ||
    !SOURCES.includes(source)
  ) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!(await ownsProduct(user.id, productId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  await setItemCompletion(user.id, productId, itemId, completed, source);
  return NextResponse.json({ ok: true });
}
