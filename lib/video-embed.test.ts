import { describe, it, expect } from "vitest";
import { videoEmbed, youtubeId, vimeoId, type VideoEmbed } from "@/lib/video-embed";

/** The framed src, or "" for anything we refused to frame. */
const src = (e: VideoEmbed): string => (e && e.kind === "iframe" ? e.src : "");

describe("youtubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=aqz-KE-bpKQ", "aqz-KE-bpKQ"],
    ["https://youtube.com/watch?list=PL1&v=aqz-KE-bpKQ", "aqz-KE-bpKQ"],
    ["https://youtu.be/aqz-KE-bpKQ", "aqz-KE-bpKQ"],
    ["https://www.youtube.com/embed/aqz-KE-bpKQ", "aqz-KE-bpKQ"],
    ["https://www.youtube.com/shorts/aqz-KE-bpKQ", "aqz-KE-bpKQ"],
    ["https://www.youtube.com/live/aqz-KE-bpKQ", "aqz-KE-bpKQ"],
    ["aqz-KE-bpKQ", "aqz-KE-bpKQ"],
  ])("reads %s", (url, id) => {
    expect(youtubeId(url)).toBe(id);
  });

  it("returns null for something that is not a YouTube link", () => {
    for (const url of ["", "https://evil.test/watch?v=aqz-KE-bpKQ_x", "https://vimeo.com/76979871", "nonsense"]) {
      expect(youtubeId(url)).toBeNull();
    }
  });
});

describe("vimeoId", () => {
  it.each([
    ["https://vimeo.com/76979871", "76979871"],
    ["https://vimeo.com/video/76979871", "76979871"],
    ["https://vimeo.com/channels/staffpicks/76979871", "76979871"],
    ["76979871", "76979871"],
  ])("reads %s", (url, id) => {
    expect(vimeoId(url)).toBe(id);
  });

  it("returns null for a non-Vimeo link", () => {
    expect(vimeoId("https://youtu.be/aqz-KE-bpKQ")).toBeNull();
  });
});

describe("videoEmbed — we choose the origin, never the URL", () => {
  it("frames YouTube on the no-cookie host", () => {
    const e = videoEmbed("youtube", "https://youtu.be/aqz-KE-bpKQ");
    expect(e).toMatchObject({ kind: "iframe", provider: "YouTube" });
    expect(src(e).startsWith("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?")).toBe(true);
  });

  it("frames Vimeo with do-not-track on", () => {
    const e = videoEmbed("vimeo", "https://vimeo.com/76979871");
    expect(src(e).startsWith("https://player.vimeo.com/video/76979871?")).toBe(true);
    expect(src(e)).toContain("dnt=1");
  });

  it("refuses a link from a host we do not recognise", () => {
    // The point of the whole module: an iframe hands a third party a window
    // into a page that takes card details.
    for (const url of [
      "https://evil.test/embed/x",
      "https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ",
      "javascript:alert(1)",
      "//player.vimeo.com/video/76979871",
    ]) {
      expect(videoEmbed("youtube", url)).toBeNull();
      expect(videoEmbed("vimeo", url)).toBeNull();
    }
  });

  it("returns null for an empty link rather than an empty iframe", () => {
    expect(videoEmbed("youtube", "")).toBeNull();
    expect(videoEmbed("file", "   ")).toBeNull();
  });

  it("mutes whenever it autoplays, because otherwise it silently will not start", () => {
    const yt = videoEmbed("youtube", "https://youtu.be/aqz-KE-bpKQ", { autoplay: true, mute: false });
    expect(src(yt)).toContain("mute=1");
    const vm = videoEmbed("vimeo", "https://vimeo.com/76979871", { autoplay: true, mute: false });
    expect(src(vm)).toContain("muted=1");
  });

  it("loops by repeating the id, which is what YouTube requires", () => {
    const e = videoEmbed("youtube", "https://youtu.be/aqz-KE-bpKQ", { loop: true });
    expect(src(e)).toContain("playlist=aqz-KE-bpKQ");
  });

  it("turns controls off when asked", () => {
    const e = videoEmbed("youtube", "https://youtu.be/aqz-KE-bpKQ", { controls: false });
    expect(src(e)).toContain("controls=0");
  });

  it("does not carry parameters through from the pasted link", () => {
    // Options come from typed booleans, so a crafted query string cannot set
    // something we never offered.
    const e = videoEmbed("youtube", "https://www.youtube.com/watch?v=aqz-KE-bpKQ&enablejsapi=1&origin=evil.test");
    expect(src(e)).not.toContain("enablejsapi");
    expect(src(e)).not.toContain("evil.test");
  });

  it("takes an https file, and refuses http", () => {
    expect(videoEmbed("file", "https://cdn.test/a.mp4")).toEqual({ kind: "file", src: "https://cdn.test/a.mp4" });
    expect(videoEmbed("file", "http://cdn.test/a.mp4")).toBeNull();
  });
});

describe("hosts are checked as hosts, not as substrings", () => {
  it("refuses a protocol-relative link", () => {
    expect(vimeoId("//player.vimeo.com/video/76979871")).toBeNull();
    expect(youtubeId("//youtu.be/aqz-KE-bpKQ")).toBeNull();
  });

  it("refuses a lookalike host", () => {
    for (const url of [
      "https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ",
      "https://notyoutube.com/watch?v=aqz-KE-bpKQ",
      "https://vimeo.com.evil.test/76979871",
      "https://evil.test/vimeo.com/76979871",
    ]) {
      expect(youtubeId(url)).toBeNull();
      expect(vimeoId(url)).toBeNull();
    }
  });

  it("refuses an id smuggled in a query string on another host", () => {
    expect(vimeoId("https://evil.test/?next=vimeo.com/video/76979871")).toBeNull();
    expect(youtubeId("https://evil.test/?next=youtube.com/watch?v=aqz-KE-bpKQ")).toBeNull();
  });

  it("still takes the real hosts, including m. and nocookie", () => {
    expect(youtubeId("https://m.youtube.com/watch?v=aqz-KE-bpKQ")).toBe("aqz-KE-bpKQ");
    expect(youtubeId("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ")).toBe("aqz-KE-bpKQ");
    expect(vimeoId("https://player.vimeo.com/video/76979871")).toBe("76979871");
  });

  it("refuses a non-http scheme that still parses", () => {
    expect(youtubeId("ftp://youtu.be/aqz-KE-bpKQ")).toBeNull();
  });
});
