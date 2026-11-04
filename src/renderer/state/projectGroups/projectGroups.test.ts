import { describe, expect, it } from "vitest";
import type { Project } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import {
  deriveProjectGroups,
  combineGroups,
  groupProjectRows,
  linkGroupMembers,
  syncedMembers,
  unconfirmedMembers,
  projectEnvironmentKey,
  separateFromGroup,
  type ProjectGroupOverrides,
} from "./projectGroups";
import { pickGroupMember } from "./useProjectGroups";

function local(id: string, name = id, overrides: Partial<Project> = {}): Project {
  return {
    id,
    name,
    location: { kind: "windows", path: `E:\\work\\${id}` },
    createdAt: "2026-07-13T10:00:00.000Z",
    ...overrides,
  };
}

function remote(server: string, remoteId: string, name = remoteId): Project {
  return {
    id: `remote:${server}:project:${remoteId}`,
    name,
    remoteServerId: server,
    remoteId,
    location: { kind: "posix", path: `/Users/me/${remoteId}`, remoteServerId: server },
    createdAt: "2026-07-13T10:00:00.000Z",
  };
}

const NONE: ProjectGroupOverrides = { manualGroups: {} };
const noRepo = () => null;

function ids(index: ReturnType<typeof deriveProjectGroups>): string[][] {
  return index.groups.map((group) => group.members.map((member) => member.id));
}

describe("deriveProjectGroups", () => {
  it("groups the same project name across environments, local first", () => {
    const mac = remote("mac", "p1", "Pora.code");
    const pc = local("pc", "pora.code");
    const index = deriveProjectGroups([mac, pc], noRepo, NONE);
    expect(ids(index)).toEqual([["pc", mac.id]]);
    expect(index.groupByProjectId.get(mac.id)?.anchor.id).toBe("pc");
    expect(index.groups[0]!.id).toBe("pc");
  });

  it("never puts two rows from one environment in a group", () => {
    const index = deriveProjectGroups([local("a", "App"), local("b", "App")], noRepo, NONE);
    expect(ids(index)).toEqual([["a"], ["b"]]);
  });

  it("keeps a WSL checkout as its own environment", () => {
    const wsl: Project = {
      ...local("w", "App"),
      location: { kind: "wsl", distro: "Ubuntu", linuxPath: "/home/me/app", uncPath: "\\\\wsl$" },
    };
    const index = deriveProjectGroups([local("a", "App"), wsl], noRepo, NONE);
    expect(ids(index)).toEqual([["a", "w"]]);
    expect(projectEnvironmentKey(wsl)).toBe("local/wsl:Ubuntu");
  });

  it("orders environments like the machine list: Local, WSL, then paired machines", () => {
    const wsl: Project = {
      ...local("w", "App"),
      location: { kind: "wsl", distro: "Ubuntu", linuxPath: "/home/me/app", uncPath: "\\wsl$" },
    };
    const index = deriveProjectGroups(
      [remote("mac", "x", "App"), wsl, local("a", "App")],
      noRepo,
      NONE,
    );
    expect(ids(index)).toEqual([["a", "w", remote("mac", "x").id]]);
  });

  it("lets known origins override names in both directions", () => {
    const repos: Record<string, string> = {
      a: "github.com/me/app",
      [remote("mac", "x").id]: "github.com/me/app",
      b: "github.com/me/other",
      [remote("mac2", "y").id]: "github.com/someone/else",
    };
    const index = deriveProjectGroups(
      [
        local("a", "App"),
        remote("mac", "x", "Renamed"),
        local("b", "Same"),
        remote("mac2", "y", "Same"),
      ],
      (project) => repos[project.id] ?? null,
      NONE,
    );
    expect(ids(index)).toEqual([["a", remote("mac", "x").id], ["b"], [remote("mac2", "y").id]]);
  });

  it("falls back to the name when only one side's origin is known", () => {
    const index = deriveProjectGroups(
      [local("a", "App"), remote("mac", "x", "App")],
      (project) => (project.id === "a" ? "github.com/me/app" : null),
      NONE,
    );
    expect(ids(index)).toEqual([["a", remote("mac", "x").id]]);
  });

  it("keeps Home on its own", () => {
    const home = local(HOME_PROJECT_ID, "Home");
    const index = deriveProjectGroups([home, remote("mac", "h", "Home")], noRepo, NONE);
    expect(ids(index)).toEqual([[HOME_PROJECT_ID], [remote("mac", "h").id]]);
  });

  it("honors separate and join overrides", () => {
    const mac = remote("mac", "x", "App");
    const other = remote("mac2", "z", "Different");
    const projects = [local("a", "App"), mac, other];
    const auto = deriveProjectGroups(projects, noRepo, NONE);
    const separated = separateFromGroup(NONE, mac.id);
    expect(ids(deriveProjectGroups(projects, noRepo, separated))).toEqual([
      ["a"],
      [mac.id],
      [other.id],
    ]);

    const joined = combineGroups(
      NONE,
      auto.groupByProjectId.get("a")!,
      auto.groupByProjectId.get(other.id)!,
    );
    expect(joined).not.toBeNull();
    expect(ids(deriveProjectGroups(projects, noRepo, joined!))).toEqual([["a", mac.id, other.id]]);
  });

  it("refuses to combine groups that share an environment", () => {
    const projects = [local("a", "App"), remote("mac", "x", "App"), remote("mac", "y", "Other")];
    const index = deriveProjectGroups(projects, noRepo, NONE);
    expect(
      combineGroups(
        NONE,
        index.groupByProjectId.get("a")!,
        index.groupByProjectId.get(projects[2]!.id)!,
      ),
    ).toBeNull();
  });

  it("keeps the earliest member's position in the input order", () => {
    const index = deriveProjectGroups(
      [remote("mac", "b", "B"), local("a", "A"), local("b", "B")],
      noRepo,
      NONE,
    );
    expect(ids(index)).toEqual([["b", remote("mac", "b").id], ["a"]]);
  });
});

describe("linked members", () => {
  it("links members only by a shared known origin or a manual group", () => {
    const projects = [local("a", "App"), remote("mac", "x", "App"), remote("mac2", "y", "App")];
    const repos: Record<string, string> = {
      a: "github.com/me/app",
      [remote("mac", "x").id]: "github.com/me/app",
    };
    const index = deriveProjectGroups(projects, (project) => repos[project.id] ?? null, NONE);
    const group = index.groupByProjectId.get("a")!;
    expect(group.members.map((member) => member.id)).toHaveLength(3);
    expect(syncedMembers(group, "a").map((member) => member.id)).toEqual([
      "a",
      remote("mac", "x").id,
    ]);
    expect(unconfirmedMembers(group, "a").map((member) => member.id)).toEqual([
      remote("mac2", "y").id,
    ]);
    // The name-only member shares settings with nobody but itself.
    expect(syncedMembers(group, remote("mac2", "y").id).map((member) => member.id)).toEqual([
      remote("mac2", "y").id,
    ]);

    const linked = deriveProjectGroups(projects, noRepo, linkGroupMembers(NONE, group));
    const linkedGroup = linked.groupByProjectId.get("a")!;
    expect(syncedMembers(linkedGroup, "a")).toHaveLength(3);
  });

  it("never re-links a separated row when its old group is linked again", () => {
    const projects = [local("a", "One"), remote("mac", "b", "Two"), remote("mac2", "d", "Three")];
    const index = (overrides: ProjectGroupOverrides) =>
      deriveProjectGroups(projects, noRepo, overrides);
    const linked = combineGroups(
      NONE,
      index(NONE).groupByProjectId.get("a")!,
      index(NONE).groupByProjectId.get(remote("mac", "b").id)!,
    )!;
    const separated = separateFromGroup(linked, "a");
    const relinked = combineGroups(
      separated,
      index(separated).groupByProjectId.get("a")!,
      index(separated).groupByProjectId.get(remote("mac2", "d").id)!,
    )!;
    expect(ids(index(relinked))).toEqual([["a", remote("mac2", "d").id], [remote("mac", "b").id]]);
  });

  it("keeps a manual group to one row per environment", () => {
    const projects = [local("a", "One"), local("b", "Two"), remote("mac", "x", "Three")];
    const index = deriveProjectGroups(projects, noRepo, {
      manualGroups: { a: "g", b: "g", [remote("mac", "x").id]: "g" },
    });
    expect(ids(index)).toEqual([["a", remote("mac", "x").id], ["b"]]);
  });

  it("moves the group id to the next member when the anchor is separated", () => {
    const projects = [local("a", "App"), remote("mac", "x", "App"), remote("mac2", "y", "App")];
    const index = deriveProjectGroups(projects, noRepo, separateFromGroup(NONE, "a"));
    expect(index.groupByProjectId.get(remote("mac", "x").id)?.id).toBe(remote("mac", "x").id);
    expect(index.groupByProjectId.get("a")?.members.map((member) => member.id)).toEqual(["a"]);
  });

  it("matches names regardless of case and surrounding spaces, never empty names", () => {
    const index = deriveProjectGroups(
      [local("a", " App "), remote("mac", "x", "app"), local("e", "  "), remote("mac", "z", "")],
      noRepo,
      NONE,
    );
    expect(ids(index)).toEqual([["a", remote("mac", "x").id], ["e"], [remote("mac", "z").id]]);
  });
});

describe("groupProjectRows", () => {
  it("collapses listed rows by group in list order and keys rows by a listed member", () => {
    const projects = [remote("mac", "x", "App"), local("b", "Beta"), local("a", "App")];
    const index = deriveProjectGroups(projects, noRepo, NONE);
    const rows = groupProjectRows(projects, index);
    expect(rows.map((row) => row.members.map((member) => member.id))).toEqual([
      ["a", remote("mac", "x").id],
      ["b"],
    ]);
    // Keyed by the first member in group order, which stays stable while it is listed.
    expect(rows[0]!.id).toBe("a");
    expect(groupProjectRows([remote("mac", "x", "App")], index)[0]!.id).toBe(remote("mac", "x").id);
  });
});

describe("pickGroupMember", () => {
  const index = deriveProjectGroups(
    [local("a", "App"), remote("mac", "x", "App"), remote("mac2", "y", "App")],
    noRepo,
    NONE,
  );
  const group = index.groups[0]!;

  it("prefers the most recently used usable member", () => {
    const recent = { [remote("mac2", "y").id]: 20, [remote("mac", "x").id]: 10 };
    expect(pickGroupMember(group.members, () => true, recent)?.id).toBe(remote("mac2", "y").id);
    expect(
      pickGroupMember(group.members, (project) => project.id !== remote("mac2", "y").id, recent)
        ?.id,
    ).toBe(remote("mac", "x").id);
  });

  it("falls back to the local member, then nothing", () => {
    expect(pickGroupMember(group.members, () => true, {})?.id).toBe("a");
    expect(pickGroupMember(group.members, () => false, {})).toBeUndefined();
  });
});
