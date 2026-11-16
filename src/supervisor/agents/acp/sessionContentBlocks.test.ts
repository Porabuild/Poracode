import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { resolveReadablePromptPath, segmentsToContentBlocks } from "./sessionContentBlocks";
import { toAcpResourceUri } from "./sessionPaths";

let projectRoot: string;
let location: ProjectLocation;

beforeAll(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "acp-content-blocks-"));
  location = { kind: "posix", path: projectRoot };
});

afterAll(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe("segmentsToContentBlocks", () => {
  it("sends SVG attachments as embedded text resources instead of raster image blocks", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
    writeFileSync(join(projectRoot, "icon.svg"), svg, "utf8");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    writeFileSync(join(projectRoot, "pixel.png"), png);

    const blocks = await segmentsToContentBlocks(
      "inspect both assets",
      location,
      [
        { kind: "attachment", path: "icon.svg", mimeType: "image/svg+xml" },
        { kind: "attachment", path: "pixel.png", mimeType: "image/png" },
      ],
      { image: true, embeddedContext: true },
    );

    expect(blocks).toEqual([
      {
        type: "resource",
        resource: {
          uri: toAcpResourceUri(location, "icon.svg"),
          mimeType: "image/svg+xml",
          text: svg,
        },
      },
      {
        type: "image",
        data: png.toString("base64"),
        mimeType: "image/png",
      },
      { type: "text", text: "inspect both assets" },
    ]);
  });

  it("falls back to resource_link for SVG when embeddedContext is disabled", async () => {
    writeFileSync(join(projectRoot, "badge.svg"), "<svg/>", "utf8");

    const blocks = await segmentsToContentBlocks(
      "inspect badge",
      location,
      [{ kind: "file", path: "badge.svg" }],
      { image: true, embeddedContext: false },
    );

    expect(blocks).toEqual([
      {
        type: "resource_link",
        uri: toAcpResourceUri(location, "badge.svg"),
        name: "badge.svg",
        mimeType: "image/svg+xml",
      },
      { type: "text", text: "inspect badge" },
    ]);
  });

  it("resolves WSL Linux attachments outside the project root via UNC host paths", () => {
    const wslLocation: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/alice/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\alice\\repo",
    };

    expect(
      resolveReadablePromptPath(wslLocation, {
        kind: "attachment",
        path: "/home/alice/.poracode/attachments/clip.mp3",
        mimeType: "audio/mpeg",
      }),
    ).toBe("\\\\wsl.localhost\\Ubuntu\\home\\alice\\.poracode\\attachments\\clip.mp3");

    expect(
      resolveReadablePromptPath(wslLocation, {
        kind: "attachment",
        path: "C:\\Users\\alice\\Pictures\\shot.png",
        mimeType: "image/png",
      }),
    ).toBe("C:\\Users\\alice\\Pictures\\shot.png");
  });
});
