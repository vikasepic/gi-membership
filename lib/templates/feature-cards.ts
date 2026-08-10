import { make, type Template } from "./template";

// A heading over the three-card grid the cards block already starts with.
export const template: Template = {
  id: "feature-cards",
  name: "Feature cards",
  group: "Features",
  blocks: [
    make("heading", { text: "Three things they get" }, { textAlign: "center" }),
    make(
      "text",
      { html: "<p>One line that frames the three cards below.</p>" },
      { textAlign: "center" },
    ),
    make("cards", { numbered: true }),
  ],
};
