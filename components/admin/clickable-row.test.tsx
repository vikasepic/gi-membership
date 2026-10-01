// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * A table row that opens its member. A click on the row goes there; a click
 * on something in the row that does its own thing (the Refund button, a
 * link, a field) is left to that thing.
 */

const pushed = vi.hoisted(() => [] as string[]);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (u: string) => pushed.push(u) }) }));
const { ClickableRow } = await import("@/components/admin/clickable-row");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  pushed.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <table>
        <tbody>
          <ClickableRow href="/admin/members/u1" className="row">
            <td id="plain">13:14</td>
            <td><a id="link" href="/elsewhere">Lotte</a></td>
            <td><button id="refund" type="button">Refund</button></td>
          </ClickableRow>
        </tbody>
      </table>,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const click = (id: string, init: MouseEventInit = {}) =>
  act(() => host.querySelector(`#${id}`)!.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init })));

describe("a clickable row", () => {
  it("opens the member from anywhere plain on the row", () => {
    click("plain");
    expect(pushed).toEqual(["/admin/members/u1"]);
  });

  it("leaves a button or link in the row to do its own job", () => {
    click("refund");
    click("link");
    expect(pushed).toEqual([]);
  });

  it("does not steal a text selection or a new-tab click", () => {
    click("plain", { metaKey: true });
    expect(pushed).toEqual([]);
  });

  it("is an ordinary row when there is no member to open", () => {
    act(() => root.render(<table><tbody><ClickableRow href={null}><td id="guest">guest</td></ClickableRow></tbody></table>));
    click("guest");
    expect(pushed).toEqual([]);
    expect(host.querySelector("tr")!.className).not.toContain("cursor-pointer");
  });

  it("looks clickable", () => {
    expect(host.querySelector("tr")!.className).toContain("cursor-pointer");
  });
});
