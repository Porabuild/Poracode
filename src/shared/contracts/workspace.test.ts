import { describe, expect, test } from "vitest";
import {
  isProjectInWorkspace,
  nextWorkspaceIconId,
  workspaceListSchema,
  workspaceSchema,
} from "./workspace";

const KNOWN = new Set(["ws-work", "ws-side"]);

describe("workspaceSchema", () => {
  test("accepts a workspace and rejects a blank name", () => {
    expect(
      workspaceSchema.parse({ id: "ws-work", name: "Work", createdAt: "2026-01-01T00:00:00.000Z" }),
    ).toEqual({
      id: "ws-work",
      name: "Work",
      createdAt: "2026-01-01T00:00:00.000Z",
      icon: "briefcase",
    });
    expect(workspaceSchema.safeParse({ id: "ws-work", name: "", createdAt: "t" }).success).toBe(
      false,
    );
  });

  test("migrates legacy workspaces to distinct icons", () => {
    const workspaces = workspaceListSchema.parse([
      { id: "ws-work", name: "Work", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "ws-side", name: "Side Hustle", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);

    expect(workspaces.map((workspace) => workspace.icon)).toEqual(["briefcase", "rocket"]);
    expect(nextWorkspaceIconId(workspaces)).toBe("palette");
  });

  test("repairs duplicate saved icons", () => {
    const workspaces = workspaceListSchema.parse([
      {
        id: "ws-work",
        name: "Work",
        createdAt: "2026-01-01T00:00:00.000Z",
        icon: "rocket",
      },
      {
        id: "ws-side",
        name: "Side Hustle",
        createdAt: "2026-01-01T00:00:00.000Z",
        icon: "rocket",
      },
    ]);

    expect(workspaces.map((workspace) => workspace.icon)).toEqual(["rocket", "briefcase"]);
  });
});

describe("isProjectInWorkspace", () => {
  test("matches only the active workspace", () => {
    expect(isProjectInWorkspace({ workspaceId: "ws-work" }, "ws-work", KNOWN)).toBe(true);
    expect(isProjectInWorkspace({ workspaceId: "ws-side" }, "ws-work", KNOWN)).toBe(false);
  });

  test("an unfiled project stays visible in every workspace", () => {
    expect(isProjectInWorkspace({}, "ws-work", KNOWN)).toBe(true);
    expect(isProjectInWorkspace({ workspaceId: undefined }, "ws-side", KNOWN)).toBe(true);
  });

  test("a dangling workspace id stays visible rather than hiding the project", () => {
    // The workspace was deleted on another device; hiding the project would make
    // it unreachable from the sidebar with no way to recover it.
    expect(isProjectInWorkspace({ workspaceId: "ws-deleted" }, "ws-work", KNOWN)).toBe(true);
  });

  test("no active workspace shows unfiled projects but not filed ones", () => {
    expect(isProjectInWorkspace({}, null, KNOWN)).toBe(true);
    expect(isProjectInWorkspace({ workspaceId: "ws-work" }, null, KNOWN)).toBe(false);
  });
});
