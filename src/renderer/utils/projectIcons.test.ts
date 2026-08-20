import { describe, expect, it } from "vitest";
import {
  findProjectIcon,
  PROJECT_ICONS,
  projectIconDisplayName,
  searchProjectIcons,
} from "./projectIcons";

describe("project icon catalog", () => {
  it("has unique, non-empty kebab-case ids", () => {
    const ids = PROJECT_ICONS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("resolves entries by id", () => {
    expect(findProjectIcon("rocket")).toBeDefined();
    expect(findProjectIcon("not-a-real-icon")).toBeUndefined();
  });

  it("searches ids and keywords case-insensitively", () => {
    expect(searchProjectIcons("rocket").some((entry) => entry.id === "rocket")).toBe(true);
    // Keyword match: "deploy" is a keyword on the rocket entry.
    expect(searchProjectIcons("deploy").some((entry) => entry.id === "rocket")).toBe(true);
    // Queries are matched case-insensitively in both directions.
    expect(searchProjectIcons("ROCKET").some((entry) => entry.id === "rocket")).toBe(true);
    expect(searchProjectIcons("Deploy").some((entry) => entry.id === "rocket")).toBe(true);
    // Multi-term search is an AND across terms.
    expect(searchProjectIcons("folder git").some((entry) => entry.id === "folder-git")).toBe(true);
    expect(searchProjectIcons("zzz-no-match")).toHaveLength(0);
    // Empty query returns the full catalog.
    expect(searchProjectIcons("")).toHaveLength(PROJECT_ICONS.length);
  });

  it("humanizes ids for display", () => {
    expect(projectIconDisplayName("rocket")).toBe("Rocket");
    expect(projectIconDisplayName("folder-git")).toBe("Folder Git");
    expect(projectIconDisplayName("square-terminal")).toBe("Square Terminal");
  });
});
