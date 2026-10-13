// @vitest-environment node

import { describe, expect, it } from "vitest";
import { threadSchema, type Project, type Thread } from "@/shared/contracts";
import {
  buildActiveProjectsKey,
  buildBranchPrPrefetchThreadKeys,
  buildWslProjectDistrosKey,
  diffProjectKeys,
} from "./projectKeys";

function makeProject(
  overrides: Partial<Project> & Pick<Project, "id" | "name" | "location">,
): Project {
  return {
    createdAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("projectKeys", () => {
  it("ignores draft config changes when building the git refresh key", () => {
    const baseProjects: Project[] = [
      makeProject({
        id: "win",
        name: "Windows",
        location: { kind: "windows", path: "C:\\repo" },
      }),
      makeProject({
        id: "wsl",
        name: "WSL",
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: "\\\\wsl$\\Ubuntu\\repo",
        },
      }),
    ];

    const withDraftConfig: Project[] = [
      {
        ...baseProjects[0]!,
        lastDraftConfig: {
          agentKind: "codex",
          model: "gpt-5.4",
          effort: "high",
          approvalPolicy: "never",
          sandboxMode: "danger-full-access",
          mode: "agent",
        },
      },
      baseProjects[1]!,
    ];

    expect(buildActiveProjectsKey(withDraftConfig)).toBe(buildActiveProjectsKey(baseProjects));
  });

  it("tracks active-project changes that should restart git refresh", () => {
    const activeProjects: Project[] = [
      makeProject({
        id: "win",
        name: "Windows",
        location: { kind: "windows", path: "C:\\repo" },
      }),
    ];

    const disabledProjects: Project[] = [{ ...activeProjects[0]!, disabled: true }];
    const movedProjects: Project[] = [
      makeProject({
        id: "win",
        name: "Windows",
        location: { kind: "windows", path: "D:\\repo" },
      }),
    ];

    expect(buildActiveProjectsKey(disabledProjects)).not.toBe(
      buildActiveProjectsKey(activeProjects),
    );
    expect(buildActiveProjectsKey(movedProjects)).not.toBe(buildActiveProjectsKey(activeProjects));
  });

  it("ignores draft config changes when building the WSL distro key", () => {
    const baseProjects: Project[] = [
      makeProject({
        id: "wsl-1",
        name: "Ubuntu",
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: "\\\\wsl$\\Ubuntu\\repo",
        },
      }),
      makeProject({
        id: "wsl-2",
        name: "Debian",
        location: {
          kind: "wsl",
          distro: "Debian",
          linuxPath: "/repo",
          uncPath: "\\\\wsl$\\Debian\\repo",
        },
      }),
    ];

    const withDraftConfig: Project[] = [
      {
        ...baseProjects[0]!,
        lastDraftConfig: {
          agentKind: "claude",
          model: "opus",
          effort: "medium",
          mode: "agent",
        },
      },
      baseProjects[1]!,
    ];

    expect(buildWslProjectDistrosKey(withDraftConfig)).toBe(
      buildWslProjectDistrosKey(baseProjects),
    );
  });

  it("ignores disabled projects when building the WSL distro key", () => {
    const projects: Project[] = [
      makeProject({
        id: "ubuntu-disabled",
        name: "Ubuntu disabled",
        disabled: true,
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/disabled",
          uncPath: "\\\\wsl$\\Ubuntu\\disabled",
        },
      }),
      makeProject({
        id: "debian-active",
        name: "Debian active",
        location: {
          kind: "wsl",
          distro: "Debian",
          linuxPath: "/active",
          uncPath: "\\\\wsl$\\Debian\\active",
        },
      }),
    ];

    expect(buildWslProjectDistrosKey(projects)).toBe("Debian");
  });

  it("keys branch-PR prefetch inputs per project, ignoring order and streamed fields", () => {
    const makeThread = (overrides: Partial<Thread>): Thread =>
      threadSchema.parse({
        id: "thread",
        projectId: "a",
        title: "Thread",
        agentKind: "acp-generic:fixture",
        config: { model: "fixture" },
        status: "working",
        attention: "working",
        canResumeWithConfig: true,
        presentationMode: "gui",
        worktreePath: "/a/wt",
        worktreeBranch: "branch",
        createdAt: "2026-10-07T00:00:00Z",
        updatedAt: "2026-10-07T00:00:00Z",
        ...overrides,
      });
    const first = makeThread({ id: "one" });
    const second = makeThread({ id: "two", projectId: "b", worktreePath: "/b/wt" });
    const keys = buildBranchPrPrefetchThreadKeys([first, second]);

    expect(buildBranchPrPrefetchThreadKeys([second, first])).toEqual(keys);
    expect(
      diffProjectKeys(
        keys,
        buildBranchPrPrefetchThreadKeys([
          { ...first, title: "Renamed", updatedAt: "2026-10-07T00:00:09Z" },
          second,
        ]),
      ),
    ).toEqual(new Set());
    expect(
      diffProjectKeys(
        keys,
        buildBranchPrPrefetchThreadKeys([{ ...first, status: "inactive" }, second]),
      ),
    ).toEqual(new Set(["a"]));
    expect(diffProjectKeys(keys, buildBranchPrPrefetchThreadKeys([first]))).toEqual(new Set(["b"]));
    expect(
      diffProjectKeys(
        keys,
        buildBranchPrPrefetchThreadKeys([{ ...first, projectId: "b" }, second]),
      ),
    ).toEqual(new Set(["a", "b"]));
  });
});
