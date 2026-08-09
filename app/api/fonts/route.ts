import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { availableFamilies } from "@/lib/fonts";

// The families the block editor may offer. A route rather than a prop: the
// editor is several components below the page that could fetch this, and it
// is one small list read once when a builder opens.
export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  return NextResponse.json({ families: await availableFamilies() });
}
