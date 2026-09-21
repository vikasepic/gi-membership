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
const VIDEO_FILE = /\.(mp4|webm|ogv|m4v|mov)$/i;

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
  /**
   * Start this many seconds in.
   *
   * Carried in the URL rather than sent as a seek command after load, because
   * a command depends on a handshake that can be missed and leaves the member
   * watching the opening while we retry. A start in the src is applied by the
   * player before the first frame, and "resume" versus "start over" becomes
   * two sources for the same component rather than two timing races.
   */
  startSeconds?: number;
  /**
   * Let the parent page talk to the player.
   *
   * YouTube stays silent unless `enablejsapi` is set, so a lesson that has to
   * report its playhead needs this and a marketing video on a sales page does
   * not. Vimeo needs no equivalent flag.
   */
  jsApi?: boolean;
};

/** Whole, positive seconds, or nothing. A start of 0 is just the start. */
function startAt(seconds: number | undefined): number | null {
  if (!seconds || !Number.isFinite(seconds) || seconds < 1) return null;
  return Math.floor(seconds);
}

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
    const from = startAt(o.startSeconds);
    if (from) q.set("start", String(from));
    if (o.jsApi) q.set("enablejsapi", "1");
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
    // Vimeo takes its start time as a fragment, not a query parameter.
    const from = startAt(o.startSeconds);
    return {
      kind: "iframe",
      src: `https://player.vimeo.com/video/${id}?${q}${from ? `#t=${from}s` : ""}`,
      provider: "Vimeo",
    };
  }

  // A self-hosted file. https only — a video element on an https page will not
  // load http anyway, and accepting the scheme would only hide the failure.
  if (/^https:\/\//i.test(raw)) return { kind: "file", src: raw };
  return null;
}

/**
 * Which provider a pasted link belongs to, or null for one we will not frame.
 *
 * A course lesson stores only a URL, with no separate "source" field beside
 * it, so the provider has to be recognised from the link itself. Recognised
 * means parsed: an id we can read out of a host we allow. Anything else is
 * refused, because an <iframe> on a lesson page hands a third party a window
 * inside the paid area of the store.
 *
 * Loom is deliberately absent. It cannot report playback position to the
 * parent page, so a Loom lesson could never resume or complete on its own,
 * and the form used to promise it while the embed builder had never
 * supported it.
 */
export function videoSourceOf(url: string): VideoSource | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  if (youtubeId(raw)) return "youtube";
  if (vimeoId(raw)) return "vimeo";
  // A self-hosted file has to look like a file. Accepting any https link here
  // turns a pasted share page — Loom, Wistia, a Drive link — into a <video>
  // element pointed at an HTML document, which renders as a broken player
  // with no error anyone can act on.
  const u = parsed(raw);
  if (u && u.protocol === "https:" && VIDEO_FILE.test(u.pathname)) return "file";
  return null;
}

/** The embed for a pasted lesson link, provider and all. Null if unsupported. */
export function lessonVideo(url: string, o: EmbedOptions = {}): VideoEmbed {
  const source = videoSourceOf(url);
  return source ? videoEmbed(source, url, o) : null;
}
