import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import {
  buildOpenCodePromptParts,
  buildOpenCodeTextFallbackParts,
  shouldRetryOpenCodePromptWithTextFallback,
  type OpenCodePromptPart,
} from "./promptParts";

const posixProject: ProjectLocation = { kind: "posix", path: "/repo" };

describe("buildOpenCodePromptParts", () => {
  it("resolves Windows relative file mentions against the project root", () => {
    const parts = buildOpenCodePromptParts(
      "inspect file",
      [
        { kind: "text", content: "inspect " },
        { kind: "file", path: "tmp_osc9_scan.py" },
      ],
      { kind: "windows", path: "C:\\Users\\demo\\repo" },
    );

    expect(parts).toEqual([
      { type: "text", text: "inspect " },
      {
        type: "file",
        mime: "text/plain",
        filename: "tmp_osc9_scan.py",
        url: expect.stringContaining("C"),
      },
    ]);
    expect(parts[1]?.type === "file" ? parts[1].url : "").toContain("repo");
    expect(parts[1]?.type === "file" ? parts[1].url : "").toContain("tmp_osc9_scan.py");
  });

  it("resolves WSL relative and UNC file mentions to Linux file URLs", () => {
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      uncPath: "\\\\wsl$\\Ubuntu\\home\\demo\\repo",
      linuxPath: "/home/demo/repo",
    };

    expect(
      buildOpenCodePromptParts(
        "inspect files",
        [
          { kind: "file", path: "src/main.ts" },
          { kind: "file", path: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\shared.ts" },
        ],
        location,
      ),
    ).toEqual([
      {
        type: "file",
        mime: "text/plain",
        filename: "main.ts",
        url: "file:///home/demo/repo/src/main.ts",
      },
      {
        type: "file",
        mime: "text/plain",
        filename: "shared.ts",
        url: "file:///home/demo/shared.ts",
      },
    ]);
  });

  it("normalizes text-like attachments and keeps unknown files out of file parts", () => {
    const parts = buildOpenCodePromptParts(
      "Finish refactoring",
      [
        { kind: "text", content: "Use the attached context file.\n\n" },
        { kind: "file", path: "README.md" },
        { kind: "attachment", path: "/tmp/handoff-context.md", mimeType: "text/markdown" },
        { kind: "attachment", path: "/tmp/package.json", mimeType: "application/json" },
        { kind: "attachment", path: "artifact.unknown" },
      ],
      posixProject,
    );

    expect(parts).toEqual([
      { type: "text", text: "Use the attached context file.\n\n" },
      {
        type: "file",
        mime: "text/plain",
        filename: "README.md",
        url: "file:///repo/README.md",
      },
      {
        type: "file",
        mime: "text/plain",
        filename: "handoff-context.md",
        url: "file:///tmp/handoff-context.md",
      },
      {
        type: "file",
        mime: "text/plain",
        filename: "package.json",
        url: "file:///tmp/package.json",
      },
      { type: "text", text: "@/repo/artifact.unknown" },
    ]);
  });

  it("serializes diff comments as text instead of file parts", () => {
    expect(
      buildOpenCodePromptParts(
        "",
        [
          {
            kind: "diff_comment",
            path: "src/app.ts",
            lineNumber: 42,
            side: "new",
            staged: false,
            body: "Handle the empty state.",
          },
        ],
        posixProject,
      ),
    ).toEqual([
      {
        type: "text",
        text: "Review comment on src/app.ts:+42 (unstaged):\nHandle the empty state.",
      },
    ]);
  });

  it("keeps thread mention labels as text instead of dropping them", () => {
    expect(
      buildOpenCodePromptParts(
        "",
        [{ kind: "thread", threadId: "thread-1", title: "Fix the composer" }],
        posixProject,
      ),
    ).toEqual([{ type: "text", text: "@Fix the composer" }]);
  });

  it("sends audio attachments as file parts", () => {
    expect(
      buildOpenCodePromptParts(
        "",
        [{ kind: "attachment", path: "/tmp/note.mp3", mimeType: "audio/mpeg" }],
        posixProject,
      ),
    ).toEqual([
      {
        type: "file",
        mime: "audio/mpeg",
        filename: "note.mp3",
        url: "file:///tmp/note.mp3",
      },
    ]);
  });
});

describe("OpenCode prompt file fallback", () => {
  it("retries only supported media-type failures that include a file part", () => {
    const fileParts: OpenCodePromptPart[] = [
      { type: "file", mime: "image/bmp", filename: "shot.bmp", url: "file:///tmp/shot.bmp" },
    ];

    expect(
      shouldRetryOpenCodePromptWithTextFallback(
        new Error("file part media type image/bmp functionality not supported"),
        fileParts,
      ),
    ).toBe(true);
    expect(shouldRetryOpenCodePromptWithTextFallback(new Error("connection lost"), fileParts)).toBe(
      false,
    );
    expect(
      shouldRetryOpenCodePromptWithTextFallback(
        new Error("file part media type text/plain not supported"),
        [{ type: "text", text: "no file" }],
      ),
    ).toBe(false);
  });

  it("reads bounded text fallbacks and preserves non-text attachments as notices", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-opencode-prompt-"));
    const path = join(dir, "context.txt");
    const imagePath = join(dir, "shot.png");
    writeFileSync(path, "a".repeat(128 * 1024 + 1));

    try {
      const fallback = await buildOpenCodeTextFallbackParts([
        { type: "text", text: "inspect " },
        {
          type: "file",
          mime: "text/plain",
          filename: "context.txt",
          url: pathToFileURL(path).href,
        },
        {
          type: "file",
          mime: "image/png",
          filename: "shot.png",
          url: pathToFileURL(imagePath).href,
        },
      ]);

      expect(fallback[0]).toEqual({ type: "text", text: "inspect " });
      expect(fallback[1]).toMatchObject({ type: "text" });
      expect(fallback[1]?.type === "text" ? fallback[1].text : "").toContain(
        "[File truncated during attachment fallback.]",
      );
      expect(fallback[2]).toEqual({
        type: "text",
        text: `Attached file could not be sent: ${imagePath}`,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
