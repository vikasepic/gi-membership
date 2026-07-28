// The library delivers courses and nothing else, so a published product with no
// course attached is something a buyer can pay for and never receive. Publishing
// one is refused; a draft may sit courseless while it's being built.
export function blocksPublish(status: "draft" | "published", courseIds: string[]): boolean {
  return status === "published" && courseIds.length === 0;
}

export const PUBLISH_WITHOUT_COURSE_ERROR =
  "Attach at least one course before publishing — the library delivers courses, so a published product with no course would take payment and deliver nothing.";
