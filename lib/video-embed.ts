// Turning a pasted video link into something we are willing to frame.
//
// An <iframe> hands a third party a window inside a page that also takes card
// details, so the provider is decided by us and never by the URL. Anything we
// do not recognise returns null and the block renders its poster instead of
// framing an unknown origin.

export type VideoSource = "youtube" | "vimeo" | "file";

export type VideoEmbed =
  | { kind: "iframe"; src: string; provider: "YouTube" | "Vimeo" }
  | { kind: "file"; src: string }
  | null;

const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

/**
 * Hosts, checked as hosts.
 *
 * Searching the string for "vimeo.com/" instead matches anything that merely
 * contains it — `//player.vimeo.com/…` with no scheme, or an unrelated URL
 * carrying it in a query string. Parsing and comparing the hostname is the
 * only version of this that says what it means.
 */
const YOUTUBE_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com",
  "youtu.be", "www.youtu.be",
  "youtube-nocookie.com", "www.youtube-nocookie.com",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

function parsed(url: string): URL | null {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** The id out of any of the shapes YouTube hands people. */
export function youtubeId(url: string): string | null {
  const u = parsed(url);
  if (u) {
    if (!YOUTUBE_HOSTS.has(u.hostname.toLowerCase())) return null;
    const v = u.searchParams.get("v");
    if (v && YOUTUBE_ID.test(v)) return v;
    const segments = u.pathname.split("/").filter(Boolean);
    // youtu.be/ID, and /embed/ID, /shorts/ID, /live/ID on the main host.
    const last = segments[segments.length - 1];
    if (last && YOUTUBE_ID.test(last)) return last;
    return null;
  }
  const bare = url.trim();
  return YOUTUBE_ID.test(bare) ? bare : null;
}

export function vimeoId(url: string): string | null {
  const u = parsed(url);
  if (u) {
    if (!VIMEO_HOSTS.has(u.hostname.toLowerCase())) return null;
    const segments = u.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    return last && VIMEO_ID.test(last) ? last : null;
  }
  const bare = url.trim();
  return VIMEO_ID.test(bare) ? bare : null;
}

export type EmbedOptions = {
  autoplay?: boolean;
  mute?: boolean;
  loop?: boolean;
  controls?: boolean;
};

/**
 * Options are appended by us from typed booleans rather than passed through
 * from the pasted URL, so a query string in the link cannot smuggle a
 * parameter we did not intend.
 */
export function videoEmbed(source: VideoSource, url: string, o: EmbedOptions = {}): VideoEmbed {
  const raw = (url ?? "").trim();
  if (!raw) return null;

  if (source === "youtube") {
    const id = youtubeId(raw);
    if (!id) return null;
    const q = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
      controls: o.controls === false ? "0" : "1",
    });
    if (o.autoplay) q.set("autoplay", "1");
    // Autoplay without mute is blocked by every browser, so the video simply
    // does not start. Muting is what makes the switch mean something.
    if (o.mute || o.autoplay) q.set("mute", "1");
    if (o.loop) {
      q.set("loop", "1");
      q.set("playlist", id);
    }
    return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}?${q}`, provider: "YouTube" };
  }

  if (source === "vimeo") {
    const id = vimeoId(raw);
    if (!id) return null;
    const q = new URLSearchParams({ dnt: "1" });
    if (o.autoplay) q.set("autoplay", "1");
    if (o.mute || o.autoplay) q.set("muted", "1");
    if (o.loop) q.set("loop", "1");
    if (o.controls === false) q.set("controls", "0");
    return { kind: "iframe", src: `https://player.vimeo.com/video/${id}?${q}`, provider: "Vimeo" };
  }

  // A self-hosted file. https only — a video element on an https page will not
  // load http anyway, and accepting the scheme would only hide the failure.
  if (/^https:\/\//i.test(raw)) return { kind: "file", src: raw };
  return null;
}
