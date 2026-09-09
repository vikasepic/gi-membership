// Client-safe constants shared by the UI and the server. The prompts
// themselves live in prompts.ts, which only server code imports.

export const STAGES = [
  "NARROW",
  "REPLAY",
  "NAME",
  "PROVE",
  "EQUIP",
  "GATE",
  "READY",
  "STOP",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  NARROW: "Narrowing the problem",
  REPLAY: "Replaying a real case",
  NAME: "Naming the framework",
  PROVE: "Getting the proof story",
  EQUIP: "Collecting the tools",
  GATE: "At the gate",
  READY: "Ready to build",
  STOP: "Closed",
};

/** Exchanges the coach gets per step before the app tells it to move on. */
export const STAGE_BUDGETS: Partial<Record<Stage, number>> = {
  NARROW: 3,
  REPLAY: 4,
  NAME: 3,
  PROVE: 2,
  EQUIP: 2,
};

/** Quick mode: about six answers to the gate. */
export const STAGE_BUDGETS_QUICK: Partial<Record<Stage, number>> = {
  NARROW: 1,
  REPLAY: 2,
  NAME: 1,
  PROVE: 1,
  EQUIP: 1,
};

/** Stored as the user's message when they press Skip. */
export const SKIP_MESSAGE =
  "Skip this step. Fill in what is still missing with your best guess from what I have said, mark each guess, and move on to the next step.";

export const SKIPPABLE_STAGES: Stage[] = ["NARROW", "REPLAY", "NAME", "PROVE", "EQUIP"];

export const FOLLOWUP_KINDS = ["pack"] as const;
export type FollowupKind = (typeof FOLLOWUP_KINDS)[number];

export const DOCUMENT_TITLES: Record<FollowupKind | "guide", string> = {
  guide: "The guide",
  pack: "Worksheet pack",
};

/** Limits for the intake form, enforced on the server too. */
export const INTAKE_LIMITS = { who: 200, what: 300, last: 600 } as const;

/** The longest reply the composer accepts, enforced on the server too. */
export const MAX_MESSAGE_CHARS = 6000;
