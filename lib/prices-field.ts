import { z } from "zod";

/**
 * The ways to pay, as posted by the editor.
 *
 * ONE schema, used by the offer form and the product form. Every rule here is
 * a rule the database also states as a CHECK — a save that gets past this and
 * fails there arrives as a bare Postgres message about a constraint nobody can
 * find. Two copies of these rules would be two chances for one of them to be
 * the weaker, and the weaker one is what somebody's billing goes through.
 */
export const pricesField = z
  .string()
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "The prices could not be read. Reload and try again." });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(
        z
          .object({
            id: z.string().default(""),
            label: z.string().default(""),
            billingType: z.enum(["one_time", "recurring"]),
            interval: z.enum(["day", "week", "month", "year"]).nullable().default(null),
            intervalCount: z.coerce.number().int().min(1).default(1),
            trialDays: z.coerce.number().int().min(0).nullable().default(null),
            priceCents: z.coerce.number().int().min(0),
            compareAtCents: z.coerce.number().int().min(0).nullable().default(null),
            archived: z.boolean().default(false),
          })
          .refine((p) => p.billingType !== "recurring" || p.interval !== null, {
            message: "A recurring price needs an interval",
          })
          .refine((p) => p.billingType !== "one_time" || p.trialDays === null, {
            message: "A one-off purchase has nothing to trial",
          })
          .refine((p) => p.compareAtCents === null || p.compareAtCents >= p.priceCents, {
            message: "A was-price below the price reads as a markup",
          }),
      )
      .min(1, "This needs a way to pay")
      .refine((list) => list.some((p) => !p.archived), {
        message: "At least one way to pay has to be showing",
      }),
  );
