import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { desktopHostControlGrantSchema } from "@/shared/desktopHostControl";
import { HostOwnerLease } from "./hostOwnerLease";
import { resolveHostRootPaths } from "./hostRootPaths";
import { HostDataFence } from "./hostDataFence";
import { delegatedDesktopControl } from "./delegatedHostControl";

let root: string;
let owner: HostOwnerLease;
let fence: HostDataFence;
let connected: boolean;
beforeEach(() => {
  root = mkdtempSync(join(process.cwd(), "tmp/delegated-control-"));
  const paths = resolveHostRootPaths(join(root, "profile"));
  owner = HostOwnerLease.acquire(paths, "desktop");
  fence = HostDataFence.acquire(paths.dataFencePath);
  connected = true;
});
afterEach(() => {
  fence.release();
  owner.release();
  rmSync(root, { recursive: true, force: true });
});
function options() {
  return {
    grant: {
      version: 1 as const,
      profileNamespace: owner.paths.profileNamespace,
      ownerGeneration: owner.generation,
    },
    dataRoot: owner.paths.dataRoot,
    dataFencePath: owner.paths.dataFencePath,
    custody: fence,
    ownerPid: process.pid,
    assertParentActive: () => {
      if (!connected) throw new Error("Parent disconnected");
    },
  };
}
it("delegates the captured owner generation while retaining independent writer custody", () => {
  const authority = delegatedDesktopControl(options());
  expect(authority.generation).toBe(owner.generation);
  expect(authority.generation).not.toBe(fence.generation);
  expect(authority.kind).toBe("desktop");
  expect(authority.paths).toEqual(owner.paths);
  authority.assertActive();
  expect(() => authority.assertActive(randomUUID())).toThrow("active owner generation");
  owner.assertActive();
  fence.assertActive();
});
it("does not accept informational owner bytes without a live parent and fenced writer", () => {
  const authority = delegatedDesktopControl(options());
  connected = false;
  expect(() => authority.assertActive()).toThrow("Parent disconnected");
  connected = true;
  fence.release();
  expect(() => authority.assertActive()).toThrow("custody");
});
it("refuses another root, fence, parent PID or owner kind", () => {
  expect(() => delegatedDesktopControl({ ...options(), dataRoot: root })).toThrow(
    "exact data root",
  );
  expect(() =>
    delegatedDesktopControl({ ...options(), dataFencePath: join(root, "other") }),
  ).toThrow("exact data root");
  expect(() => delegatedDesktopControl({ ...options(), ownerPid: process.pid + 1 })).toThrow(
    "active owner generation",
  );
  owner.release();
  owner = HostOwnerLease.acquire(owner.paths, "headless");
  expect(() => delegatedDesktopControl(options())).toThrow("active owner generation");
});
it("refuses stopped and replaced owners without releasing the parent's lease", () => {
  const authority = delegatedDesktopControl(options());
  owner.release();
  expect(() => authority.assertActive()).toThrow("active owner generation");
  owner = HostOwnerLease.acquire(owner.paths, "desktop");
  expect(() => authority.assertActive()).toThrow("active owner generation");
  owner.assertActive();
});
it("keeps the delegation version closed, including unknown fields", () => {
  expect(desktopHostControlGrantSchema.safeParse({ ...options().grant, version: 2 }).success).toBe(
    false,
  );
  expect(
    desktopHostControlGrantSchema.safeParse({ ...options().grant, server: "public" }).success,
  ).toBe(false);
  expect(() =>
    delegatedDesktopControl({
      ...options(),
      grant: { ...options().grant, ownerGeneration: randomUUID() },
    }),
  ).toThrow("active owner generation");
});
