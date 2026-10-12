import { describe, expect, it } from "vitest";
import { fileMediaType, isSvgFile } from "./fileMedia";
import { mimeForPath } from "./promptContent";

describe("editor media classification", () => {
  it("reuses attachment MIME types with case-insensitive Windows and POSIX extensions", () => {
    for (const [path, kind, mime] of [
      ["C:\\project\\IMAGE.PNG", "image", "image/png"],
      ["/project/clip.MP4", "video", "video/mp4"],
      ["clip.wav", "audio", "audio/wav"],
      ["clip.aac", "audio", "audio/aac"],
      ["clip.opus", "audio", "audio/opus"],
      ["clip.oga", "audio", "audio/ogg"],
    ] as const) {
      expect(fileMediaType(path)).toEqual({ kind, mime });
      expect(mimeForPath(path)).toBe(mime);
    }
  });
  it("keeps SVG source/PDF handoff and inherited object names outside streamed media", () => {
    for (const path of [
      "icon.svg",
      "file.pdf",
      "clip.constructor",
      "clip.__proto__",
      "no-extension",
    ])
      expect(fileMediaType(path)).toBeNull();
    expect(isSvgFile("ICON.SVG")).toBe(true);
    expect(mimeForPath("clip.__proto__")).toBeUndefined();
  });
});
