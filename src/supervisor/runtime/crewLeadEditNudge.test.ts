import { describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { ThreadCrewBinding } from "@/shared/crew";
import {
  fileChangePath,
  isProjectFilePath,
  launchMayReceiveContextSteers,
  projectLocationsOverlap,
  watchesCrewLeadEdits,
} from "./crewLeadEditNudge";

const crew: ThreadCrewBinding = {
  version: 1,
  policy: "crew-only",
  roles: [{ id: "sidekick", label: "Sidekick", selection: { agentKind: "example", model: "m" } }],
};
const posixRepo: ProjectLocation = { kind: "posix", path: "/work/repo" };
const windowsRepo: ProjectLocation = { kind: "windows", path: "C:\\work\\repo" };
const wslRepo: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/dev/repo",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\dev\\repo",
};

describe("watchesCrewLeadEdits", () => {
  it("watches a crew with a role that may edit", () => {
    expect(watchesCrewLeadEdits({ model: "m", crew })).toBe(true);
  });

  it("ignores threads without a crew and crews whose roles may not edit", () => {
    expect(watchesCrewLeadEdits(undefined)).toBe(false);
    expect(watchesCrewLeadEdits({ model: "m" })).toBe(false);
    expect(watchesCrewLeadEdits({ model: "m", crew: null })).toBe(false);
    expect(watchesCrewLeadEdits({ model: "m", crew: { ...crew, roles: [] } })).toBe(false);
    expect(
      watchesCrewLeadEdits({
        model: "m",
        crew: { ...crew, roles: crew.roles.map((role) => ({ ...role, noEdits: true })) },
      }),
    ).toBe(false);
  });
});

describe("launchMayReceiveContextSteers", () => {
  it("marks only a GUI crew lead launched with Crossagents whose crew may edit", () => {
    const lead = { model: "m", crew };
    expect(launchMayReceiveContextSteers(lead, "gui", true)).toBe(true);
    expect(launchMayReceiveContextSteers(lead, "gui", false)).toBe(false);
    expect(launchMayReceiveContextSteers(lead, "terminal", true)).toBe(false);
    expect(launchMayReceiveContextSteers({ model: "m" }, "gui", true)).toBe(false);
    expect(
      launchMayReceiveContextSteers(
        { model: "m", crew: { ...crew, roles: [{ ...crew.roles[0]!, noEdits: true }] } },
        "gui",
        true,
      ),
    ).toBe(false);
  });
});

describe("fileChangePath", () => {
  it("reads a non-empty canonical path only", () => {
    expect(fileChangePath({ path: "src/a.ts", changeKind: "edit" })).toBe("src/a.ts");
    expect(fileChangePath({ path: "", changeKind: "edit" })).toBeUndefined();
    expect(fileChangePath({ changeKind: "edit" })).toBeUndefined();
    expect(fileChangePath({ path: 3 })).toBeUndefined();
    expect(fileChangePath(undefined)).toBeUndefined();
    expect(fileChangePath("src/a.ts")).toBeUndefined();
  });
});

describe("isProjectFilePath", () => {
  it("accepts absolute and relative paths inside a POSIX project", () => {
    expect(isProjectFilePath(posixRepo, "/work/repo/src/a.ts")).toBe(true);
    expect(isProjectFilePath(posixRepo, "src/a.ts")).toBe(true);
    expect(isProjectFilePath(posixRepo, "./src/../b.ts")).toBe(true);
  });

  it("rejects the root itself, escapes, siblings and plan files outside the project", () => {
    expect(isProjectFilePath(posixRepo, "/work/repo")).toBe(false);
    expect(isProjectFilePath(posixRepo, "../other/a.ts")).toBe(false);
    expect(isProjectFilePath(posixRepo, "/work/repo-other/a.ts")).toBe(false);
    expect(isProjectFilePath(posixRepo, "/Users/dev/.claude/plans/plan.md")).toBe(false);
    expect(isProjectFilePath(posixRepo, "C:\\work\\repo\\a.ts")).toBe(false);
  });

  it("compares Windows paths with Windows rules", () => {
    expect(isProjectFilePath(windowsRepo, "C:\\work\\repo\\src\\a.ts")).toBe(true);
    expect(isProjectFilePath(windowsRepo, "c:/work/repo/src/a.ts")).toBe(true);
    expect(isProjectFilePath(windowsRepo, "src\\a.ts")).toBe(true);
    expect(isProjectFilePath(windowsRepo, "D:\\work\\repo\\a.ts")).toBe(false);
    expect(isProjectFilePath(windowsRepo, "C:\\Users\\dev\\.claude\\plans\\plan.md")).toBe(false);
  });

  it("reads a WSL agent's Linux paths and the distro's UNC form", () => {
    expect(isProjectFilePath(wslRepo, "/home/dev/repo/src/a.ts")).toBe(true);
    expect(isProjectFilePath(wslRepo, "src/a.ts")).toBe(true);
    expect(
      isProjectFilePath(wslRepo, "\\\\wsl.localhost\\Ubuntu\\home\\dev\\repo\\src\\a.ts"),
    ).toBe(true);
    expect(isProjectFilePath(wslRepo, "\\\\wsl.localhost\\Debian\\home\\dev\\repo\\a.ts")).toBe(
      false,
    );
    expect(isProjectFilePath(wslRepo, "/home/dev/.claude/plans/plan.md")).toBe(false);
    expect(isProjectFilePath(wslRepo, "C:\\Users\\dev\\a.ts")).toBe(false);
  });
});

describe("projectLocationsOverlap", () => {
  it("overlaps the same location and one nested in the other", () => {
    expect(projectLocationsOverlap(posixRepo, { kind: "posix", path: "/work/repo/" })).toBe(true);
    expect(projectLocationsOverlap(posixRepo, { kind: "posix", path: "/work/repo/pkg" })).toBe(
      true,
    );
    expect(projectLocationsOverlap({ kind: "posix", path: "/work/repo/pkg" }, posixRepo)).toBe(
      true,
    );
    expect(projectLocationsOverlap(windowsRepo, { kind: "windows", path: "c:\\Work\\Repo" })).toBe(
      true,
    );
    expect(projectLocationsOverlap(wslRepo, { ...wslRepo, distro: "ubuntu" })).toBe(true);
  });

  it("keeps siblings, other kinds and other distros apart", () => {
    expect(projectLocationsOverlap(posixRepo, { kind: "posix", path: "/work/repo-2" })).toBe(false);
    expect(projectLocationsOverlap(posixRepo, { kind: "windows", path: "C:\\work\\repo" })).toBe(
      false,
    );
    expect(projectLocationsOverlap(wslRepo, { ...wslRepo, distro: "Debian" })).toBe(false);
  });
});
