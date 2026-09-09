import { describe, it, expect } from "vitest";
import { MarkerResolver, apiMessagesFrom, KICKOFF, paceNote } from "./coach";
import type { MessageRecord } from "./types";

const msg = (
  role: "user" | "assistant",
  content: string,
  stage: MessageRecord["stage"] = "NARROW",
  kind: MessageRecord["kind"] = "chat",
): MessageRecord => ({ id: content, role, kind, content, stage, created_at: "" });

/**
 * The stage marker is the one line of every coach reply the app reads
 * instead of the member. It arrives in pieces over the stream.
 */
describe("MarkerResolver", () => {
  it("reads a marker that arrives whole and hides it", () => {
    const r = new MarkerResolver();
    expect(r.push("<<stage:REPLAY>>\nGood, that is a real one.")).toBe("Good, that is a real one.");
    expect(r.stage).toBe("REPLAY");
    expect(r.found).toBe(true);
  });

  it("holds text back until a marker split across chunks is complete", () => {
    const r = new MarkerResolver();
    expect(r.push("<<sta")).toBe("");
    expect(r.push("ge:GA")).toBe("");
    expect(r.push("TE>>\nHere is the shape.")).toBe("Here is the shape.");
    expect(r.stage).toBe("GATE");
  });

  it("gives up waiting once a newline arrives with no marker", () => {
    const r = new MarkerResolver();
    expect(r.push("Locked.\nNow the replay.")).toBe("Locked.\nNow the replay.");
    expect(r.found).toBe(false);
    expect(r.stage).toBeNull();
    // Everything after is passed straight through.
    expect(r.push(" More.")).toBe(" More.");
  });

  it("gives up after enough text to know there is no marker", () => {
    const r = new MarkerResolver();
    const long = "A reply that starts with a long sentence and never marks its stage at all";
    expect(r.push(long)).toBe(long);
    expect(r.found).toBe(false);
  });

  it("flushes held text when the stream ends mid-wait", () => {
    const r = new MarkerResolver();
    expect(r.push("Short.")).toBe("");
    expect(r.finish()).toBe("Short.");
    expect(r.finish()).toBe("");
  });

  it("ignores a marker naming a step that does not exist", () => {
    const r = new MarkerResolver();
    expect(r.push("<<stage:LAUNCH>>\nLet us plan the launch.")).toBe("Let us plan the launch.");
    expect(r.found).toBe(false);
  });
});

describe("paceNote", () => {
  const history = [
    msg("user", "one"),
    msg("assistant", "q1"),
    msg("user", "two"),
    msg("assistant", "q2"),
    msg("user", "three"),
  ];

  it("says nothing while the step still has budget", () => {
    expect(paceNote(history.slice(0, 3), "NARROW", false)).toBe("");
  });

  it("tells the coach to move on once the budget is spent", () => {
    const note = paceNote(history, "NARROW", false);
    expect(note).toContain("exchange 3 in NARROW");
    expect(note).toContain("budget for this step is 3");
  });

  it("spends quicker in quick mode", () => {
    expect(paceNote(history.slice(0, 1), "NARROW", true)).toContain("budget for this step is 1");
  });

  it("does not count skips or other steps as exchanges", () => {
    const mixed = [
      msg("user", "skip", "NARROW", "skip"),
      msg("user", "replay one", "REPLAY"),
      msg("user", "narrow one", "NARROW"),
    ];
    expect(paceNote(mixed, "NARROW", false)).toBe("");
  });

  it("has no budget for the gate", () => {
    expect(paceNote(history, "GATE", false)).toBe("");
  });
});

describe("apiMessagesFrom", () => {
  it("puts the synthetic kickoff before a transcript that starts with the coach", () => {
    const out = apiMessagesFrom([msg("assistant", "Hello"), msg("user", "Hi")], "Hi (note)");
    expect(out[0]).toEqual({ role: "user", content: KICKOFF });
    expect(out[out.length - 1]).toEqual({ role: "user", content: "Hi (note)" });
  });

  it("leaves a transcript that starts with the member alone", () => {
    const out = apiMessagesFrom([msg("user", "I help: designers")], "I help: designers");
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("user");
  });
});
