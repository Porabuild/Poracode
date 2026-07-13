import { describe, expect, it } from "vitest";
import { resolveSkillTarget, skillTargetRequest } from "./skillTargets";

const projects = [
  {
    id: "windows-project",
    name: "Windows project",
    location: { kind: "windows" as const, path: "C:\\work\\app" },
  },
  {
    id: "wsl-project",
    name: "WSL project",
    location: {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/work/app",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\work\\app",
    },
  },
];

describe("skill targets", () => {
  it("resolves Windows, WSL user, and project destinations", () => {
    expect(resolveSkillTarget("user", projects)).toEqual({ id: "user", scope: "global" });
    expect(resolveSkillTarget("wsl:Ubuntu", projects)).toEqual({
      id: "wsl:Ubuntu",
      scope: "global",
      wslDistro: "Ubuntu",
    });
    const project = resolveSkillTarget("project:wsl-project", projects);
    expect(project).toMatchObject({
      id: "project:wsl-project",
      scope: "project",
      project: projects[1],
    });
    expect(skillTargetRequest(project)).toEqual({ projectLocation: projects[1]!.location });
  });
});
