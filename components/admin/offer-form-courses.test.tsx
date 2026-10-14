// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The Grants tab offers courses (14 Oct 2026): a third grant type, and a
 * Courses checklist that posts one `courseIds` entry per ticked course, which
 * is what saveOffer reads with getAll.
 */
vi.mock("@/app/admin/offers/actions", () => ({ saveOffer: async () => ({}), removeOffer: async () => {} }));

const { OfferForm } = await import("@/components/admin/offer-form");

const courses = [
  { id: "c-1", title: "Founding Cohort Recordings", status: "published" as const },
  { id: "c-2", title: "Prompt Library", status: "draft" as const },
];

function render(courseIds: string[]) {
  return renderToStaticMarkup(
    <OfferForm products={[]} apps={[]} courses={courses} courseIds={courseIds} />,
  );
}

describe("the offer form's courses", () => {
  it("offers Courses only as a grant type", () => {
    expect(render([])).toMatch(/<option value="course">Courses only<\/option>/);
  });

  it("lists every course, and posts the ticked ones", () => {
    const html = new DOMParser().parseFromString(render(["c-2"]), "text/html");
    const boxes = [...html.querySelectorAll<HTMLInputElement>('input[type=checkbox][data-course]')];
    expect(boxes.map((b) => b.dataset.course)).toEqual(["c-1", "c-2"]);
    expect(boxes.filter((b) => b.checked).map((b) => b.dataset.course)).toEqual(["c-2"]);
    const posted = [...html.querySelectorAll<HTMLInputElement>('input[type=hidden][name=courseIds]')].map((i) => i.value);
    expect(posted).toEqual(["c-2"]);
    expect(html.body.textContent).toContain("Founding Cohort Recordings");
  });
});
