import { expect, it, vi } from "vitest";
import type { RemoteThreadCommand } from "@/shared/contracts";
import { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteFetch } from "@/shared/remote/clientTypes";
import { sendClientThreadCommand } from "./clientCatalogCommands";

it("shares removal capacity across environment endpoints on the same HTTP origin", async () => {
  const cleanup = Promise.withResolvers<void>();
  const fetchImpl = vi.fn<RemoteFetch>(async () => {
    await cleanup.promise;
    return Response.json({ ok: true });
  });
  const parent = new RemoteDesktopClient("http://parent.test", "token", fetchImpl);
  const child = new RemoteDesktopClient(
    "http://parent.test/api/environments/child",
    "token",
    fetchImpl,
  );
  const first = sendClientThreadCommand(parent, { kind: "delete", threadId: "first" });
  const second = sendClientThreadCommand(child, { kind: "delete", threadId: "second" });
  try {
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
  } finally {
    cleanup.resolve();
    await Promise.all([first, second]);
  }
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it.each(["delete", "archive", "delete-worktree-group"] as const)(
  "keeps foreground commands available during queued %s requests and continues after failure",
  async (kind) => {
    const cleanup = Promise.withResolvers<void>();
    const requested: string[] = [];
    const failure = "Expected worktree branch saved-branch, but found changed-branch";
    const fetchImpl = vi.fn<RemoteFetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      requested.push(path);
      if (path.includes("/done-0/")) {
        await cleanup.promise;
        return Response.json(
          { error: { code: "worktree_remove_failed", message: failure } },
          { status: 500 },
        );
      }
      return Response.json({ ok: true });
    });
    const client = new RemoteDesktopClient(`http://${kind}.test`, "token", fetchImpl);
    // A second client for the same host shares the browser's connection pool.
    const secondClient = new RemoteDesktopClient(client.endpoint, "token", fetchImpl);
    const commands = Array.from({ length: 8 }, (_, index): RemoteThreadCommand => {
      const threadId = `done-${index}`;
      return kind === "delete-worktree-group"
        ? {
            kind,
            threadId,
            projectId: "project",
            worktreePath: `/wt/${index}`,
            threadIds: [threadId],
          }
        : { kind, threadId };
    });
    const first = sendClientThreadCommand(client, commands[0]!, { commandId: "removal-0" });
    const refused = first.catch((error: unknown) => error);
    const remaining = commands
      .slice(1)
      .map((command) => sendClientThreadCommand(secondClient, command));

    try {
      await vi.waitFor(() => expect(requested).toHaveLength(1));
      await sendClientThreadCommand(client, {
        kind: "rename",
        threadId: "selected",
        title: "Open",
      });
      expect(requested).toEqual(["/api/threads/done-0/command", "/api/threads/selected/command"]);
      const otherHost = new RemoteDesktopClient("http://other.test", "token", fetchImpl);
      await sendClientThreadCommand(otherHost, { kind: "delete", threadId: "other" });
      expect(requested.at(-1)).toBe("/api/threads/other/command");
      expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get("x-poracode-command-id")).toBe(
        "removal-0",
      );
    } finally {
      cleanup.resolve();
      expect(await refused).toMatchObject({ message: failure });
      await Promise.all(remaining);
    }
    expect(requested.slice(3)).toEqual(
      commands.slice(1).map((command) => `/api/threads/${command.threadId}/command`),
    );
  },
);
