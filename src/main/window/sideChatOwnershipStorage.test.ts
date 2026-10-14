import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";
import { createSideChatOwnershipStorage } from "./sideChatOwnershipStorage";
let dir: string;
beforeEach(async () => {
  await mkdir(join(process.cwd(), "tmp"), { recursive: true });
  dir = await mkdtemp(join(process.cwd(), "tmp/side-chat-ledger-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
const bootstrap: SideChatBootstrap = {
  id: "entry",
  source: {
    id: "parent",
    projectId: "project",
    title: "Parent",
    agentKind: "neutral-gui",
    config: { model: "a" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-10-12T00:00:00Z",
    updatedAt: "2026-10-12T00:00:00Z",
  },
  context: null,
  prompt: "draft",
  title: "Side chat",
  existingThreadId: "child",
};
it("starts empty for a pre-upgrade profile and preserves old bootstrap shapes on restart", async () => {
  const path = join(dir, "ownership.json");
  const storage = createSideChatOwnershipStorage(path);
  expect(await storage.load()).toEqual({ version: 1, entries: [], disposing: [] });
  await storage.save({ version: 1, entries: [{ bootstrap }], disposing: [] });
  expect(await createSideChatOwnershipStorage(path).load()).toEqual({
    version: 1,
    entries: [{ bootstrap }],
    disposing: [],
  });
});
it("keeps disposal records through restart until an acknowledged replacement write", async () => {
  const path = join(dir, "ownership.json");
  const thread = { ...bootstrap.source, id: "child", parentThreadId: "parent" };
  const storage = createSideChatOwnershipStorage(path);
  const first = storage.save({ version: 1, entries: [], disposing: [thread] });
  const second = storage.save({ version: 1, entries: [{ bootstrap }], disposing: [thread] });
  await Promise.all([first, second]);
  expect((await createSideChatOwnershipStorage(path).load()).disposing).toEqual([thread]);
  await storage.save({ version: 1, entries: [], disposing: [] });
  expect((await storage.load()).disposing).toEqual([]);
});
it("refuses an unknown version without overwriting it", async () => {
  const path = join(dir, "ownership.json");
  const old = JSON.stringify({ version: 0, entries: [] });
  await writeFile(path, old);
  await expect(createSideChatOwnershipStorage(path).load()).rejects.toThrow(/Invalid input/);
  expect(await readFile(path, "utf8")).toBe(old);
});
it("reports write failure so a launch cannot treat a missing checkpoint as durable", async () => {
  const path = join(dir, "file");
  await writeFile(path, "not a directory");
  await expect(
    createSideChatOwnershipStorage(join(path, "ownership.json")).save({
      version: 1,
      entries: [],
      disposing: [],
    }),
  ).rejects.toThrow(/EEXIST|ENOTDIR/);
});
