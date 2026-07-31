import { describe, expect, it } from "vitest";
import type { GitRemoteInfo, Project } from "@/shared/contracts";
import { dedupePrProjects, repoIdentityKey } from "./prProjectDedupe";

function project(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    name: id,
    location: { kind: "windows", path: `E:\\work\\${id}` },
    createdAt: "2026-07-13T10:00:00.000Z",
    ...overrides,
  };
}

const httpsRemote: GitRemoteInfo = {
  url: "https://github.com/SDSLeon/lightcode.git",
  platform: "github",
  owner: "SDSLeon",
  repo: "lightcode",
};

const sshAliasRemote: GitRemoteInfo = {
  url: "gh-personal:sdsleon/Lightcode.git",
  platform: "unknown",
  owner: "sdsleon",
  repo: "Lightcode",
};

describe("repoIdentityKey", () => {
  it("matches the same repo across https and SSH-alias remotes", () => {
    expect(repoIdentityKey(httpsRemote)).toBe("sdsleon/lightcode");
    expect(repoIdentityKey(sshAliasRemote)).toBe(repoIdentityKey(httpsRemote));
  });

  it("returns null when the origin remote is unknown", () => {
    expect(repoIdentityKey(null)).toBeNull();
    expect(repoIdentityKey(undefined)).toBeNull();
    expect(repoIdentityKey({ ...httpsRemote, owner: " " })).toBeNull();
  });
});

describe("dedupePrProjects", () => {
  const local = project("local");
  const mirrored = project("mirrored", { remoteServerId: "mac", remoteId: "remote-1" });

  it("keeps the local checkout when a mirrored project shares its origin", () => {
    const keys = { local: "sdsleon/lightcode", mirrored: "sdsleon/lightcode" };
    expect(dedupePrProjects([local, mirrored], (p) => keys[p.id as keyof typeof keys])).toEqual([
      local,
    ]);
    expect(dedupePrProjects([mirrored, local], (p) => keys[p.id as keyof typeof keys])).toEqual([
      local,
    ]);
  });

  it("keeps the first project when neither or both are mirrored", () => {
    const second = project("second", { remoteServerId: "mac", remoteId: "remote-2" });
    expect(dedupePrProjects([mirrored, second], () => "sdsleon/lightcode")).toEqual([mirrored]);
    expect(dedupePrProjects([local, project("other")], () => "sdsleon/lightcode")).toEqual([local]);
  });

  it("keeps projects with different or unknown repo identities", () => {
    const other = project("other");
    const unknownA = project("unknown-a");
    const unknownB = project("unknown-b");
    const keys: Record<string, string | null> = {
      local: "sdsleon/lightcode",
      other: "sdsleon/other",
      "unknown-a": null,
      "unknown-b": null,
    };
    expect(dedupePrProjects([local, other, unknownA, unknownB], (p) => keys[p.id] ?? null)).toEqual(
      [local, other, unknownA, unknownB],
    );
  });
});
