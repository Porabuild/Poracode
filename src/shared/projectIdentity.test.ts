import { describe, expect, it } from "vitest";
import { dedupeProjects, projectLocationKey } from "./projectIdentity";
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
});
