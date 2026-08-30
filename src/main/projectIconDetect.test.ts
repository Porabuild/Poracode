import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectProjectIconFile, listProjectIconFiles } from "./projectIconDetect";

describe("detectProjectIconFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "poracode-icon-detect-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const location = () => ({ kind: "windows", path: dir }) as const;

  it("finds a favicon in the project root", () => {
    writeFileSync(join(dir, "favicon.ico"), "icon-bytes");
    expect(detectProjectIconFile(location())).toBe("favicon.ico");
  });

  it("prefers any root candidate over nested ones, and favicon names over logo names", () => {
    mkdirSync(join(dir, "public"));
    // A nested favicon loses to any candidate in the project root.
    writeFileSync(join(dir, "public", "favicon.ico"), "nested");
    writeFileSync(join(dir, "logo.png"), "root");
    expect(detectProjectIconFile(location())).toBe("logo.png");
    // Within the same directory, favicon names outrank logo names.
    writeFileSync(join(dir, "favicon.svg"), "root-favicon");
    expect(detectProjectIconFile(location())).toBe("favicon.svg");
  });

  it("returns null when no candidate exists", () => {
    writeFileSync(join(dir, "package.json"), "{}");
    expect(detectProjectIconFile(location())).toBeNull();
  });

  it("skips empty and oversized files", () => {
    writeFileSync(join(dir, "favicon.ico"), "");
    expect(detectProjectIconFile(location())).toBeNull();
    writeFileSync(join(dir, "favicon.ico"), Buffer.alloc(2 * 1024 * 1024 + 1));
    expect(detectProjectIconFile(location())).toBeNull();
  });

  it("ignores directories that happen to share a candidate name", () => {
    mkdirSync(join(dir, "favicon.ico"));
    expect(detectProjectIconFile(location())).toBeNull();
  });
});

describe("listProjectIconFiles", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "poracode-icon-list-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const location = () => ({ kind: "windows", path: dir }) as const;

  function write(relativePath: string): void {
    const segments = relativePath.split("/");
    if (segments.length > 1) {
      mkdirSync(join(dir, ...segments.slice(0, -1)), { recursive: true });
    }
    writeFileSync(join(dir, ...segments), "icon-bytes");
  }

  it("prefers vector over raster over .ico within a directory", () => {
    write("favicon.ico");
    expect(detectProjectIconFile(location())).toBe("favicon.ico");
    write("favicon.png");
    expect(detectProjectIconFile(location())).toBe("favicon.png");
    write("favicon.svg");
    expect(detectProjectIconFile(location())).toBe("favicon.svg");
  });

  it("finds framework and packaging locations", () => {
    for (const path of [
      "app/icon.png",
      "src/app/icon.svg",
      "src/favicon.ico",
      "static/favicon.png",
      "resources/icon.png",
      ".idea/icon.svg",
    ]) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      write(path);
      expect(detectProjectIconFile(location())).toBe(path);
    }
  });

  it("returns every match in priority order for the picker", () => {
    write("logo.png");
    write("public/favicon.svg");
    write("assets/icon.png");
    write("favicon.svg");

    expect(listProjectIconFiles(location())).toEqual([
      "favicon.svg",
      "logo.png",
      "public/favicon.svg",
      "assets/icon.png",
    ]);
  });

  it("caps the list so a project cannot flood the picker", () => {
    for (const path of [
      "favicon.svg",
      "favicon.png",
      "favicon.ico",
      "icon.svg",
      "icon.png",
      "logo.svg",
      "logo.png",
      "public/favicon.svg",
      "public/favicon.png",
      "public/favicon.ico",
      "public/icon.svg",
      "public/icon.png",
      "public/logo.svg",
      "public/logo.png",
    ]) {
      write(path);
    }
    expect(listProjectIconFiles(location())).toHaveLength(12);
  });

  it("is empty when nothing matches", () => {
    write("package.json");
    expect(listProjectIconFiles(location())).toEqual([]);
  });
});
