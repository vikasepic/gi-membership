import type { ChannelBadge as Badge } from "@/lib/library-apps";

/**
 * A channel an app can grant, in its own colours when the member has it and
 * greyed with a lock when they don't. "Instagram" in small grey text left
 * Instagram-only members unsure whether LinkedIn came with it (5 Oct 2026).
 *
 * Told apart by lightness and by the words "Included" / "Not in your plan",
 * not by colour alone.
 */

const INSTAGRAM = "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)";
const LINKEDIN = "#0a66c2";
const OFF = "#b3aea4";

/** The channel's mark: Instagram's camera glyph, LinkedIn's "in". */
function Mark({ channel, included }: { channel: string; included: boolean }) {
  const background = !included ? OFF : channel === "instagram" ? INSTAGRAM : channel === "linkedin" ? LINKEDIN : "var(--navy)";
  return (
    <span aria-hidden className="grid size-[34px] shrink-0 place-items-center rounded-[11px] text-white" style={{ background }}>
      {channel === "instagram" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="3" y="3" width="18" height="18" rx="5.5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      ) : channel === "linkedin" ? (
        <span className="font-display text-[15px] font-extrabold leading-none tracking-[-0.04em]">in</span>
      ) : (
        <span className="font-display text-sm font-bold">{channel.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}

export function ChannelBadge({ badge }: { badge: Badge }) {
  if (badge.included) {
    return (
      <span className="inline-flex min-h-[46px] items-center gap-2.5 rounded-full border border-border bg-surface py-1.5 pl-1.5 pr-4">
        <Mark channel={badge.channel} included />
        <span className="font-display text-[15px] font-semibold text-fg">{badge.label}</span>
        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#1f6b45]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          Included
        </span>
      </span>
    );
  }
  const body = (
    <>
      <Mark channel={badge.channel} included={false} />
      <span className="font-display text-[15px] font-semibold text-muted">{badge.label}</span>
      <span className="inline-flex items-center gap-1 text-[13px] text-muted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        Not in your plan
      </span>
    </>
  );
  const shape = "inline-flex min-h-[46px] items-center gap-2.5 rounded-full border border-dashed border-[#c9c3b8] bg-surface-2 py-1.5 pl-1.5 pr-4";
  // The greyed badge is where the eye lands, so it is the way in too.
  return badge.addHref ? (
    <a href={badge.addHref} className={`${shape} transition-colors hover:border-primary`}>
      {body}
    </a>
  ) : (
    <span className={shape}>{body}</span>
  );
}
