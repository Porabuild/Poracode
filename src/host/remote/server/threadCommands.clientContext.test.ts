import { describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { remoteThreadCommandSchema } from "@/shared/contracts";
import { dbGetProjects, dbGetThreads, dbUpsertThread } from "@/host/db";
import type { RemoteServerContext } from "./context";
import { applyRemoteThreadCommand } from "./threadCommands";

vi.mock("@/host/db", () => ({
  dbGetProjects: vi.fn<() => Project[]>(() => []),
  dbGetThreads: vi.fn<() => Thread[]>(() => []),
  dbUpsertThread: vi.fn<(thread: Thread) => void>(),
}));

const project: Project = {
  id: "home",
  name: "Home",
  location: { kind: "posix", path: "/home/user" },
  scripts: { actions: [] },
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("remote start command client context", () => {
  it.each([
    { browserFocus: { activeTab: { tabId: 12, title: "Release notes", url: "https://r.test/" } } },
    { conversationSnapshot: { text: "private parent marker" } },
  ])(
    "forwards the launch's context to the supervisor only, never to the durable row",
    async (clientContext) => {
      vi.mocked(dbGetProjects).mockReturnValue([project]);
      vi.mocked(dbGetThreads).mockReturnValue([]);
      const callSupervisor = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(
        async () => ({ threadId: "t-1" }),
      );
      const ctx = { options: { callSupervisor } } as unknown as RemoteServerContext;
      const command = remoteThreadCommandSchema.parse({
        kind: "start",
        threadId: "t-1",
        projectId: project.id,
        agentKind: "fixture-agent",
        config: { model: "m" },
        prompt: "summarize",
        presentationMode: "gui",
        clientContext,
      });

      await applyRemoteThreadCommand(ctx, command);

      expect(callSupervisor).toHaveBeenCalledWith(
        "startThread",
        expect.objectContaining({ threadId: "t-1", prompt: "summarize", clientContext }),
      );
      const row = vi.mocked(dbUpsertThread).mock.calls[0]?.[0];
      expect(row?.title).toBe("summarize");
      expect(JSON.stringify(row)).not.toContain("r.test");
      expect(JSON.stringify(row)).not.toContain("private parent marker");
    },
  );

  it("omits context from a start that carried none", async () => {
    vi.mocked(dbGetProjects).mockReturnValue([project]);
    const callSupervisor = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(
      async () => ({ threadId: "t-2" }),
    );
    const ctx = { options: { callSupervisor } } as unknown as RemoteServerContext;
    await applyRemoteThreadCommand(ctx, {
      kind: "start",
      threadId: "t-2",
      projectId: project.id,
      agentKind: "fixture-agent",
      config: { model: "m" },
      prompt: "plain",
      presentationMode: "gui",
    });
    expect(callSupervisor.mock.calls[0]?.[1]).not.toHaveProperty("clientContext");
  });
});
