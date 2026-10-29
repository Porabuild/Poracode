import { describe, expect, it } from "vitest";
import { chatVideoFilePath, isChatVideoSource, readToolVideoSources } from "./chatVideo";
import { rewriteMarkdownLocalImageUrls } from "./markdownLocalImages";

describe("chat video references", () => {
  it.each([
    "`[Watch](videos/demo.mp4)`",
    "``[Watch](videos/demo.mp4)``",
    "```markdown\n[Watch](videos/demo.mp4)\n```",
    "~~~~markdown\n[Watch](videos/demo.mp4)\n~~~~~",
    "```markdown\n[Watch](videos/demo.mp4)",
    "    [Watch](videos/demo.mp4)",
    "`First line\n[Watch](videos/demo.mp4)\nlast line`",
  ])("preserves video link examples inside code: %s", (text) => {
    expect(rewriteMarkdownLocalImageUrls(text, { projectRoot: "/project" })).toBe(text);
    const embed = text.replace("[Watch]", "![Demo]");
    expect(rewriteMarkdownLocalImageUrls(embed, { projectRoot: "/project" })).toBe(embed);
  });
  it.each([
    "/tmp/demo.mp4",
    "C:\\Users\\me\\demo.WEBM",
    "videos/demo.mov",
    "https://example.test/demo.mp4?signature=abc#t=2",
    "file:///C:/demo%20clip.mp4",
    "poracode-local://local/tmp/demo.ogv",
  ])("recognizes video reference %s", (src) => {
    expect(isChatVideoSource(src)).toBe(true);
  });

  it.each([
    "javascript:demo.mp4",
    "data:video/mp4;base64,AAAA",
    "blob:https://host/clip.mp4",
    "ftp://host/demo.mp4",
    "poracode-local://other/tmp/demo.mp4",
    "notes.md",
    "demo.mp4\n",
  ])("refuses unsupported or unsafe source %s", (src) => {
    expect(isChatVideoSource(src)).toBe(false);
  });

  it("recognizes extensionless resources by MIME type and decodes host paths once", () => {
    expect(isChatVideoSource("https://host/download/123", "video/mp4")).toBe(true);
    expect(chatVideoFilePath("file:///C:/clips/100%25%20done.mp4")).toBe("C:/clips/100% done.mp4");
    expect(chatVideoFilePath("file://server/share/demo.mp4")).toBe("//server/share/demo.mp4");
    expect(chatVideoFilePath("poracode-local://local/tmp/%broken.mp4")).toBeUndefined();
  });

  it("reads and deduplicates standard MCP video resources without changing the result", () => {
    const result = {
      content: [
        { type: "resource_link", uri: "file:///tmp/demo.mp4", name: "Demo", mimeType: "video/mp4" },
        { type: "resource", resource: { uri: "file:///tmp/demo.mp4", mimeType: "video/mp4" } },
        { type: "resource_link", uri: "https://host/recording", mimeType: "video/webm" },
        { type: "resource_link", uri: "javascript:demo.mp4", mimeType: "video/mp4" },
        { type: "text", text: "This mentions demo.mp4 but is not a video resource." },
      ],
    };
    const before = structuredClone(result);
    expect(readToolVideoSources(result)).toEqual([
      { src: "file:///tmp/demo.mp4", name: "Demo", mimeType: "video/mp4" },
      { src: "https://host/recording", mimeType: "video/webm" },
    ]);
    expect(result).toEqual(before);
    expect(readToolVideoSources({ ...result, isError: true })).toEqual([]);
    expect(readToolVideoSources({ content: [{ type: "text", text: "Old output" }] })).toEqual([]);
  });

  it("rewrites local video links and embeds without corrupting Windows paths", () => {
    expect(rewriteMarkdownLocalImageUrls("[Watch](C:\\clips\\.hidden\\demo.mp4)")).toBe(
      "[Watch](<poracode-local://local/C:/clips/.hidden/demo.mp4>)",
    );
    expect(rewriteMarkdownLocalImageUrls("![Demo](file:///tmp/my%20clip.mp4)")).toBe(
      "![Demo](<poracode-local://local/tmp/my%20clip.mp4>)",
    );
    expect(
      rewriteMarkdownLocalImageUrls("[Watch](videos/demo.webm)", { projectRoot: "/project" }),
    ).toBe("[Watch](<poracode-local://local/project/videos/demo.webm>)");
    expect(rewriteMarkdownLocalImageUrls("[Watch](videos/demo.webm")).toBe(
      "[Watch](videos/demo.webm",
    );
  });
});
