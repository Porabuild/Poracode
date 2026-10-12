import { describe, expect, it } from "vitest";
import { threadSchema } from "@/shared/contracts";
import { sidebarThreadChoices } from "./sidebarChoices";

const chat = threadSchema.parse({
  id: "gui",
  projectId: "project",
  title: "GUI chat",
  agentKind: "acp-generic:fixture",
  config: { model: "fixture" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: true,
  presentationMode: "gui",
  remoteServerId: "local-app",
  createdAt: "2026-10-07T00:00:00Z",
  updatedAt: "2026-10-07T00:00:00Z",
});

describe("sidebar GUI chat selection", () => {
  it("excludes terminal, legacy presentation, and archived rows without changing the host catalog", () => {
    const { presentationMode: _presentation, ...legacy } = chat;
    const threads = [
      { ...legacy, id: "legacy" },
      chat,
      { ...chat, id: "terminal", presentationMode: "terminal" as const },
      { ...chat, id: "archived", archived: true },
      { ...chat, id: "archived-time", archivedAt: chat.updatedAt },
    ];
    const before = structuredClone(threads);
    expect(sidebarThreadChoices(threads, "local-app").map((row) => row.id)).toEqual(["gui"]);
    expect(threads).toEqual(before);
  });

  it("removes a chat if its server changes it to terminal presentation", () => {
    const previous = [chat];
    expect(sidebarThreadChoices(previous, "local-app")).toHaveLength(1);
    expect(sidebarThreadChoices([{ ...chat, presentationMode: "terminal" }], "local-app")).toEqual(
      [],
    );
    expect(sidebarThreadChoices(previous, "local-app")).toHaveLength(1);
  });

  it("orders chats by recent activity and carries the timestamp without reordering host rows", () => {
    const threads = [chat, { ...chat, id: "recent", updatedAt: "2026-10-07T01:00:00Z" }];
    const choices = sidebarThreadChoices(threads, "local-app");
    expect(choices.map((row) => row.id)).toEqual(["recent", "gui"]);
    expect(choices[0]?.updatedAt).toBe(threads[1]?.updatedAt);
    expect(threads.map((row) => row.id)).toEqual(["gui", "recent"]);
  });

  it("returns only the requested server's chats, each server in its own recency order", () => {
    const threads = [
      chat,
      { ...chat, id: "other-old", remoteServerId: "other", updatedAt: "2026-10-06T00:00:00Z" },
      { ...chat, id: "other-new", remoteServerId: "other", updatedAt: "2026-10-08T00:00:00Z" },
      { ...chat, id: "local-new", updatedAt: "2026-10-07T02:00:00Z" },
    ];
    expect(sidebarThreadChoices(threads, "local-app").map((row) => row.id)).toEqual([
      "local-new",
      "gui",
    ]);
    expect(sidebarThreadChoices(threads, "other").map((row) => row.id)).toEqual([
      "other-new",
      "other-old",
    ]);
  });

  it("keys host-local chats under an undefined server and returns a stable empty list for unknown servers", () => {
    const { remoteServerId: _server, ...local } = chat;
    const threads = [chat, { ...local, id: "host-local" }];
    expect(sidebarThreadChoices(threads, undefined).map((row) => row.id)).toEqual(["host-local"]);
    const missing = sidebarThreadChoices(threads, "missing");
    expect(missing).toEqual([]);
    expect(sidebarThreadChoices([], "missing")).toBe(missing);
  });

  it("returns the same array while the thread list is unchanged and a new one when it is replaced", () => {
    const threads = [chat];
    const first = sidebarThreadChoices(threads, "local-app");
    expect(sidebarThreadChoices(threads, "local-app")).toBe(first);
    expect(sidebarThreadChoices([...threads], "local-app")).not.toBe(first);
    expect(sidebarThreadChoices([...threads], "local-app")).toEqual(first);
  });
});
