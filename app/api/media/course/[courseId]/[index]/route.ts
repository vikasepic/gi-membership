import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCourse, userOwnsCourse } from "@/lib/courses";
import { signedItemAsset } from "@/lib/media";

// A course's direct attachment is paid content, exactly like a lesson's. Every
// request re-checks the signed-in user owns the course, then 302s to a fresh
// 60s signed URL. Nothing paid is ever on a public path.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ courseId: string; index: string }> },
) {
  const { courseId, index } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  if (!(await userOwnsCourse(user.id, courseId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const course = await getCourse(courseId);
  if (!course) return new NextResponse("Not found", { status: 404 });

  const attachment = course.attachments[Number(index)];
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const url = await signedItemAsset(attachment.path, 60);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url);
}
