import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { releaseNodeExecutable, serviceNodeExecutable } from "./serverStandaloneRuntime";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function release(marker?: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "poracode-standalone-release-"));
  roots.push(root);
  mkdirSync(join(root, "lib"), { recursive: true });
  if (marker !== undefined) writeFileSync(join(root, "standalone.json"), JSON.stringify(marker));
  return root;
}

describe("releaseNodeExecutable", () => {
  it("keeps the launching Node for an npm-installed release", () => {
    expect(releaseNodeExecutable(release(), "/usr/bin/node")).toBe("/usr/bin/node");
  });

  it("runs a standalone release with its own bundled Node", () => {
    const root = release({
      formatVersion: 1,
      kind: "poracode-standalone-runtime",
      version: "2.1.0",
      target: "linux-x64",
      node: { version: "26.13.0", executable: "runtime/node" },
    });
    expect(releaseNodeExecutable(root, "/usr/bin/node")).toBe(join(root, "runtime", "node"));
  });

  it("refuses a future standalone marker instead of guessing", () => {
    const root = release({ formatVersion: 2, kind: "poracode-standalone-runtime" });
    expect(() => releaseNodeExecutable(root)).toThrow(/format-1 standalone runtime marker/u);
  });
});

describe("serviceNodeExecutable", () => {
  it("pins a standalone prefix to the release's bundled Node", () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-service-prefix-"));
    roots.push(prefix);
    const current = join(prefix, "releases", "2.1.0");
    mkdirSync(join(current, "runtime"), { recursive: true });
    mkdirSync(join(current, "lib"), { recursive: true });
    writeFileSync(join(current, "runtime", "node"), "");
    writeFileSync(
      join(current, "standalone.json"),
      JSON.stringify({
        formatVersion: 1,
        kind: "poracode-standalone-runtime",
        version: "2.1.0",
        target: "linux-x64",
        node: { version: "26.13.0", executable: "runtime/node" },
      }),
    );
    symlinkSync(join("releases", "2.1.0"), join(prefix, "current"));
    expect(serviceNodeExecutable(prefix)).toBe(realpathSync(join(current, "runtime", "node")));
  });

  it("keeps the launching Node for a non-standalone prefix", () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-service-prefix-"));
    roots.push(prefix);
    expect(serviceNodeExecutable(prefix)).toBe(realpathSync.native(process.execPath));
  });
});
