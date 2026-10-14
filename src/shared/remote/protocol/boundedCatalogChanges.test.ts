import { describe, expect, it } from "vitest";
import {
  REMOTE_BOUNDED_CATALOG_CHANGES_DECLARATION,
  REMOTE_BOUNDED_CATALOG_CHANGES_VERSION,
  hostSupportsBoundedCatalogChanges,
  remoteProjectsChangedEventSchema,
} from "@/shared/remote";

/**
 * D2: the signal marker is additive on the existing `remote-projects-changed`
 * discriminator. Both variants validate and malformed signal/full
 * combinations are rejected without weakening the historical full form.
 */

const project = {
  id: "p1",
  name: "Project",
  location: { kind: "posix" as const, path: "/repo" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("bounded catalog-change contract", () => {
  it("advertises exactly one declaration value at version 1", () => {
    expect(REMOTE_BOUNDED_CATALOG_CHANGES_VERSION).toBe(1);
    expect(REMOTE_BOUNDED_CATALOG_CHANGES_DECLARATION).toBe("bounded-v1");
  });

  it("gates on the advertised version, tolerating unknown future versions", () => {
    expect(hostSupportsBoundedCatalogChanges(undefined)).toBe(false);
    expect(hostSupportsBoundedCatalogChanges({ versions: [] })).toBe(false);
    expect(hostSupportsBoundedCatalogChanges({ versions: [2] })).toBe(false);
    expect(hostSupportsBoundedCatalogChanges({ versions: [1] })).toBe(true);
    expect(hostSupportsBoundedCatalogChanges({ versions: [1, 2] })).toBe(true);
  });

  it("accepts the legacy full form byte-for-byte", () => {
    const parsed = remoteProjectsChangedEventSchema.parse({
      type: "remote-projects-changed",
      projects: [project],
    });
    expect(parsed).toEqual({ type: "remote-projects-changed", projects: [project] });
    expect(Object.hasOwn(parsed, "mode")).toBe(false);
  });

  it("accepts the bounded signal form without a payload", () => {
    expect(
      remoteProjectsChangedEventSchema.parse({
        type: "remote-projects-changed",
        mode: "signal",
      }),
    ).toEqual({ type: "remote-projects-changed", mode: "signal" });
  });

  it("rejects malformed signal/full combinations", () => {
    // Signal with a payload.
    expect(
      remoteProjectsChangedEventSchema.safeParse({
        type: "remote-projects-changed",
        mode: "signal",
        projects: [project],
      }).success,
    ).toBe(false);
    // Neither signal nor payload.
    expect(
      remoteProjectsChangedEventSchema.safeParse({ type: "remote-projects-changed" }).success,
    ).toBe(false);
    // Empty list is a legal catalog state, but still needs the full form.
    expect(
      remoteProjectsChangedEventSchema.safeParse({
        type: "remote-projects-changed",
        projects: [],
      }).success,
    ).toBe(true);
    // An unknown mode value is not a legal marker: the parse fails rather than
    // silently accepting a form this contract never defined.
    expect(
      remoteProjectsChangedEventSchema.safeParse({
        type: "remote-projects-changed",
        mode: "full",
        projects: [],
      }).success,
    ).toBe(false);
    // A signal carrying any payload shape is still rejected.
    expect(
      remoteProjectsChangedEventSchema.safeParse({
        type: "remote-projects-changed",
        mode: "signal",
        projects: null,
      }).success,
    ).toBe(false);
  });
});
