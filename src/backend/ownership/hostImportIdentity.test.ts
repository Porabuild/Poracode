import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDistinctHostImportSource } from "./hostImportIdentity";
import { resolveHostRootPaths } from "./hostRootPaths";

const identities = vi.hoisted(() => new Map<string, string>());
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    // Emulate only bind-mount metadata identity; no claim of a real Linux mount.
    statSync: (path: string) => actual.statSync(identities.get(path) ?? path),
  };
});
const roots: string[] = [];
afterEach(() => {
  identities.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const created = mkdtempSync(join(tmpdir(), "poracode-import-identity-"));
  roots.push(created);
  const root = realpathSync.native(created);
  const paths = resolveHostRootPaths(join(root, "profile"));
  const source = join(root, "backup");
  mkdirSync(source);
  writeFileSync(join(source, "state.sqlite"), "synthetic database metadata target");
  return { paths, source };
}

describe("offline import physical identity fence", () => {
  it.each(["profileNamespace", "dataRoot", "electronUserDataRoot"] as const)(
    "refuses an aliased source directory for %s before any SQLite open",
    (protectedRoot) => {
      const { paths, source } = fixture();
      mkdirSync(paths[protectedRoot]);
      identities.set(source, paths[protectedRoot]);
      expect(() => assertDistinctHostImportSource(paths, source)).toThrow(/physically aliases/u);
    },
  );

  it.each(["profileNamespace", "dataRoot", "electronUserDataRoot"] as const)(
    "refuses an aliased database below a different source directory for %s",
    (protectedRoot) => {
      const { paths, source } = fixture();
      mkdirSync(paths[protectedRoot]);
      const protectedDatabase = join(paths[protectedRoot], "state.sqlite");
      writeFileSync(protectedDatabase, "synthetic original database");
      identities.set(join(source, "state.sqlite"), protectedDatabase);
      expect(() => assertDistinctHostImportSource(paths, source)).toThrow(/physically aliases/u);
    },
  );

  it("will not open the permanent owner lease through a backup alias", () => {
    const { paths, source } = fixture();
    writeFileSync(paths.leasePath, "synthetic lease identity");
    identities.set(join(source, "state.sqlite"), paths.leasePath);
    expect(() => assertDistinctHostImportSource(paths, source)).toThrow(/physically aliases/u);
  });

  it("allows independent inodes with identical bytes and absent protected roots", () => {
    const { paths, source } = fixture();
    expect(assertDistinctHostImportSource(paths, source)).toBeUndefined();
    mkdirSync(paths.profileNamespace);
    writeFileSync(
      join(paths.profileNamespace, "state.sqlite"),
      "synthetic database metadata target",
    );
    expect(assertDistinctHostImportSource(paths, source)).toBeUndefined();
  });
});
