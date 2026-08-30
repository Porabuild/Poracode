import { describe, expect, it } from "vitest";
import {
  buildPromptContentBlocks,
  formatDiffCommentPrompt,
  isAudioPath,
  isPdfPath,
  mimeForPath,
  resolveLocalFileUrlPath,
  toFileUrl,
  toLocalFileUrl,
} from "./promptContent";

describe("attachment MIME inference", () => {
  it("recognizes ACP audio and embedded-resource MIME types", () => {
    expect(isAudioPath("recording.mp3")).toBe(true);
    expect(isAudioPath("recording.bin", "audio/flac")).toBe(true);
    expect(mimeForPath("recording.m4a")).toBe("audio/mp4");
    expect(mimeForPath("notes.md")).toBe("text/markdown");
    expect(mimeForPath("component.tsx")).toBe("text/plain");
    expect(mimeForPath("workflow.yaml")).toBe("text/plain");
    expect(mimeForPath("brief.pdf")).toBe("application/pdf");
  });
});

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
        mimeType: "application/pdf",
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
        dataUrl: "poracode-local://local/C:/tmp/shot.png",
        path: "C:\\tmp\\shot.png",
        name: "shot.png",
        source: "attachment",
      },
    ]);
  });

  it("preserves skill segments for user-message rendering", () => {
    expect(
      buildPromptContentBlocks("Use the review-code skill.", [
        {
          kind: "skill",
          name: "review-code",
          path: "/home/me/.agents/skills/review-code/SKILL.md",
          invocation: "Use the review-code skill.",
          provider: "Gemini",
          scope: "global",
        },
      ]),
    ).toEqual([
      {
        kind: "skill",
        name: "review-code",
        invocation: "Use the review-code skill.",
      },
    ]);
  });

  it("preserves plugin identity on canonical skill blocks", () => {
    expect(
      buildPromptContentBlocks("$github", [
        {
          kind: "skill",
          name: "github",
          path: "/plugins/github/skills/github/SKILL.md",
          invocation: "$github",
          provider: "GitHub",
          scope: "global",
          pluginId: "github",
          pluginName: "GitHub",
        },
      ]),
    ).toEqual([
      {
        kind: "skill",
        name: "github",
        invocation: "$github",
        pluginId: "github",
        pluginName: "GitHub",
      },
    ]);
  });

  it("preserves diff comments for badge rendering and formats provider text", () => {
    const comment = {
      kind: "diff_comment" as const,
      path: "src/app.ts",
      lineNumber: 42,
      side: "new" as const,
      staged: false,
      body: "Handle the empty state.",
    };

    expect(buildPromptContentBlocks("", [comment])).toEqual([comment]);
    expect(formatDiffCommentPrompt(comment)).toBe(
      "Review comment on src/app.ts:+42 (unstaged):\nHandle the empty state.",
    );
  });

  it("preserves MCP mention segments as mcp blocks for badge rendering", () => {
    expect(
      buildPromptContentBlocks("@Browser open the page", [
        { kind: "mcp", id: "browser", name: "Browser" },
        { kind: "text", content: " open the page" },
      ]),
    ).toEqual([
      { kind: "mcp", name: "Browser" },
      { kind: "text", text: " open the page" },
    ]);
  });
});

describe("toFileUrl", () => {
  it("builds a file URL for a POSIX absolute path", () => {
    expect(toFileUrl("/Users/me/Biometric Reuse.pdf")).toBe(
      "file:///Users/me/Biometric%20Reuse.pdf",
    );
  });

  it("builds a file URL for a Windows drive path", () => {
    expect(toFileUrl("C:\\Users\\me\\Biometric Reuse.pdf")).toBe(
      "file:///C:/Users/me/Biometric%20Reuse.pdf",
    );
  });

  it("builds a file URL for a WSL UNC path", () => {
    expect(toFileUrl("\\\\wsl.localhost\\Ubuntu\\home\\me\\doc.pdf")).toBe(
      "file://wsl.localhost/Ubuntu/home/me/doc.pdf",
    );
  });
});

describe("toLocalFileUrl", () => {
  it("builds a constant-host URL for a POSIX absolute path", () => {
    expect(toLocalFileUrl("/Users/me/img.png")).toBe("poracode-local://local/Users/me/img.png");
  });

  it("builds a constant-host URL for a Windows drive path", () => {
    expect(toLocalFileUrl("C:\\Users\\me\\img.png")).toBe(
      "poracode-local://local/C:/Users/me/img.png",
    );
  });

  it("percent-encodes path segments that contain literal percent signs", () => {
    // Grok session dirs are named with URL-encoded worktree paths on disk.
    const path = "C:\\Users\\me\\.grok\\sessions\\E%3A%5Cwork%5Crepo\\assets\\shot.png";
    expect(toLocalFileUrl(path)).toBe(
      "poracode-local://local/C:/Users/me/.grok/sessions/E%253A%255Cwork%255Crepo/assets/shot.png",
    );
  });

  // Regression guard for the `standard: true` scheme privilege (commit bd0faf73).
  // Standard/special schemes parse with WHATWG "special authority ignore
  // slashes": leading slashes collapse and the first path segment is consumed
  // as the (lowercased) host. The old `poracode-local:///<path>` form
  // therefore lost its first path segment — `/Users` on macOS, the drive
  // letter on Windows — so the protocol handler resolved the wrong file and
  // pasted images failed to render. The constant `local` host absorbs that
  // parsing so the real path survives intact in `pathname`.
  function resolveLikeProtocolHandler(url: string, platform: "darwin" | "win32"): string {
    // poracode-local is non-special in Node; swap to a special scheme to
    // reproduce Chromium's standard-scheme canonicalization (host extraction).
    const asSpecial = url.replace(/^poracode-local:/, "https:");
    return resolveLocalFileUrlPath(asSpecial, platform);
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

  it("round-trips a Windows path with literal percent-encoded folder names", () => {
    // Without segment encoding, decodeURIComponent would turn E%3A into E:
    // and the protocol handler would look up a non-existent path.
    const path =
      "C:/Users/me/.grok/sessions/E%3A%5Cwork%5C.poracode%5Cworktrees%5Crepo/assets/img.png";
    expect(resolveLikeProtocolHandler(toLocalFileUrl(path), "win32")).toBe(path);
  });
});

describe("isPdfPath", () => {
  it("recognizes PDF MIME types and file extensions", () => {
    expect(isPdfPath("C:\\tmp\\document.PDF")).toBe(true);
    expect(isPdfPath("C:\\tmp\\document.bin", "application/pdf")).toBe(true);
    expect(isPdfPath("C:\\tmp\\document.txt", "text/plain")).toBe(false);
  });
});
