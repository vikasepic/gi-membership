export interface Hook {
  style: string;
  hook: string;
  on_screen: string | null;
  why_it_stops_the_scroll: string;
}

export interface GenerationResult {
  assumed_audience: string | null;
  hooks: Hook[];
}

export type HookFormat = "carousel" | "reel";

export interface GenerationRecord {
  id: string;
  post_idea: string;
  niche: string | null;
  audience: string | null;
  format: HookFormat;
  tone: string | null;
  hooks: GenerationResult;
  created_at: string;
}
