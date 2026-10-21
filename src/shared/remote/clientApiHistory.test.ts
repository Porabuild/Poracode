import { describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "./client";
import type { RemoteFetch } from "./clientTypes";

const thread = {
  id: "thread",
  projectId: "project",
  title: "History",
  agentKind: "fixture",
  config: { model: "default" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const response = () => ({
  kind: "events",
  thread,
  snapshotSeq: 10,
  runtimeResumeCursor: "cursor",
  completedTurns: [],
  contextUsage: null,
  batches: [
    {
      seq: 9,
      events: [
        {
          type: "content.delta",
          threadId: "thread",
          itemId: "reply",
          stream: "assistant_text",
          delta: "text",
        },
      ],
    },
  ],
});

describe("bounded historical reads", () => {
  it("authenticates detail and replay routes, encodes identities and declares negotiated caps", async () => {
    const fetchImpl = vi.fn<RemoteFetch>(async (url) =>
      Response.json(
        String(url).includes("/changes")
          ? response()
          : {
              item: {
                id: "command/id",
                type: "command_execution",
                state: "completed",
                streams: { command_output: "Stored" },
              },
            },
      ),
    );
    const client = new RemoteDesktopClient("https://host.test", "private-token", fetchImpl);
    expect(
      (await client.threadHistoryItem("thread space", "command/id")).streams.command_output,
    ).toBe("Stored");
    await client.resumeThreadHistory("thread", "hr1.cursor", { afterSeq: 7 });
    for (const [url, init] of fetchImpl.mock.calls) {
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get("notices")).toBe("v1");
      expect(Number(parsed.searchParams.get("maxBytes"))).toBeGreaterThan(0);
      expect(Number(parsed.searchParams.get("maxDecodeBytes"))).toBeGreaterThan(0);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer private-token");
      expect(parsed.href).not.toContain("private-token");
    }
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "thread%20space/history/items/command%2Fid",
    );
    expect(new URL(String(fetchImpl.mock.calls[1]?.[0])).searchParams.get("afterSeq")).toBe("7");
  });

  it("reads the prompt index from an authenticated, encoded route and validates it", async () => {
    const fetchImpl = vi.fn<RemoteFetch>(async () =>
      Response.json({
        prompts: [{ itemId: "prompt/1", position: 4, text: "Hello" }],
        truncated: true,
      }),
    );
    const client = new RemoteDesktopClient("https://host.test", "private-token", fetchImpl);

    await expect(client.threadPromptIndex("thread space")).resolves.toEqual({
      prompts: [{ itemId: "prompt/1", position: 4, text: "Hello" }],
      truncated: true,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("/api/threads/thread%20space/history/prompts");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer private-token");

    const malformed = new RemoteDesktopClient("https://host.test", "token", async () =>
      Response.json({ prompts: [{ itemId: "", position: -1, text: 1 }] }),
    );
    await expect(malformed.threadPromptIndex("thread")).rejects.toThrow(/history prompt index/);
  });

  it("rejects a buffered detail response after cancellation", async () => {
    const held = Promise.withResolvers<void>();
    const fetchImpl = vi.fn<RemoteFetch>(async () => {
      await held.promise;
      return Response.json({
        item: { id: "command", type: "command_execution", state: "completed", streams: {} },
      });
    });
    const client = new RemoteDesktopClient("https://host.test", "token", fetchImpl);
    const controller = new AbortController();
    const read = client.threadHistoryItem("thread", "command", { signal: controller.signal });
    controller.abort();
    held.resolve();
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it.each(["thread", "event-owner", "future-sequence", "reversed-sequence"])(
    "rejects invalid replay %s",
    async (cause) => {
      const body = response();
      if (cause === "thread") body.thread = { ...thread, id: "foreign" };
      if (cause === "event-owner") body.batches[0]!.events[0]!.threadId = "foreign";
      if (cause === "future-sequence") body.batches[0]!.seq = 11;
      if (cause === "reversed-sequence") body.batches.push({ ...body.batches[0]!, seq: 8 });
      const client = new RemoteDesktopClient("https://host.test", "token", async () =>
        Response.json(body),
      );
      await expect(client.resumeThreadHistory("thread", "cursor")).rejects.toThrow(
        /identity|sequence/,
      );
    },
  );

  it("preserves a typed detail refusal without retrying or loading full history", async () => {
    const fetchImpl = vi.fn<RemoteFetch>(async () =>
      Response.json(
        { error: { code: "read_item_too_large", message: "Too large." } },
        { status: 422 },
      ),
    );
    const client = new RemoteDesktopClient("https://host.test", "token", fetchImpl);
    await expect(client.threadHistoryItem("thread", "command")).rejects.toMatchObject({
      status: 422,
      code: "read_item_too_large",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
