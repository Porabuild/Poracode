// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { Project } from "@/shared/contracts";
import { buildActiveProjectsKey, buildWslProjectDistrosKey } from "./projectKeys";

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
});
