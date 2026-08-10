import { make, type Template } from "./template";

// The opening band: one promise, one line under it, one way in. Copy reads as
// an instruction on purpose — see STARTER_PROPS on why a plausible placeholder
// is worse than an obvious one.
export const template: Template = {
  id: "hero-centred",
  name: "Centred hero",
  group: "Hero",
  blocks: [
    make(
      "heading",
      { text: "Say the one thing this page promises", tag: "h1" },
      { textAlign: "center", blockAlign: "center" },
    ),
    make(
      "text",
      { html: "<p>One or two sentences on who this is for and what changes for them. Plain words beat clever ones here.</p>" },
      { textAlign: "center" },
    ),
    make("button", {}, { textAlign: "center" }),
  ],
};
