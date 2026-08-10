import { make, type Template } from "./template";

// The FAQ block's own starter questions under a heading. The starter copy
// already reads as an instruction, which is the rule for placeholders.
export const template: Template = {
  id: "faq-accordion",
  name: "FAQ",
  group: "FAQ",
  blocks: [
    make("heading", { text: "Questions people ask before buying" }, { textAlign: "center" }),
    make("faq"),
  ],
};
