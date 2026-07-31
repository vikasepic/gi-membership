# Upsell (OTO) pages

The one-click upsell at `/checkout/oto`, shown once immediately after payment
when the buyer declined the bump.

It is hosted on the store, not on an external site, and it has to be: the token
in the URL is signed, short-lived and single-use, and tied to one paid order.
That is what stops an upsell price being replayed from a shared link.

## Choosing a layout

**Admin → Offers → *offer* → Upsell page layout.**

| Layout | Leads with | Use when |
|---|---|---|
| **Short** | The offer | It is obvious and cheap — reads in five seconds |
| **Visual** (default) | Image or video | The thing is better shown than described |
| **Long-form** | The argument | It needs justifying after someone has already paid |
| **Custom** | Whatever you code | One launch has to look like nothing else |

Long-form uses **Upsell body copy** (blank line between paragraphs). Visual and
Long-form use **Upsell video URL** if set, otherwise the offer's image.

There is no limit on the number of layouts — each is one component in
`components/oto/templates.tsx`. Three is where it starts because three cover
short, visual and argumentative; a fourth is worth adding when a launch
actually needs one, not before.

## Adding a custom page

1. Write `components/oto/custom/<offer-key>.tsx`, exporting a component that
   takes `{ view }: { view: OtoView }`.
2. Register it in `components/oto/registry.tsx` under the offer's `key`.
3. Set that offer's layout to **Custom** in admin.

A custom page controls layout only. **Use `OtoActions` from
`components/oto/shell.tsx` for accept and decline** — it owns the POST, the
token, and the single-use accept. Layout is worth reinventing per launch; the
money path is not.

Selecting Custom with nothing registered falls back to Visual rather than
rendering a blank page. This page is only ever reached after a successful
payment, so a wrong layout is a bad upsell but a blank page is a support ticket
about a payment that actually worked.

## What every layout shares

- **One click, no card entry.** The card was saved at checkout, so accepting
  charges off-session.
- **The price said plainly**, including what happens when a trial ends.
- **A decline link as easy to find as accept.** Hiding it turns a good offer
  into a dark pattern, and the refund arrives anyway.
- **Single-use token.** Accepting twice is refused, so a bookmarked or shared
  URL cannot charge again.

## Turning it on

The upsell only appears when a product has one attached:
**Admin → Products → *product* → Upsell (one-time offer).** It is skipped
entirely for buyers who took the bump, since they already have it.
