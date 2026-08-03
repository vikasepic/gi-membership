import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCourseItem } from "@/lib/curriculum";
import { userOwnsCourse } from "@/lib/courses";
import { signedItemAsset } from "@/lib/media";
import { userIsAdmin } from "@/lib/admin-guard";

// Attachments and inline lesson images are paid content. Every request
// re-checks the signed-in user owns the parent product, then 302s to a fresh
// 60s signed URL. Nothing paid is ever on a public path.
//
// An admin passes the ownership check so a course can be previewed before
// anyone owns it. Deliberately a branch here rather than a separate preview
// route: a second path skipping these checks starts admin-only and is one
// refactor away from being reachable. Admins can already download every asset
// from the admin area, so this grants nothing new.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string; index: string }> },
) {
  const { itemId, index } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const item = await getCourseItem(itemId);
  if (!item) return new NextResponse("Not found", { status: 404 });

  const admin = await userIsAdmin(user);
  if (!admin && !(await userOwnsCourse(user.id, item.courseId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Drafts are what an admin is previewing; for everyone else they do not exist.
  if (!admin && !item.isPublished) return new NextResponse("Not found", { status: 404 });

  // A draft chapter hides everything beneath it: even if this lesson row is
  // published, an unpublished parent chapter must block its attachments too.
  if (!admin && item.parentId) {
    const parent = await getCourseItem(item.parentId);
    if (!parent || !parent.isPublished) return new NextResponse("Not found", { status: 404 });
  }

  const attachment = item.attachments[Number(index)];
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const url = await signedItemAsset(attachment.path, 60);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url);
}
