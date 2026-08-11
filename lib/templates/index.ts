// The shelf. One list the popup reads, however a template came to exist —
// built-ins from these files now, owner-saved rows from the database in a
// later phase, behind this same function.

import type { Template } from "./template";
import { template as hero } from "./hero";
import { template as featureCards } from "./feature-cards";
import { template as benefitColumns } from "./benefit-columns";
import { template as faq } from "./faq";
import { template as callToAction } from "./call-to-action";
import { template as authorMostReviewed } from "./author-most-reviewed";
import { template as authorAbout } from "./author-about";
import { template as authorOneDecision } from "./author-one-decision";

export { templateSource, type Template } from "./template";

const BUILT_INS: Template[] = [
  authorMostReviewed,
  authorAbout,
  authorOneDecision,
  hero,
  featureCards,
  benefitColumns,
  faq,
  callToAction,
];

export function listTemplates(): Template[] {
  return BUILT_INS;
}
