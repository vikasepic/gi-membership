import { make, type Template } from "./template";

// The closing band: rule, restated promise, the button. No price copy — a
// typed figure would be a claim the checkout might not honour.
export const template: Template = {
  id: "call-to-action",
  name: "Call to action",
  group: "Call to action",
  blocks: [
    make("divider", { width: 30 }, { blockAlign: "center" }),
    make(
      "heading",
      { text: "Restate the promise in one line" },
      { textAlign: "center", blockAlign: "center" },
    ),
    make(
      "text",
      { html: "<p>One sentence that removes the last doubt. Then let the button do its job.</p>" },
      { textAlign: "center" },
    ),
    make("button", {}, { textAlign: "center" }),
  ],
};
