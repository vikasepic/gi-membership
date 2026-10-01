import { viewer, isViewingAs } from "@/lib/view-as";
import { getOffer } from "@/lib/store";
import { offerHref } from "@/lib/offer-link";
import { recordOfferClick } from "@/lib/member-activity";

/**
 * The library card's link: record the click, then send the member to the
 * offer's own page. The checkout there is the same as anyone else's.
 *
 * This replaced a one-tap charge on the saved card (removed 1 Oct 2026): a
 * trial started that way billed on its own a week later, and nothing had
 * recorded the tap. One tap is for upsells only, where the buyer has just
 * paid and is still at the till.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // A relative Location, as the offer checkout's return route does: behind
  // the proxy req.url is the container's own address (seen 1 Oct 2026 as a
  // redirect to https://0.0.0.0:3000/login).
  const go = (path: string) => new Response(null, { status: 303, headers: { Location: path } });
  const user = await viewer();
  if (!user) return go("/login");
  const offer = await getOffer((await ctx.params).id);
  if (!offer) return go("/library");
  // An admin browsing as the member goes through, but leaves no track in
  // the member's name.
  if (!(await isViewingAs())) {
    await recordOfferClick({ userId: user.id, offerId: offer.id, userAgent: req.headers.get("user-agent") });
  }
  return go(await offerHref(offer));
}
