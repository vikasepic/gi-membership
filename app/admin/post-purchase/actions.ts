"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { saveInputSchema, saveProblem, saveSequence } from "@/lib/post-purchase-store";
import { renderPostPurchaseEmail } from "@/lib/post-purchase-render";
import { sendEmail } from "@/lib/email";
import { getSettingsOrDefaults } from "@/lib/settings";

export async function savePostPurchaseAction(input: unknown) {
  await requireAdmin();
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Something in this sequence is out of range. Check the widths, sizes and delays." };
  const res = await saveSequence(parsed.data);
  if (res.ok) revalidatePath(parsed.data.ownerType === "offer" ? `/admin/offers/${parsed.data.ownerId}` : `/admin/products/${parsed.data.ownerId}`);
  return res;
}

const testSchema = z.object({ sequence: saveInputSchema, index: z.number().int().min(0).max(19), ownerName: z.string().max(200) });

/** The selected email, as drafted, to the admin's own address with sample details. */
export async function sendPostPurchaseTestAction(input: unknown) {
  const admin = await requireAdmin();
  const parsed = testSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "That email could not be read. Save and try again." };
  const { sequence, index, ownerName } = parsed.data;
  const email = sequence.emails[index];
  if (!email) return { ok: false as const, error: "Choose an email to test." };
  const problem = saveProblem({ ...sequence, emails: [email] });
  if (problem) return { ok: false as const, error: problem.replace("Email 1", `Email ${index + 1}`) };
  const to = admin.email;
  if (!to) return { ok: false as const, error: "Your admin account has no email address." };
  const settings = (await getSettingsOrDefaults()).postPurchaseEmail;
  const mail = renderPostPurchaseEmail({
    doc: email.doc,
    subject: `[Test] ${email.subject}`,
    preheader: email.preheader,
    layout: sequence.layout,
    vars: { first_name: "Priya", offer_name: ownerName, access_link: settings.accessUrl },
    stopUrl: index > 0 ? `${settings.accessUrl}#test-stop-link` : null,
  });
  const res = await sendEmail(to, mail, { from: settings.senderName ? `${settings.senderName} <${settings.senderEmail}>` : settings.senderEmail, replyTo: settings.replyTo });
  if (res !== "sent") return { ok: false as const, error: res === "disabled" ? "Email sending is not set up on this server." : "The email provider refused it. Try again in a minute." };
  return { ok: true as const, to };
}
