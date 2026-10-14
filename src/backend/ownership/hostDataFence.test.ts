// Focused regression for the data-custody fence (Gates 2-3, S1.3): the forked
// desktop backend child holds `<namespace>.host-data.sqlite` for its lifetime,
// so an owner killed while its backend still writes cannot be succeeded by a
// second writer. Covers the lease-file idioms (never unlinked, exclusive from
// first open, future-format refusal), the admission probe -> child handoff,
// and the bounded admission wait.

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireHostDataFenceWithWait,
  HostDataFence,
  HostDataFenceInUseError,
} from "./hostDataFence";
import { resolveDesktopHostRootPaths } from "./hostRootPaths";

const directories: string[] = [];
const fences: HostDataFence[] = [];

function fencePath(): string {
  const parent = mkdtempSync(join(tmpdir(), "poracode-data-fence-"));
  directories.push(parent);
  return resolveDesktopHostRootPaths(join(realpathSync.native(parent), "profile")).dataFencePath;
}

function hold(path = fencePath()): HostDataFence {
  const fence = HostDataFence.acquire(path);
  fences.push(fence);
  return fence;
}

afterEach(() => {
  for (const fence of fences.splice(0)) fence.release();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("host data custody fence", () => {
  it("creates the fence fresh on a root that predates it (old data root, no migration)", () => {
    const path = fencePath();
    const fence = hold(path);
    expect(fence.dataFencePath).toBe(path);
  });

  it("excludes a second writer while custody is held", () => {
    const path = fencePath();
    hold(path);
    expect(() => HostDataFence.acquire(path)).toThrow(HostDataFenceInUseError);
    let error: unknown = null;
    try {
      HostDataFence.acquire(path);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(HostDataFenceInUseError);
    expect((error as HostDataFenceInUseError).code).toBe("HOST_DATA_IN_USE");
  });

  it("hands custody from the admission probe to the child that follows it", () => {
    const path = fencePath();
    // Admission: bounded-wait probe proves exclusivity, then releases.
    const probe = hold(path);
    probe.release();
    // The forked child then takes the fence for its lifetime.
    const child = hold(path);
    expect(child.dataFencePath).toBe(path);
    child.release();
    // And a third owner can proceed once the child exits.
    expect(() => hold(path)).not.toThrow();
  });

  it("acquires within the bounded wait once a draining holder exits", async () => {
    const path = fencePath();
    const holder = hold(path);
    const delayed = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      holder.release();
    })();
    await expect(acquireHostDataFenceWithWait(path, 3, 10)).resolves.toBeInstanceOf(HostDataFence);
    await delayed;
  });

  it("refuses after the bounded wait while the orphan writer keeps custody", async () => {
    const path = fencePath();
    hold(path);
    await expect(acquireHostDataFenceWithWait(path, 3, 5)).rejects.toThrow(HostDataFenceInUseError);
  });

  it("exposes a stable custody generation and refuses once released", () => {
    const path = fencePath();
    const fence = hold(path);
    const generation = fence.generation;
    expect(generation).toMatch(/^[0-9a-f-]{36}$/u);
    expect(() => fence.assertActive()).not.toThrow();
    expect(() => fence.assertActive(generation)).not.toThrow();
    expect(() => fence.assertActive(randomUUID())).toThrow(/no longer active/u);
    fence.release();
    expect(() => fence.assertActive()).toThrow(/no longer active/u);
    expect(() => fence.assertActive(generation)).toThrow(/no longer active/u);
  });

  it("does not overwrite an unsupported future fence format", () => {
    const path = fencePath();
    const database = new Database(path);
    database.pragma("user_version = 2");
    database.close();
    expect(() => HostDataFence.acquire(path)).toThrow(/unsupported format/u);
    const unchanged = new Database(path, { readonly: true });
    try {
      expect(unchanged.pragma("user_version", { simple: true })).toBe(2);
    } finally {
      unchanged.close();
    }
  });
});
