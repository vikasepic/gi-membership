import { make, rowOf, type Template } from "./template";

// Two columns of ticked lines — the "what you get" band. A row and two icon
// lists, nothing that needed a new block.
export const template: Template = {
  id: "benefit-columns",
  name: "Benefits in two columns",
  group: "Features",
  blocks: [
    make("heading", { text: "Everything that comes with it" }, { textAlign: "center" }),
    rowOf([[make("iconlist")], [make("iconlist")]]),
  ],
};
