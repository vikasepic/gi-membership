import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { validateUpload, uploadCover } from "@/lib/media";
import { setCover } from "@/lib/curriculum-admin";

export async function POST(req: Request) {
  await requireAdmin();
  const form = await req.formData();
  const itemId = form.get("itemId");
  const file = form.get("file");
  if (typeof itemId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const check = validateUpload({ type: file.type, size: file.size }, "cover");
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const path = await uploadCover(itemId, file);
  await setCover(itemId, path);
  return NextResponse.json({ ok: true, path });
}
