import { describe, it, expect } from "vitest";
import { intakeMessage, shapeText, titleFromText, transcriptText } from "./format";
import { stripDashes } from "./text";

describe("stripDashes", () => {
  it("leaves text without dashes untouched, by identity", () => {
    const s = "Plain, with commas: and colons.";
    expect(stripDashes(s)).toBe(s);
  });

  it("turns a dash between numbers into to", () => {
    expect(stripDashes("Take 3–5 people")).toBe("Take 3 to 5 people");
  });

  it("turns any other dash into a comma", () => {
    expect(stripDashes("Warm — direct — short")).toBe("Warm, direct, short");
  });

  it("does not leave a comma after a full stop", () => {
    expect(stripDashes("The end.— Next")).toBe("The end. Next");
  });
});

describe("shapeText and transcriptText", () => {
  it("says so when nothing was extracted", () => {
    expect(shapeText(null)).toContain("did not produce");
    expect(
      shapeText({ narrow: null, replay: null, framework: null, story: null, equip: null, gate: null }),
    ).toBe("(nothing extracted yet)");
  });

  it("writes the gate with the chosen title, or the fallback", () => {
    const base = { narrow: null, replay: null, framework: null, story: null, equip: null };
    const chosen = shapeText({
      ...base,
      gate: { buyer: "b", problem: "p", promise: "pr", tools: ["t1", "t2"], titles: ["A", "B"], chosen_title: "B" },
    });
    expect(chosen).toContain("Chosen title: B");
    expect(chosen).toContain("Tools: t1; t2");
    const open = shapeText({
      ...base,
      gate: { buyer: "b", problem: "p", promise: "pr", tools: [], titles: ["A"], chosen_title: null },
    });
    expect(open).toContain("not chosen; use the first option");
  });

  it("labels the two voices", () => {
    const t = transcriptText([
      { id: "1", role: "user", kind: "chat", content: " hi ", stage: null, created_at: "" },
      { id: "2", role: "assistant", kind: "chat", content: "hello", stage: null, created_at: "" },
    ]);
    expect(t).toBe("ME: hi\n\nCOACH: hello");
  });
});

describe("titleFromText", () => {
  it("collapses whitespace and cuts long lines with an ellipsis", () => {
    expect(titleFromText("  a   b\nc ")).toBe("a b c");
    const long = "x".repeat(100);
    expect(titleFromText(long)).toHaveLength(72);
    expect(titleFromText(long).endsWith("…")).toBe(true);
  });
});

describe("intakeMessage", () => {
  it("needs who and what, and adds the last person only when given", () => {
    expect(intakeMessage("", "x", "y")).toBe("");
    expect(intakeMessage("designers", "quiet clients", "")).toBe(
      "I help: designers\nWith: quiet clients",
    );
    expect(intakeMessage("designers", "quiet clients", "Dev")).toContain(
      "The last person I helped with this: Dev",
    );
  });
});
