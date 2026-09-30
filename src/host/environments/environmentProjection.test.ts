import { describe, expect, it } from "vitest";
import { environmentProjectionSchema, type EnvironmentRecord } from "@/shared/environments";
import { environmentProjection, environmentProjections } from "./environmentProjection";

const environmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const childDesktopId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const legacyId = "11111111-1111-4111-8111-111111111111";
const pin = `SHA256:${"A".repeat(43)}`;
const runtimeHash = "b".repeat(64);

function recordFixture(overrides: Partial<EnvironmentRecord> = {}): EnvironmentRecord {
  const base: EnvironmentRecord = {
    environmentId,
    revision: 3,
    label: "Lab server",
    target: "dev@example.internal",
    port: 22_022,
    credentialRef: "agent:prod",
    trust: { state: "observed", observedFingerprint: pin },
    runtime: { hash: runtimeHash, appVersion: "9.9.9" },
    childIdentity: { desktopId: childDesktopId },
    legacyConnectionIds: [legacyId],
    desired: "disabled",
    createdAt: 100,
    updatedAt: 200,
  };
  return { ...base, ...overrides };
}

describe("environmentProjection", () => {
  it("exposes the configured target port and redacts credential references and paths", () => {
    const projection = environmentProjection(recordFixture());
    expect(projection).toEqual({
      environmentId,
      revision: 3,
      label: "Lab server",
      target: "dev@example.internal",
      port: 22_022,
      trust: { state: "observed", observedFingerprint: pin },
      runtime: { hash: runtimeHash, appVersion: "9.9.9" },
      credential: "configured",
      childIdentity: { desktopId: childDesktopId },
      legacyConnectionIds: [legacyId],
      desired: "disabled",
      createdAt: 100,
      updatedAt: 200,
    });
    const serialized = JSON.stringify(projection);
    expect(serialized).toContain("22022");
    expect(serialized).not.toContain("agent:prod");
    expect(serialized).not.toContain("identityFile");
    expect(serialized).not.toContain("credentialRef");
  });

  it("marks absent credential references and ports as none/undefined", () => {
    const { port: _port, credentialRef: _credentialRef, ...withoutOptionals } = recordFixture();
    const projection = environmentProjection(withoutOptionals);
    expect(projection.credential).toBe("none");
    expect(projection.port).toBeUndefined();
    expect(environmentProjectionSchema.safeParse(projection).success).toBe(true);
  });

  it("returns deeply frozen projections", () => {
    const projection = environmentProjection(recordFixture());
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.trust)).toBe(true);
    expect(Object.isFrozen(projection.runtime)).toBe(true);
    expect(Object.isFrozen(projection.legacyConnectionIds)).toBe(true);
    expect(Object.isFrozen(projection.childIdentity)).toBe(true);
    expect(() => {
      (projection as { label: string }).label = "changed";
    }).toThrow(TypeError);
    expect(() => {
      (projection.legacyConnectionIds as string[]).push("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    }).toThrow(TypeError);
  });

  it("freezes the projection list and each entry", () => {
    const projections = environmentProjections([recordFixture()]);
    expect(Object.isFrozen(projections)).toBe(true);
    expect(projections).toHaveLength(1);
    expect(Object.isFrozen(projections[0])).toBe(true);
  });
});
