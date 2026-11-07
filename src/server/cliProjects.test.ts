import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { parseProjectCli, runProjectCli } from "./cliProjects";
import { parseServerCliCommand } from "./cliParse";
import { cliCommandHelp } from "./cliHelp";
import { renderAdminResult } from "./cliAdminOutput";

it("parses project commands before owner discovery and preserves explicit targets", () => {
  expect(parseServerCliCommand(["projects", "add", "."])).toBe("admin");
  expect(parseServerCliCommand(["projects", "add", "--help"])).toBe("help");
  expect(parseProjectCli(["projects", "add", ".", "--name", " Saved ", "--json"])).toEqual({
    command: { action: "projects-add", path: resolve("."), name: "Saved" },
    json: true,
  });
  expect(parseProjectCli(["projects", "list"])).toEqual({
    command: { action: "projects-list", limit: 50 },
    json: false,
  });
  expect(parseProjectCli(["projects", "list", "--limit", "2", "--cursor", "opaque"])).toMatchObject(
    { command: { limit: 2, cursor: "opaque" } },
  );
  expect(cliCommandHelp("projects", "add")).toContain("local-admin v14");
});

it.each([
  ["projects", "remove", "id"],
  ["projects", "add"],
  ["projects", "add", ""],
  ["projects", "inspect", "id", "extra"],
  ["projects", "list", "extra"],
  ["projects", "list", "--limit", "0"],
  ["projects", "list", "--limit", "101"],
  ["projects", "list", "--limit", "1.5"],
  ["projects", "list", "--limit", "1e1"],
  ["projects", "list", "--cursor", ""],
  ["projects", "add", ".", "--name", " "],
  ["projects", "inspect", "id", "--name", "new"],
])("refuses unsupported/invalid project arguments: %j", (...args) => {
  expect(() => parseProjectCli(args)).toThrow(Error);
});

it("renders escaped project metadata and pagination while refusing private response fields", async () => {
  const project = {
    id: "saved-id",
    name: "Untrusted\u001b[31m",
    location: { kind: "posix" as const, path: "/repo" },
    disabled: false,
    createdAt: "2026-10-21T00:00:00Z",
  };
  const result = {
    formatVersion: 1,
    scope: "persisted-profile",
    projects: [project],
    nextCursor: "next",
  };
  const text = renderAdminResult({ action: "projects-list", limit: 2 }, result);
  expect(text).not.toContain("\u001b");
  expect(text).toContain("--limit 2 --cursor next");
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  try {
    await runProjectCli(
      parseProjectCli(["projects", "list", "--json"])!,
      async () => async () => result,
    );
    expect(JSON.parse(String(stdout.mock.calls[0]![0]))).toEqual(result);
    stdout.mockClear();
    await expect(
      runProjectCli(parseProjectCli(["projects", "list", "--json"])!, async () => async () => ({
        ...result,
        secret: "must-not-print",
      })),
    ).rejects.toThrow("Unrecognized key");
    expect(stdout).not.toHaveBeenCalled();
  } finally {
    stdout.mockRestore();
  }
});

it("does not print a mismatched inspected subject or oversized requested page", async () => {
  const project = {
    id: "other-project",
    name: "Other",
    location: { kind: "posix", path: "/repo" },
    disabled: false,
    createdAt: "2026-10-21T00:00:00Z",
  };
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  try {
    await expect(
      runProjectCli(
        parseProjectCli(["projects", "inspect", "selected", "--json"])!,
        async () => async () => ({ formatVersion: 1, scope: "persisted-profile", project }),
      ),
    ).rejects.toThrow("different project");
    await expect(
      runProjectCli(
        parseProjectCli(["projects", "list", "--limit", "1", "--json"])!,
        async () => async () => ({
          formatVersion: 1,
          scope: "persisted-profile",
          projects: [project, project],
          nextCursor: null,
        }),
      ),
    ).rejects.toThrow("more projects");
    expect(stdout).not.toHaveBeenCalled();
  } finally {
    stdout.mockRestore();
  }
});
