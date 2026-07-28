import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { buildCursorSdkUserMessage, cursorSdkPromptPath } from "./sdkPrompt";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("buildCursorSdkUserMessage", () => {
  const posixLocation: ProjectLocation = { kind: "posix", path: "/repo" };

  it("keeps a plain prompt in the SDK string form", async () => {
    await expect(buildCursorSdkUserMessage("hello", undefined, posixLocation)).resolves.toBe(
      "hello",
    );
  });

  it("preserves ordered text, MCP mentions, file paths, and private instructions", async () => {
    await expect(
      buildCursorSdkUserMessage(
        "ignored because structured segments are authoritative",
        [
          { kind: "text", content: "Review " },
          { kind: "file", path: "src/main.ts" },
          { kind: "text", content: " with " },
          { kind: "mcp", id: "docs", name: "docs" },
          { kind: "attachment", path: "/tmp/context.pdf", mimeType: "application/pdf" },
        ],
        posixLocation,
        "Follow the attached skill.",
      ),
    ).resolves.toBe(
      "Review @/repo/src/main.ts with @docs@/tmp/context.pdf\n\nFollow the attached skill.",
    );
  });

  it("preserves a native skill invocation when it is the only prompt segment", async () => {
    await expect(
      buildCursorSdkUserMessage(
        "",
        [
          {
            kind: "skill",
            name: "review-code",
            path: "/repo/.cursor/skills/review-code/SKILL.md",
            invocation: "/review-code",
            provider: "cursor",
            scope: "project",
          },
        ],
        posixLocation,
      ),
    ).resolves.toBe("/review-code");
  });

  it("reads image bytes into the only attachment shape the SDK supports", async () => {
    const dir = await mkdtemp(join(tmpdir(), "poracode-cursor-sdk-prompt-"));
    tempDirs.push(dir);
    const image = join(dir, "shot.png");
    await writeFile(image, Buffer.from([0, 1, 2, 255]));

    await expect(
      buildCursorSdkUserMessage(
        "see image",
        [
          { kind: "text", content: "see image" },
          { kind: "attachment", path: image, mimeType: "image/png" },
        ],
        posixLocation,
      ),
    ).resolves.toEqual({
      text: "see image",
      images: [{ data: "AAEC/w==", mimeType: "image/png" }],
    });
  });
});

describe("cursorSdkPromptPath", () => {
  it("resolves native relative paths", () => {
    expect(cursorSdkPromptPath({ kind: "posix", path: "/repo" }, "src/a.ts")).toBe(
      "/repo/src/a.ts",
    );
    expect(cursorSdkPromptPath({ kind: "windows", path: "C:\\repo" }, "src\\a.ts")).toBe(
      "C:\\repo\\src\\a.ts",
    );
  });

  it("turns WSL UNC paths into Linux paths and resolves relative paths in the distro", () => {
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/me/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
    };
    expect(
      cursorSdkPromptPath(location, "\\\\wsl.localhost\\Ubuntu\\home\\me\\shared\\reference.md"),
    ).toBe("/home/me/shared/reference.md");
    expect(
      cursorSdkPromptPath(location, "\\\\wsl.localhost\\Debian\\home\\me\\shared\\reference.md"),
    ).toBe("\\\\wsl.localhost\\Debian\\home\\me\\shared\\reference.md");
    expect(cursorSdkPromptPath(location, "src/main.ts")).toBe("/home/me/repo/src/main.ts");
  });
});
