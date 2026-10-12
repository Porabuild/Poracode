import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashRuntimeDirectory } from "../../../scripts/build-ssh-runtime-archive.mjs";
import { hashRuntimeDirectory as hashStagedRuntimeDirectory } from "./runtimeBundleFiles";

/**
 * The release archive's `hash` is the staged-directory identity the remote
 * runtime cache keys on. The loader cannot recompute it from the archive
 * bytes, so the packaging script and the loader must hash identically; this
 * pins the two implementations together.
 */
describe("ssh runtime archive packaging", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("hashes a staged tree exactly like the runtime loader", () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-ssh-archive-parity-"));
    dirs.push(root);
    mkdirSync(join(root, "nested", "deep"), { recursive: true });
    writeFileSync(join(root, "a.txt"), "a");
    writeFileSync(join(root, "nested", "b.txt"), "b");
    writeFileSync(join(root, "nested", "deep", "c.txt"), "c");
    expect(hashRuntimeDirectory(root)).toBe(hashStagedRuntimeDirectory(root));
  });

  it("refuses a symbolic link in the staged tree like the runtime loader", () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-ssh-archive-link-"));
    dirs.push(root);
    writeFileSync(join(root, "real.txt"), "real");
    symlinkSync("real.txt", join(root, "link.txt"));
    expect(() => hashRuntimeDirectory(root)).toThrow(/symbolic link/u);
    expect(() => hashStagedRuntimeDirectory(root)).toThrow(/symbolic link/u);
  });
});
