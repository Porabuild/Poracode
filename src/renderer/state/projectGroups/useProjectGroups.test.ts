import { beforeEach, describe, expect, it } from "vitest";
import type { GitStatusResult, Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProjectGroupStore } from "./projectGroupStore";
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

  it("regroups a released alias status after the owning host refreshes its URL", () => {
    useAppStore.setState({
      projects: [project("a", "Pora.code"), project("m", "Pora.code", "mac")],
    });
    const cached = origin("git@github.com-SDSLeon:Porabuild/Poracode.git");
    useGitStore.setState({
      statuses: { a: origin("git@github.com:Porabuild/Poracode.git"), m: cached },
    });
    expect(members("a")).toEqual(["a"]);
    useGitStore.getState().setStatus("m", {
      ...cached,
      remoteInfo: { ...cached.remoteInfo!, url: "ssh://git@github.com/Porabuild/Poracode.git" },
    });
    expect(members("a")).toEqual(["a", "m"]);
  });
});
