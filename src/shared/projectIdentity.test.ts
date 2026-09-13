import { describe, expect, it } from "vitest";
import { HOME_PROJECT_ID } from "./homeScope";
import { dedupeProjects, projectIdentityKey, projectLocationKey } from "./projectIdentity";
import type { Project } from "./contracts";

function project(id: string, path: string): Project {
  return {
    id,
    name: id,
    location: { kind: "windows", path },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("project identity", () => {
  it("normalizes Windows separators, case, and trailing slashes", () => {
    expect(projectLocationKey({ kind: "windows", path: "C:\\Repo\\" })).toBe(
      projectLocationKey({ kind: "windows", path: "c:/repo" }),
    );
  });

  it("deduplicates equal local locations while preserving the first row", () => {
    const result = dedupeProjects([project("first", "C:\\repo"), project("second", "c:/REPO/")]);
    expect(result.projects.map((item) => item.id)).toEqual(["first"]);
    expect(result.duplicateIds.get("second")).toBe("first");
  });

  it("can apply case-insensitive comparison to macOS POSIX volumes", () => {
    expect(
      projectLocationKey({ kind: "posix", path: "/Users/me/Repo" }, { caseInsensitivePosix: true }),
    ).toBe(
      projectLocationKey({ kind: "posix", path: "/users/me/repo" }, { caseInsensitivePosix: true }),
    );
  });

  it("keeps the synthetic Home project distinct from a real home-folder project", () => {
    const home: Project = {
      ...project("home", "C:\\Users\\me"),
      id: HOME_PROJECT_ID,
    };
    expect(projectIdentityKey(home)).not.toBe(projectIdentityKey(project("real", "C:\\Users\\me")));
  });

  it("preserves the UNC prefix when normalizing Windows paths", () => {
    expect(projectLocationKey({ kind: "windows", path: "\\\\server\\share\\repo" })).toBe(
      "windows://server/share/repo",
    );
    expect(projectLocationKey({ kind: "windows", path: "\\\\server\\share\\repo" })).not.toBe(
      projectLocationKey({ kind: "windows", path: "\\server\\share\\repo" }),
    );
  });

  it("keeps bare Windows drive names distinct from drive roots", () => {
    expect(projectLocationKey({ kind: "windows", path: "C:" })).not.toBe(
      projectLocationKey({ kind: "windows", path: "C:\\" }),
    );
  });

  it("preserves significant POSIX casing, backslashes, and whitespace", () => {
    const base = projectLocationKey({ kind: "posix", path: "/repo" });
    for (const path of ["/Repo", "/repo ", "\\repo"]) {
      expect(projectLocationKey({ kind: "posix", path })).not.toBe(base);
    }
  });

  it("compares WSL distros without case while preserving Linux path case", () => {
    const location = {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
    };
    expect(projectLocationKey(location)).toBe(
      projectLocationKey({ ...location, distro: "ubuntu", linuxPath: "/repo/" }),
    );
    expect(projectLocationKey(location)).not.toBe(
      projectLocationKey({ ...location, linuxPath: "/Repo" }),
    );
  });

  it("distinguishes remote locations even before a project row is decorated", () => {
    const local = project("local", "C:\\repo");
    const remote = { ...local, location: { ...local.location, remoteServerId: "desktop-1" } };
    expect(projectIdentityKey(remote)).not.toBe(projectIdentityKey(local));
    expect(projectIdentityKey(remote)).toBe(
      projectIdentityKey({ ...local, remoteServerId: "desktop-1" }),
    );
    expect(dedupeProjects([local, { ...remote, id: "remote" }]).projects).toHaveLength(2);
  });

  it("never maps a repeated canonical id to itself", () => {
    const canonical = project("canonical", "C:\\repo");
    expect(dedupeProjects([canonical, canonical]).duplicateIds.size).toBe(0);
  });

  it("does not apply a macOS client's POSIX casing rules to a remote host", () => {
    const remote = {
      remoteServerId: "linux-host",
      location: { kind: "posix" as const, path: "/repo" },
    };
    const other = { ...remote, location: { ...remote.location, path: "/Repo" } };
    expect(projectIdentityKey(remote, { caseInsensitivePosix: true })).not.toBe(
      projectIdentityKey(other, { caseInsensitivePosix: true }),
    );
  });
});
