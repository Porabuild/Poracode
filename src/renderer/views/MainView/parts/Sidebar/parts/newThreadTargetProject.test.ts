import { describe, expect, it } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { pickNewThreadProjectId } from "./newThreadTargetProject";

const project = (id: string) => ({ id }) as Project;
const thread = (projectId: string, updatedAt: string) => ({ projectId, updatedAt }) as Thread;

describe("pickNewThreadProjectId", () => {
  const projects = [project("a"), project("b")];

  it("targets the project of the most recently updated thread", () => {
    const threads = [thread("a", "2026-08-01"), thread("b", "2026-08-02")];
    expect(pickNewThreadProjectId(threads, projects, null)).toBe("b");
  });

  it("ignores threads outside the filter and projects that cannot take a new thread", () => {
    const threads = [
      thread("a", "2026-08-01"),
      thread("b", "2026-08-09"),
      thread("x", "2026-08-10"),
    ];
    expect(pickNewThreadProjectId(threads, projects, new Set(["a"]))).toBe("a");
    expect(pickNewThreadProjectId(threads, [project("a")], null)).toBe("a");
  });

  it("falls back to the first actionable project inside the filter, else the first overall", () => {
    expect(pickNewThreadProjectId([], projects, new Set(["b"]))).toBe("b");
    expect(pickNewThreadProjectId([], projects, null)).toBe("a");
    expect(pickNewThreadProjectId([], [], null)).toBeUndefined();
  });
});
