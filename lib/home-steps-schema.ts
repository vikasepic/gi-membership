import { z } from "zod";

/**
 * The steps the home page sorts the store into (owner, 5 Oct 2026: "Find the
 * idea. Build the product. Get it seen.").
 *
 * In settings, not in a block: an offer and a product each name their step by
 * id from their own admin page, and both home page blocks (the step sections
 * and the staircase) draw the same list. A step's id never changes once made,
 * so renaming or reordering steps moves nothing; deleting one sends its
 * products to "Everything else", which is where an unknown id goes too.
 *
 * No database client here: the settings form needs this in the browser.
 */

export type HomeStep = {
  /** Stable. What offers.home_step and products.home_step hold. */
  id: string;
  /** The one or two words on the staircase. */
  short: string;
  title: string;
  line: string;
};

export const HOME_STEP_ID = /^[a-z0-9-]{1,40}$/;

export const DEFAULT_HOME_STEPS: HomeStep[] = [
  {
    id: "idea",
    short: "Idea",
    title: "Know what to sell",
    line: "Test an idea against your market before you spend a month building it.",
  },
  {
    id: "build",
    short: "Build",
    title: "Build it and sell it",
    line: "Turn what you know into a small product, then the funnel that sells it.",
  },
  {
    id: "seen",
    short: "Get seen",
    title: "Get it seen",
    line: "Content, hooks and posts that bring the right people to what you sell.",
  },
];

const stepSchema = z.object({
  id: z.string().trim().regex(HOME_STEP_ID, "A step id is lowercase letters, digits and hyphens"),
  short: z.string().trim().min(1, "A step needs a name").max(24),
  title: z.string().trim().max(80).default(""),
  line: z.string().trim().max(240).default(""),
});

/**
 * Missing means the three steps above. An empty list is a choice (no steps:
 * everything shows under "Everything else") and is kept as one. A repeated id
 * keeps the first, so one product can never sit in two steps.
 */
export const homeStepsSchema = z
  .array(stepSchema)
  .max(8, "Eight steps at most")
  .transform((steps) => steps.filter((s, i) => steps.findIndex((t) => t.id === s.id) === i))
  .default(() => DEFAULT_HOME_STEPS.map((s) => ({ ...s })));
