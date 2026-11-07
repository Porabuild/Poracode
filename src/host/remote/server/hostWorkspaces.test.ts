import { describe, expect, it } from "vitest";
import { remoteHostWorkspaces, remoteShellSnapshotSchema } from "@/shared/remote";
import type { RemoteServerContext } from "./context";
import { captureCatalogReadProjection } from "./catalogPageBuilders";
import { readHostWorkspaces } from "./snapshots";

const workspaces = [
  { id: "w1", name: "Work", createdAt: "2026-01-01T00:00:00.000Z", icon: "briefcase" as const },
  { id: "w2", name: "Clients", createdAt: "2026-01-02T00:00:00.000Z", icon: "rocket" as const },
];

function contextWith(readWorkspaces?: () => ReturnType<typeof remoteHostWorkspaces>) {
  return {
    seq: 7,
    snapshotEpoch: "epoch",
    options: {
      settings: readWorkspaces ? { readWorkspaces } : undefined,
    },
  } as unknown as RemoteServerContext;
}

describe("host workspace names in shell snapshots", () => {
  it("sends only each workspace's id and name", () => {
    expect(remoteHostWorkspaces({ workspaces })).toEqual([
      { id: "w1", name: "Work" },
      { id: "w2", name: "Clients" },
    ]);
    expect(remoteHostWorkspaces({})).toEqual([]);
  });

  it("carries the names on both snapshot forms and omits them without a reader", () => {
    const names = remoteHostWorkspaces({ workspaces });
    expect(readHostWorkspaces(contextWith(() => names))).toEqual(names);
    expect(
      captureCatalogReadProjection(
        contextWith(() => names),
        true,
      ).workspaces,
    ).toEqual(names);
    expect(readHostWorkspaces(contextWith())).toBeUndefined();
    expect(captureCatalogReadProjection(contextWith(), true)).not.toHaveProperty("workspaces");
  });

  it("never fails a snapshot because the settings read failed", () => {
    const failing = contextWith(() => {
      throw new Error("settings unreadable");
    });
    expect(readHostWorkspaces(failing)).toBeUndefined();
    expect(captureCatalogReadProjection(failing, true)).not.toHaveProperty("workspaces");
  });

  it("parses snapshots from hosts on either side of the change", () => {
    const base = {
      snapshotSeq: 1,
      projects: [],
      threads: [],
      runtimeSummariesByThread: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(remoteShellSnapshotSchema.parse(base).workspaces).toBeUndefined();
    expect(
      remoteShellSnapshotSchema.parse({ ...base, workspaces: [{ id: "w1", name: "Work" }] })
        .workspaces,
    ).toEqual([{ id: "w1", name: "Work" }]);
  });
});
