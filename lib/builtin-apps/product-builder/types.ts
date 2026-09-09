import type { Stage } from "./stages";

/** The product taking shape, one section per coaching step. */
export interface ShapeNarrow {
  who: string;
  when: string;
  stuck: string;
  want: string;
  sentence: string;
}
export interface ShapeReplay {
  client: string;
  sequence: string[];
  earned: string[];
}
export interface ShapeFramework {
  name: string;
  steps: string[];
}
export interface ShapeStory {
  stuck: string;
  turn: string;
  result: string;
  tell: string;
}
export interface ShapeEquip {
  mistakes: string[];
  questions: string[];
  fill_ins: string[];
  finished: string;
}
export interface ShapeGate {
  buyer: string;
  problem: string;
  promise: string;
  tools: string[];
  titles: string[];
  chosen_title: string | null;
}
export interface Shape {
  narrow: ShapeNarrow | null;
  replay: ShapeReplay | null;
  framework: ShapeFramework | null;
  story: ShapeStory | null;
  equip: ShapeEquip | null;
  gate: ShapeGate | null;
}

export interface SessionRecord {
  id: string;
  title: string;
  stage: Stage;
  quick: boolean;
  shape: Shape | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  id: string;
  role: "user" | "assistant";
  kind: "chat" | "skip";
  content: string;
  stage: Stage | null;
  created_at: string;
}

export type DocumentKind = "guide" | "pack";

export interface DocumentRecord {
  id: string;
  kind: DocumentKind;
  title: string;
  content: string;
  truncated: boolean;
  created_at: string;
}

/** Server-sent events emitted by the streaming routes. */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "stage"; stage: Stage }
  | { type: "shape"; shape: Shape }
  | { type: "message"; message: MessageRecord }
  | { type: "document"; document: DocumentRecord }
  | { type: "done" }
  | { type: "error"; code: string };
