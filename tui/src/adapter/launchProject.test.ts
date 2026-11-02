import { expect, test } from "bun:test";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { remoteProjectSchema } from "@/shared/remote/protocol/resources";
import { resolveLaunchProject, type GitRoots } from "./launchProject";

const project = (id: string, path: string, name = id) =>
  remoteProjectSchema.parse({
    id,
    name,
    location: { kind: "windows", path },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
const home = project(HOME_PROJECT_ID, "C:/Users/me", "Home");
const repo = project("repo", "C:/work/repo");
// An older TUI registered the home folder as a project of its own.
const stray = project("stray", "C:/Users/me", "me");

function fixture(projects = [home, repo], threads: unknown[] = []) {
  const added: string[] = [];
  const client = {
    boundedProjectListPage: async () => ({ projects }),
    boundedThreadListPage: async () => ({ page: { threads } }),
    projectCommand: async (command: { path: string }) => {
      added.push(command.path);
      const created = project("created", command.path);
      projects = [...projects, created];
      return { project: created };
    },
  };
  const resolve = (
    directory: string,
    options: { local?: boolean; git?: GitRoots; projectId?: string } = {},
  ) =>
    resolveLaunchProject({
      client: client as never,
      directory,
      local: options.local ?? true,
      platform: "win32",
      ...(options.projectId ? { projectId: options.projectId } : {}),
      gitRoots: () => options.git,
    });
  return { resolve, added };
}

test("the home folder binds to Home, never a stray project at the same path", async () => {
  const { resolve, added } = fixture([stray, home, repo]);
  expect(await resolve("C:\\Users\\me")).toMatchObject({
    project: { id: HOME_PROJECT_ID },
    directory: "C:/Users/me",
    home: true,
  });
  expect(added).toEqual([]);
});

test("a folder inside a project opens that project at its root", async () => {
  const { resolve } = fixture();
  expect(await resolve("C:\\work\\repo\\src\\lib")).toMatchObject({
    project: { id: "repo" },
    directory: "C:/work/repo",
    home: false,
  });
});

test("a Poracode worktree opens its project in that worktree", async () => {
  const { resolve } = fixture(
    [home, repo],
    [{ id: "t1", projectId: "repo", worktreePath: "C:/work/repo-wt" }],
  );
  expect(await resolve("C:/work/repo-wt/src")).toMatchObject({
    project: { id: "repo" },
    directory: "C:/work/repo-wt",
  });
});

test("a git worktree made outside Poracode maps to its main checkout's project", async () => {
  const { resolve, added } = fixture();
  expect(
    await resolve("D:/elsewhere/feature", {
      git: { toplevel: "D:/elsewhere/feature", mainRoot: "C:/work/repo" },
    }),
  ).toMatchObject({ project: { id: "repo" }, directory: "D:/elsewhere/feature" });
  expect(added).toEqual([]);
});

test("an unregistered git repository is registered at its root", async () => {
  const { resolve, added } = fixture();
  expect(
    await resolve("D:/new/app/src", { git: { toplevel: "D:/new/app", mainRoot: "D:/new/app" } }),
  ).toMatchObject({ project: { id: "created" }, directory: "D:/new/app" });
  expect(added).toEqual(["D:/new/app"]);
});

test("any other folder opens Home without registering it", async () => {
  const { resolve, added } = fixture();
  expect(await resolve("D:/Downloads")).toMatchObject({ project: { id: HOME_PROJECT_ID } });
  expect(added).toEqual([]);
});

test("a remote host ignores this machine's folder and opens its Home", async () => {
  const { resolve, added } = fixture();
  expect(
    await resolve("C:/work/repo", {
      local: false,
      git: { toplevel: "C:/work/repo", mainRoot: "C:/work/repo" },
    }),
  ).toMatchObject({ project: { id: HOME_PROJECT_ID }, home: true });
  expect(added).toEqual([]);
});

test("a host without a Home row keeps registering a local folder", async () => {
  const { resolve, added } = fixture([repo]);
  expect(await resolve("D:/Downloads")).toMatchObject({ project: { id: "created" } });
  expect(added).toEqual(["D:/Downloads"]);
  const remote = fixture([repo]);
  expect(await remote.resolve("D:/Downloads", { local: false })).toMatchObject({
    project: { id: "repo" },
  });
  expect(remote.added).toEqual([]);
});

test("an explicit project id wins", async () => {
  const { resolve } = fixture();
  expect(await resolve("C:/Users/me", { projectId: "repo" })).toMatchObject({
    project: { id: "repo" },
    directory: "C:/work/repo",
  });
});
