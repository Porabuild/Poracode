import { describe, expect, it } from "vitest";
import { migrateRemoteServersPersistedState } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";

const directV1: RemoteServerRecord = {
  desktopId: "desk-1",
  label: "Desk One",
  endpoint: "http://127.0.0.1:49153/",
  accessToken: "acc-1",
  scopes: ["session:read", "projects:manage"],
} as RemoteServerRecord;

const sshV1: RemoteServerRecord = {
  desktopId: "desk-2",
  label: "SSH box",
  endpoint: "http://127.0.0.1:49154/",
  accessToken: "acc-2",
  scopes: ["session:read"],
  transport: { kind: "ssh", connection: { id: "conn-2", target: "user@host" } },
} as unknown as RemoteServerRecord;

describe("remote-servers store v1 → v2 migration", () => {
  it("sets connectionId = desktopId for every v1 record and leaves the rest byte-identical", () => {
    const migrated = migrateRemoteServersPersistedState(
      {
        servers: [directV1, sshV1],
        excludedProjectIds: { "desk-1": ["p1"] },
        projectWorkspaceIds: {},
        projectNameOverrides: {},
        lastKnownProjects: { "desk-1": [] },
      },
      1,
    );
    expect(migrated.servers).toHaveLength(2);
    expect(migrated.servers[0]).toEqual({ ...directV1, connectionId: "desk-1" });
    expect(migrated.servers[1]).toEqual({ ...sshV1, connectionId: "desk-2" });
    // The persisted maps keep their v1 (desktopId) keys untouched.
    expect(migrated.excludedProjectIds).toEqual({ "desk-1": ["p1"] });
  });

  it("never invents a connection id for an unknown record shape", () => {
    const migrated = migrateRemoteServersPersistedState(
      { servers: [{ ...directV1, connectionId: "local-1" }] },
      1,
    );
    expect(migrated.servers[0]?.connectionId).toBe("local-1");
  });

  it("passes a v2 document through unchanged", () => {
    const v2 = { servers: [directV1], excludedProjectIds: {} } as never;
    expect(migrateRemoteServersPersistedState(v2, 2)).toBe(v2);
  });

  it("tolerates a document with no servers array", () => {
    const migrated = migrateRemoteServersPersistedState({}, 1);
    expect(migrated.servers).toEqual([]);
  });
});
