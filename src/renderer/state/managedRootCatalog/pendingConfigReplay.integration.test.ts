import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RemoteClientError } from "@/shared/remote/client";
import { performInitialThreadLaunch } from "@/renderer/actions/threadLaunchActions";
import { performThreadInputSubmit } from "@/renderer/actions/threadRuntimeActions";
import { useAppStore } from "../appStore";
import { applyRootCatalogThreadRows } from "./rootCatalogRows";
import { peekPendingManagedRootLaunch } from "./rootCatalogStore";
import {
  activate,
  setupManagedRootFixture,
  teardownManagedRootFixture,
  supervisorTrace,
  threadRow,
} from "./managedRootFixture";

beforeEach(async () => {
  await setupManagedRootFixture();
  useAppStore.setState({ pendingThreadConfigByThreadId: {} });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await teardownManagedRootFixture();
});

it("replays the exact uncertain operation while a newer effort remains for the next command", async () => {
  let threadId = "";
  const requests: Array<{ id: string; body: string }> = [];
  const realFetch = globalThis.fetch;
  let release!: () => void;
  const replyGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const response = await realFetch(url, init);
    if (
      String(url).endsWith(`/api/threads/${threadId}/command`) &&
      typeof init?.body === "string" &&
      JSON.parse(init.body).kind === "start"
    ) {
      requests.push({
        id: new Headers(init.headers).get("x-poracode-command-id")!,
        body: init.body,
      });
      if (requests.length === 1) {
        await replyGate;
        throw new RemoteClientError("Fixture lost dispatched response", 0, "timeout", {
          requestPhase: "dispatched",
        });
      }
    }
    return response;
  });
  await activate();
  const store = useAppStore.getState();
  const row = store.createThread({
    projectId: "p-1",
    agentKind: "structured-example",
    config: { model: "model-a", effort: "xhigh" },
    prompt: "original prompt",
    presentationMode: "gui",
  });
  threadId = row.id;
  const launch = () =>
    performInitialThreadLaunch({
      thread: threadRow(row.id)!,
      projectLocation: { kind: "posix", path: "/tmp/repo" },
      prompt: "original prompt",
      initialSize: { cols: 80, rows: 24 },
    });
  const first = launch();
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  store.updateThreadConfig(row.id, { ...threadRow(row.id)!.config, effort: "high" });
  release();
  await expect(first).rejects.toBeInstanceOf(RemoteClientError);
  expect(peekPendingManagedRootLaunch(row.id)?.replay?.config.effort).toBe("xhigh");
  expect(threadRow(row.id)?.config.effort).toBe("high");
  await launch();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]); // Actual HTTP headers and serialized body, not a rebuilt config.
  expect(supervisorTrace.startThreadCalls).toBe(1); // Host receipt replay, no second launch.
  expect(peekPendingManagedRootLaunch(row.id)).toBeUndefined();
  applyRootCatalogThreadRows([{ ...threadRow(row.id)!, config: row.config }], new Set());
  expect(threadRow(row.id)?.config.effort).toBe("high");
  expect(useAppStore.getState().pendingThreadConfigByThreadId[row.id]?.config.effort).toBe("high");
  const send = vi.fn<() => Promise<void>>(async () => undefined);
  await performThreadInputSubmit({
    thread: threadRow(row.id)!,
    prompt: "next command",
    transport: { sendThreadInput: send },
  });
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ config: expect.objectContaining({ effort: "high" }) }),
  );
  expect(useAppStore.getState().pendingThreadConfigByThreadId[row.id]).toBeUndefined();
}, 20_000);
