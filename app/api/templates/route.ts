import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-guard";
import { listSavedTemplates } from "@/lib/templates-store";

// The saved half of the library, for the popup inside the builder.
//
// The built-ins are in code and the popup imports them directly; these live in
// the database and cannot be. One fetch when the popup opens rather than
// threading them down through the page, the block editor and the section — the
// popup is the only thing that wants them, and it is four components deep.
//
// Admin-only. The blocks themselves are not secret — they end up on a public
// sales page — but the list of designs a store has saved is not something a
// visitor has any business enumerating.
export async function GET() {
  if (!(await getAdminUser())) return NextResponse.json({ templates: [] }, { status: 403 });
  try {
    return NextResponse.json({ templates: await listSavedTemplates() });
  } catch {
    // The popup still has its built-ins, so a failure here narrows the shelf
    // rather than emptying it.
    return NextResponse.json({ templates: [] }, { status: 200 });
  }
}
