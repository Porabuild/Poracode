import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveServerInstallLayout } from "./serverInstallLayout";
import { readServerArtifactVersion, resolveServerVersion } from "./serverVersion";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function prefixWithVersion(version: string | undefined): string {
  const prefix = mkdtempSync(join(tmpdir(), "poracode-server-version-"));
  dirs.push(prefix);
  mkdirSync(join(prefix, "lib"), { recursive: true });
  mkdirSync(join(prefix, "resources"), { recursive: true });
  writeFileSync(
    join(prefix, "package.json"),
    `${JSON.stringify({ name: "poracode-server", ...(version ? { version } : {}) })}\n`,
  );
  return prefix;
}

describe("resolveServerVersion (plan D1/D3)", () => {
  it("reads the immutable artifact version from the installed layout", () => {
    const prefix = prefixWithVersion("1.8.1");
    const layout = resolveServerInstallLayout({ libDir: join(prefix, "lib") });
    expect(resolveServerVersion({ layout, env: {} })).toEqual({
      version: "1.8.1",
      source: "artifact",
    });
    expect(resolveServerVersion({ layout, env: { PORACODE_APP_VERSION: "dev" } })).toEqual({
      version: "1.8.1",
      source: "artifact",
    });
  });

  it("falls back to an explicit environment override, never the dev placeholder", () => {
    const prefix = prefixWithVersion(undefined);
    const layout = resolveServerInstallLayout({ libDir: join(prefix, "lib") });
    expect(readServerArtifactVersion(layout)).toBeUndefined();
    expect(resolveServerVersion({ layout, env: { PORACODE_APP_VERSION: "2.0.0" } })).toEqual({
      version: "2.0.0",
      source: "environment",
    });
    expect(resolveServerVersion({ layout, env: { PORACODE_APP_VERSION: "dev" } })).toEqual({
      version: "unknown",
      source: "unknown",
    });
    expect(resolveServerVersion({ layout, env: {} })).toEqual({
      version: "unknown",
      source: "unknown",
    });
  });

  it("rejects a non-semver artifact version", () => {
    const prefix = prefixWithVersion("not-a-version");
    const layout = resolveServerInstallLayout({ libDir: join(prefix, "lib") });
    expect(readServerArtifactVersion(layout)).toBeUndefined();
  });
});
