import { describe, it, expect, afterAll } from "vitest";
import {
  createCourse,
  getCourse,
  addCourseAttachment,
  removeCourseAttachment,
  setCourseVideoEmbed,
  setCourseCover,
} from "@/lib/courses";
import { uploadCourseAttachment, uploadCourseCover, signedItemAsset } from "@/lib/media";
import { createServiceClient } from "@/lib/supabase/server";

const canRun = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const createdCourseIds: string[] = [];

// The "simple course" path: a course that carries its own file/cover directly,
// with no chapters. This exercises the real local buckets, not mocks.
describe.skipIf(!canRun)("course direct content (integration)", () => {
  it("uploads a file to the private bucket and tracks it on the course", async () => {
    const courseId = await createCourse({
      slug: `simple-${Date.now()}`,
      title: "Simple PDF Course",
      subtitle: null,
      description: null,
      chapterLabel: "Chapter",
      lessonLabel: "Lesson",
      type: "pdf",
      status: "published",
    });
    createdCourseIds.push(courseId);

    const pdfBytes = new TextEncoder().encode("%PDF-1.4 test");
    const file = new File([pdfBytes], "guide.pdf", { type: "application/pdf" });
    const attachment = await uploadCourseAttachment(courseId, file);
    expect(attachment.path.startsWith(`courses/${courseId}/`)).toBe(true);
    await addCourseAttachment(courseId, attachment);

    const course = await getCourse(courseId);
    expect(course?.attachments).toHaveLength(1);
    expect(course?.attachments[0].name).toBe("guide.pdf");
    expect(course?.attachments[0].mime).toBe("application/pdf");

    // The stored path must be signable — i.e. the object really exists in the
    // private bucket, so the media route can serve it.
    expect(await signedItemAsset(attachment.path, 60)).toBeTruthy();

    // Removing by path leaves the list empty again.
    await removeCourseAttachment(courseId, attachment.path);
    expect((await getCourse(courseId))?.attachments).toHaveLength(0);
  });

  it("stores a cover in the public bucket and a video URL on the course", async () => {
    const courseId = await createCourse({
      slug: `simple-video-${Date.now()}`,
      title: "Simple Video Course",
      subtitle: null,
      description: null,
      chapterLabel: "Chapter",
      lessonLabel: "Lesson",
      type: "video",
      status: "published",
    });
    createdCourseIds.push(courseId);

    // Tiny valid PNG header is enough for storage; validation happens upstream.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const coverPath = await uploadCourseCover(courseId, new File([png], "cover.png", { type: "image/png" }));
    await setCourseCover(courseId, coverPath);
    await setCourseVideoEmbed(courseId, "https://www.youtube.com/embed/abc123");

    const course = await getCourse(courseId);
    expect(course?.coverPath).toBe(coverPath);
    expect(course?.videoEmbedUrl).toBe("https://www.youtube.com/embed/abc123");

    // Clearing the video works too (empty field in admin = null).
    await setCourseVideoEmbed(courseId, null);
    expect((await getCourse(courseId))?.videoEmbedUrl).toBeNull();
  });
});

afterAll(async () => {
  const db = createServiceClient();
  for (const id of createdCourseIds) await db.from("courses").delete().eq("id", id);
});
