import { describe, expect, it } from "vitest";
import { buildPromptContentBlocks, toLocalFileUrl } from "./promptContent";

describe("buildPromptContentBlocks", () => {
  it("keeps text-only prompts as a text block", () => {
    expect(buildPromptContentBlocks("hello")).toEqual([{ kind: "text", text: "hello" }]);
  });

  it("preserves file mentions separately from attachment chips", () => {
    expect(
      buildPromptContentBlocks("check src/app.ts", [
        { kind: "text", content: "check " },
        { kind: "file", path: "src/app.ts" },
        { kind: "attachment", path: "C:\\tmp\\notes.pdf", mimeType: "application/pdf" },
      ]),
    ).toEqual([
      { kind: "text", text: "check " },
      { kind: "file", path: "src/app.ts", name: "app.ts", source: "mention" },
      {
        kind: "file",
        path: "C:\\tmp\\notes.pdf",
        name: "notes.pdf",
        source: "attachment",
      },
    ]);
  });

  it("maps image attachments to local image content blocks", () => {
    expect(
      buildPromptContentBlocks("", [
        { kind: "attachment", path: "C:\\tmp\\shot.png", mimeType: "image/png" },
      ]),
    ).toEqual([
      {
        kind: "image",
        mimeType: "image/png",
        dataUrl: "lightcode-local://local/C:/tmp/shot.png",
        path: "C:\\tmp\\shot.png",
        name: "shot.png",
        source: "attachment",
      },
    ]);
  });
});

describe("toLocalFileUrl", () => {
  it("builds a constant-host URL for a POSIX absolute path", () => {
    expect(toLocalFileUrl("/Users/me/img.png")).toBe("lightcode-local://local/Users/me/img.png");
  });

  it("builds a constant-host URL for a Windows drive path", () => {
    expect(toLocalFileUrl("C:\\Users\\me\\img.png")).toBe(
      "lightcode-local://local/C:/Users/me/img.png",
    );
  });

  // Regression guard for the `standard: true` scheme privilege (commit bd0faf73).
  // Standard/special schemes parse with WHATWG "special authority ignore
  // slashes": leading slashes collapse and the first path segment is consumed
  // as the (lowercased) host. The old `lightcode-local:///<path>` form
  // therefore lost its first path segment — `/Users` on macOS, the drive
  // letter on Windows — so the protocol handler resolved the wrong file and
  // pasted images failed to render. The constant `local` host absorbs that
  // parsing so the real path survives intact in `pathname`. This helper mirrors
  // the resolution in src/main/attachments/localFiles.ts.
  function resolveLikeProtocolHandler(url: string, platform: "darwin" | "win32"): string {
    // lightcode-local is non-special in Node; swap to a special scheme to
    // reproduce Chromium's standard-scheme canonicalization (host extraction).
    const asSpecial = url.replace(/^lightcode-local:/, "https:");
    const raw = decodeURIComponent(new URL(asSpecial).pathname);
    return platform === "win32" && /^\/[A-Za-z]:/.test(raw) ? raw.slice(1) : raw;
  }

  it("round-trips a POSIX path through standard-scheme parsing", () => {
    expect(resolveLikeProtocolHandler(toLocalFileUrl("/Users/me/img.png"), "darwin")).toBe(
      "/Users/me/img.png",
    );
  });

  it("round-trips a path containing spaces", () => {
    const path = "/Users/me/Application Support/img.png";
    expect(resolveLikeProtocolHandler(toLocalFileUrl(path), "darwin")).toBe(path);
  });

  it("round-trips a Windows drive path through standard-scheme parsing", () => {
    expect(resolveLikeProtocolHandler(toLocalFileUrl("C:\\Users\\me\\img.png"), "win32")).toBe(
      "C:/Users/me/img.png",
    );
  });
});
