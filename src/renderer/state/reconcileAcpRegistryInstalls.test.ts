import { describe, expect, it } from "vitest";
import type { InstalledAcpRegistryAgent } from "@/shared/contracts";
import { reconcileAcpRegistryInstalls } from "./reconcileAcpRegistryInstalls";

function record(id: string, version: string): InstalledAcpRegistryAgent {
  return {
    id,
    name: id,
    version,
    installedAt: "2026-10-13",
    adapterKind: `acp-generic:${id}`,
    installKind: "generic",
  };
}

describe("reconcileAcpRegistryInstalls", () => {
  it("keeps concurrent successful updates when replies contain stale sibling versions", () => {
    const before = { a: record("a", "1.0.0"), b: record("b", "1.0.0"), c: record("c", "3.0.0") };
    const afterA = reconcileAcpRegistryInstalls(before, [record("a", "2.0.0"), before.b], ["a"]);
    const afterB = reconcileAcpRegistryInstalls(afterA, [before.a, record("b", "2.0.0")], ["b"]);
    expect(afterB).toEqual({ a: record("a", "2.0.0"), b: record("b", "2.0.0"), c: before.c });
    expect(reconcileAcpRegistryInstalls(afterB, Object.values(afterB), ["a"])).toBe(afterB);
  });

  it("removes only a missing scoped record and retains full snapshot synchronization", () => {
    const before = { a: record("a", "1.0.0"), b: record("b", "1.0.0") };
    expect(reconcileAcpRegistryInstalls(before, [], ["a"])).toEqual({ b: before.b });
    expect(reconcileAcpRegistryInstalls(before, [before.a])).toEqual({ a: before.a });
  });
});
