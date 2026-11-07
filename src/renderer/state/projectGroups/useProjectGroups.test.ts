import { beforeEach, describe, expect, it } from "vitest";
import type { GitStatusResult, Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProjectGroupStore } from "./projectGroupStore";
import { projectEnvironmentKey, separateFromGroup, syncedMembers } from "./projectGroups";
import { getProjectGroupIndex } from "./useProjectGroups";

function project(id: string, name: string, remoteServerId?: string): Project {
  return {
    id,
    name,
    location: remoteServerId
      ? { kind: "posix", path: `/${id}`, remoteServerId }
      : { kind: "windows", path: `C:\\${id}` },
    createdAt: "2026-07-13T10:00:00.000Z",
    ...(remoteServerId ? { remoteServerId, remoteId: id } : {}),
  };
}

function origin(url: string): GitStatusResult {
  return {
    remoteInfo: { url, platform: "github", owner: "me", repo: url.split("/").pop()! },
  } as GitStatusResult;
}

function originFor(url: string, owner: string, repo: string): GitStatusResult {
  return { remoteInfo: { url, platform: "github", owner, repo } } as GitStatusResult;
}

function wslProject(id: string, name: string): Project {
  return {
    id,
    name,
    location: {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: `/home/me/${id}`,
      uncPath: `\\\\wsl$\\Ubuntu\\home\\me\\${id}`,
    },
    createdAt: "2026-07-13T10:00:00.000Z",
  };
}

interface CrossEnvironmentRow {
  readonly project: Project;
  readonly status: GitStatusResult;
  readonly aliased: boolean;
}

function crossEnvironmentRows(
  key: string,
  name: string,
  owner: string,
  repo: string,
): CrossEnvironmentRow[] {
  const row = (member: Project, url: string, aliased: boolean): CrossEnvironmentRow => ({
    project: member,
    status: originFor(url, owner, repo),
    aliased,
  });
  return [
    // Local and WSL rows carry the owning host's confirmed HTTPS metadata.
    row(project(`win-${key}`, name), `https://github.com/${owner}/${repo}.git`, false),
    row(wslProject(`wsl-${key}`, name), `https://github.com/${owner}/${repo}.git`, false),
    // Paired rows still have raw aliases cached from an older host build.
    row(project(`mac-${key}`, name, "mac"), `git@gh-personal:${owner}/${repo}.git`, true),
    row(project(`studio-${key}`, name, "studio"), `git@gitlab-work:${owner}/${repo}.git`, true),
  ];
}

const PROJECT_VARIANTS = [
  { slug: "herogpui", name: "HeroGPUI", owner: "Porabuild", repo: "HeroGPUI" },
  { slug: "poracode", name: "Pora.code", owner: "Porabuild", repo: "Poracode" },
  { slug: "porabuild", name: "Pora.build", owner: "Porabuild", repo: "website" },
  { slug: "poratake", name: "Pora.take", owner: "Porabuild", repo: "Pora.take" },
  { slug: "research-notes", name: "Research Notes", owner: "acme", repo: "research-notes" },
  { slug: "etude", name: "Étude Cœur", owner: "acme", repo: "etude-coeur" },
] as const;

const COMPANION_REPO = { name: "Gamma Tools", owner: "acme", repo: "gamma-tools" } as const;

const members = (id: string) =>
  getProjectGroupIndex()
    .groupByProjectId.get(id)
    ?.members.map((member) => member.id);

describe("getProjectGroupIndex", () => {
  beforeEach(() => {
    useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: {} });
    useGitStore.setState({ statuses: {} });
    useAppStore.setState({ projects: [project("a", "app"), project("m", "renamed", "mac")] });
  });

  it("returns the same index until an input changes", () => {
    const first = getProjectGroupIndex();
    expect(getProjectGroupIndex()).toBe(first);
    useAppStore.setState((state) => ({ projects: [...state.projects] }));
    expect(getProjectGroupIndex()).not.toBe(first);
  });

  it("regroups once origins load, and on manual overrides", () => {
    expect(members("a")).toEqual(["a"]);
    useGitStore.setState({
      statuses: {
        a: origin("https://github.com/me/app"),
        m: origin("https://github.com/me/app"),
      },
    });
    expect(members("a")).toEqual(["a", "m"]);

    useProjectGroupStore.setState({ manualGroups: { m: "solo:m" }, lastUsedAt: {} });
    expect(members("a")).toEqual(["a"]);
  });

  it("groups an unresolved SSH alias by name without sharing settings until the host confirms it", () => {
    useAppStore.setState({
      projects: [project("a", "Pora.code"), project("m", "Pora.code", "mac")],
    });
    const confirmed = origin("https://github.com/Porabuild/Poracode.git");
    const alias = origin("git@github.com-SDSLeon:Porabuild/Poracode.git");
    useGitStore.setState({ statuses: { a: confirmed, m: alias } });

    expect(members("a")).toEqual(["a", "m"]);
    const before = getProjectGroupIndex().groupByProjectId.get("a")!;
    expect(syncedMembers(before, "a").map((member) => member.id)).toEqual(["a"]);
    expect(syncedMembers(before, "m").map((member) => member.id)).toEqual(["m"]);

    useGitStore.getState().setStatus("m", {
      ...alias,
      remoteInfo: { ...alias.remoteInfo!, url: "https://github.com/Porabuild/Poracode.git" },
    });
    expect(members("a")).toEqual(["a", "m"]);
    const confirmedGroup = getProjectGroupIndex().groupByProjectId.get("a")!;
    expect(syncedMembers(confirmedGroup, "a").map((member) => member.id)).toEqual(["a", "m"]);

    // A later host refresh to a real different origin proves they are not one repository.
    useGitStore.getState().setStatus("m", {
      ...alias,
      remoteInfo: {
        ...alias.remoteInfo!,
        url: "https://git.company.example/Porabuild/Poracode.git",
      },
    });
    expect(members("a")).toEqual(["a"]);
  });

  it("keeps a manual separation after an SSH alias becomes unknown", () => {
    useAppStore.setState({
      projects: [project("a", "Pora.code"), project("m", "Pora.code", "mac")],
    });
    useGitStore.setState({
      statuses: {
        a: origin("https://github.com/Porabuild/Poracode.git"),
        m: origin("https://github.com/Porabuild/Poracode.git"),
      },
    });
    expect(members("a")).toEqual(["a", "m"]);
    const store = useProjectGroupStore.getState();
    store.setOverrides(separateFromGroup(store, "m"));

    useGitStore.getState().setStatus("m", origin("git@github.com-SDSLeon:Porabuild/Poracode.git"));
    expect(members("a")).toEqual(["a"]);
    expect(members("m")).toEqual(["m"]);
  });

  it("groups renamed environments by origin and splits names with different origins", () => {
    const local = project("renamed-local", "Local Name");
    const wsl = wslProject("renamed-wsl", "WSL Name");
    const mac = project("renamed-mac", "Mac Name", "mac");
    const sameNameLocal = project("same-local", "Same");
    const sameNameMac = project("same-mac", "Same", "mac");
    useAppStore.setState({
      projects: [local, wsl, mac, sameNameLocal, sameNameMac],
    });
    useGitStore.setState({
      statuses: {
        [local.id]: origin("https://github.com/acme/shared.git"),
        [wsl.id]: origin("https://github.com/acme/shared.git"),
        [mac.id]: origin("https://github.com/acme/shared.git"),
        [sameNameLocal.id]: origin("https://github.com/acme/one.git"),
        [sameNameMac.id]: origin("https://git.company.example/acme/one.git"),
      },
    });

    const index = getProjectGroupIndex();
    expect(index.groupByProjectId.get(local.id)?.members.map((member) => member.id)).toEqual([
      local.id,
      wsl.id,
      mac.id,
    ]);
    expect(syncedMembers(index.groupByProjectId.get(local.id)!, local.id)).toHaveLength(3);
    expect(
      index.groupByProjectId.get(sameNameLocal.id)?.members.map((member) => member.id),
    ).toEqual([sameNameLocal.id]);
    expect(index.groupByProjectId.get(sameNameMac.id)?.members.map((member) => member.id)).toEqual([
      sameNameMac.id,
    ]);
  });

  it("never syncs one alias text across hosts before each authority is confirmed", () => {
    const mac = project("alias-mac", "Shared Repo", "mac");
    const studio = project("alias-studio", "Shared Repo", "studio");
    useAppStore.setState({ projects: [mac, studio] });
    const alias = "git@github.com-work:acme/shared.git";
    useGitStore.setState({
      statuses: { [mac.id]: origin(alias), [studio.id]: origin(alias) },
    });

    expect(members(mac.id)).toEqual([mac.id, studio.id]);
    const unconfirmed = getProjectGroupIndex().groupByProjectId.get(mac.id)!;
    expect(syncedMembers(unconfirmed, mac.id).map((member) => member.id)).toEqual([mac.id]);
    expect(syncedMembers(unconfirmed, studio.id).map((member) => member.id)).toEqual([studio.id]);

    useGitStore.getState().setStatus(mac.id, origin("https://github.com/acme/shared.git"));
    useGitStore
      .getState()
      .setStatus(studio.id, origin("https://git.company.example/acme/shared.git"));
    expect(members(mac.id)).toEqual([mac.id]);
    expect(members(studio.id)).toEqual([studio.id]);
  });

  it.each(PROJECT_VARIANTS)(
    "groups every environment of $name and a second repository without merging them",
    ({ slug, name, owner, repo }) => {
      const primary = crossEnvironmentRows(slug, name, owner, repo);
      const companion = crossEnvironmentRows(
        `${slug}-companion`,
        COMPANION_REPO.name,
        COMPANION_REPO.owner,
        COMPANION_REPO.repo,
      );
      const rows = [...primary, ...companion];
      useAppStore.setState({ projects: rows.map((row) => row.project) });
      useGitStore.setState({
        statuses: Object.fromEntries(rows.map((row) => [row.project.id, row.status])),
      });

      const index = getProjectGroupIndex();
      expect(index.groups).toHaveLength(2);

      for (const expected of [primary, companion]) {
        const group = index.groupByProjectId.get(expected[0]!.project.id)!;
        expect(group.members.map((member) => member.id)).toEqual(
          expected.map((row) => row.project.id),
        );
        expect(group.members.map(projectEnvironmentKey)).toEqual([
          "local",
          "local/wsl:Ubuntu",
          "remote:mac",
          "remote:studio",
        ]);
        for (const row of expected) {
          expect(index.groupByProjectId.get(row.project.id)).toBe(group);
        }
        expect(syncedMembers(group, expected[0]!.project.id).map((member) => member.id)).toEqual([
          expected[0]!.project.id,
          expected[1]!.project.id,
        ]);
        for (const row of expected.filter((entry) => entry.aliased)) {
          expect(syncedMembers(group, row.project.id).map((member) => member.id)).toEqual([
            row.project.id,
          ]);
        }
      }
    },
  );
});
