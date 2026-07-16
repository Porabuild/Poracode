import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WslBridgeClient } from "../wsl/bridge/client";
import {
  rewriteSegmentsForWorkspace,
  rewriteSegmentsForWsl,
  setWslAttachmentBridgeClient,
} from "./threadAttachments";

const dirs: string[] = [];

afterEach(() => {
  setWslAttachmentBridgeClient(undefined);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

describe("rewriteSegmentsForWorkspace", () => {
  it("copies an out-of-workspace attachment into .poracode/attachments and rewrites the path", async () => {
    const project = tmp("lc-ws-project-");
    const outside = tmp("lc-ws-outside-");
    const src = join(outside, "shot.png");
    writeFileSync(src, "png-bytes");

    const segments = await rewriteSegmentsForWorkspace(
      [{ kind: "attachment", path: src, mimeType: "image/png" }],
      project,
    );

    const dest = join(project, ".poracode", "attachments", "shot.png");
    expect(segments[0]).toEqual({ kind: "attachment", path: dest, mimeType: "image/png" });
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe("png-bytes");
    // The copies self-ignore so they never show up in `git status`.
    expect(readFileSync(join(project, ".poracode", ".gitignore"), "utf8")).toContain("*");
  });

  it("leaves attachments already inside the workspace untouched", async () => {
    const project = tmp("lc-ws-project-");
    const inside = join(project, "assets");
    mkdirSync(inside, { recursive: true });
    const src = join(inside, "in.png");
    writeFileSync(src, "x");

    const segments = await rewriteSegmentsForWorkspace(
      [{ kind: "attachment", path: src, mimeType: "image/png" }],
      project,
    );

    expect(segments[0]).toEqual({ kind: "attachment", path: src, mimeType: "image/png" });
    expect(existsSync(join(project, ".poracode"))).toBe(false);
  });

  it("passes through text segments and relative paths", async () => {
    const project = tmp("lc-ws-project-");
    const segments = await rewriteSegmentsForWorkspace(
      [
        { kind: "text", content: "hi" },
        { kind: "attachment", path: "rel.png", mimeType: "image/png" },
      ],
      project,
    );
    expect(segments).toEqual([
      { kind: "text", content: "hi" },
      { kind: "attachment", path: "rel.png", mimeType: "image/png" },
    ]);
  });
});

describe("rewriteSegmentsForWsl", () => {
  it("preserves host PDF attachment paths when the structured adapter reads their bytes", async () => {
    setWslAttachmentBridgeClient({} as WslBridgeClient);
    const path = "C:\\Users\\test\\document.pdf";

    const segments = await rewriteSegmentsForWsl(
      [{ kind: "attachment", path, mimeType: "application/pdf" }],
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/workspace",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\workspace",
      },
      { preservePdfAttachments: true },
    );

    expect(segments).toEqual([{ kind: "attachment", path, mimeType: "application/pdf" }]);
  });
});
