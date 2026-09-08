import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { createAcpLocalImageResolver } from "./sessionLocalImages";

/** Smallest valid 1x1 PNG. */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TINY_PNG = Buffer.from(TINY_PNG_BASE64, "base64");
/** A second, visibly different 1x1 PNG so cache invalidation is observable. */
const OTHER_PNG = Buffer.concat([TINY_PNG, Buffer.alloc(4, 0)]);

let dir: string;
const location: ProjectLocation = { kind: "posix", path: "/" } as ProjectLocation;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "acp-local-images-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("createAcpLocalImageResolver", () => {
  it("reads a png from an absolute path and from a file:// URI", () => {
    const file = join(dir, "shot.png");
    writeFileSync(file, TINY_PNG);
    const resolve = createAcpLocalImageResolver(location);
    const expected = `data:image/png;base64,${TINY_PNG_BASE64}`;
    expect(resolve(file)).toBe(expected);
    expect(resolve(pathToFileURL(file).href)).toBe(expected);
  });

  it("returns undefined for a missing file", () => {
    const resolve = createAcpLocalImageResolver(location);
    expect(resolve(join(dir, "nope.png"))).toBeUndefined();
  });

  it("returns undefined for a non-image extension", () => {
    const file = join(dir, "notes.txt");
    writeFileSync(file, "hello");
    expect(createAcpLocalImageResolver(location)(file)).toBeUndefined();
  });

  it("returns undefined for svg — not a raster format we inline", () => {
    const file = join(dir, "vector.svg");
    writeFileSync(file, "<svg/>");
    expect(createAcpLocalImageResolver(location)(file)).toBeUndefined();
  });

  it("returns undefined for a relative path or a non-file URI", () => {
    const resolve = createAcpLocalImageResolver(location);
    expect(resolve("shot.png")).toBeUndefined();
    expect(resolve("https://example.com/shot.png")).toBeUndefined();
    expect(resolve("")).toBeUndefined();
  });

  it("returns undefined for a file over the 5 MB cap", () => {
    const file = join(dir, "huge.png");
    writeFileSync(file, Buffer.alloc(5 * 1024 * 1024 + 1, 1));
    expect(createAcpLocalImageResolver(location)(file)).toBeUndefined();
  });

  it("invalidates the cache when the file's mtime changes", () => {
    const file = join(dir, "changing.png");
    writeFileSync(file, TINY_PNG);
    const resolve = createAcpLocalImageResolver(location);
    const first = resolve(file);
    expect(first).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`);
    // Cached read returns the same bytes without touching disk again.
    expect(resolve(file)).toBe(first);
    writeFileSync(file, OTHER_PNG);
    const future = new Date(Date.now() + 5_000);
    utimesSync(file, future, future);
    expect(resolve(file)).toBe(`data:image/png;base64,${OTHER_PNG.toString("base64")}`);
  });

  it("returns undefined for a wsl project path on a non-Windows host", () => {
    if (process.platform === "win32") return;
    const wsl: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/u/proj",
      uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\proj",
      path: "\\\\wsl$\\Ubuntu\\home\\u\\proj",
    } as ProjectLocation;
    const file = join(dir, "shot.png");
    writeFileSync(file, TINY_PNG);
    expect(createAcpLocalImageResolver(wsl)(file)).toBeUndefined();
  });
});
