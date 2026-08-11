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
import { template as authorFunnels } from "./author-funnels";
import { template as authorNotStudied } from "./author-not-studied";
import { template as authorYourHost } from "./author-your-host";
import { template as proofCounter } from "./proof-counter";
import { template as gridQuadrant } from "./grid-quadrant";
import { template as listRuled } from "./list-ruled";
import { template as confirmationBox } from "./confirmation-box";
import { template as faqAccordion } from "./faq-accordion";
import { template as faqOpenColumns } from "./faq-open-columns";
import { template as curriculumDays } from "./curriculum-days";
import { template as bonusPanel } from "./bonus-panel";
import { template as guaranteePanel } from "./guarantee-panel";
import { template as howItWorksStages } from "./how-it-works-stages";
import { template as pricingBestValue } from "./pricing-best-value";
import { template as comparisonColumns } from "./comparison-columns";

export { templateSource, type Template } from "./template";

const BUILT_INS: Template[] = [
  authorMostReviewed,
  authorAbout,
  authorOneDecision,
  authorFunnels,
  authorNotStudied,
  authorYourHost,
  proofCounter,
  gridQuadrant,
  listRuled,
  confirmationBox,
  faqAccordion,
  faqOpenColumns,
  curriculumDays,
  bonusPanel,
  guaranteePanel,
  howItWorksStages,
  pricingBestValue,
  comparisonColumns,
  hero,
  featureCards,
  benefitColumns,
  faq,
  callToAction,
];

export function listTemplates(): Template[] {
  return BUILT_INS;
}
