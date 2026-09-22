import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { RemoteDesktopClient, type RemoteFetch } from "@/shared/remote/client";

/**
 * End-to-end outcome classification for a real mutation transport: the renderer
 * action runs against the actual `RemoteDesktopClient`/`RemoteClientTransport`,
 * so the error the action classifies is produced by the real request pipeline
 * (phase evidence, wrapping, status rules) — never constructed by hand.
 */

const mocks = vi.hoisted(() => ({
  appState: {
    threads: [] as Array<{ id: string }>,
    applyRuntimeEvent: vi.fn<(threadId: string, event: unknown) => void>(),
    updateThreadRuntime: vi.fn<(threadId: string, input: unknown) => void>(),
    touchThread: vi.fn<(threadId: string) => void>(),
    reconcileRuntimeSnapshots:
      vi.fn<(snapshots: unknown[], requested?: ReadonlySet<string>) => void>(),
  },
  bridge: {
    getThreadSnapshots: vi.fn<() => Promise<unknown[]>>(),
  },
  toastWarning: vi.fn<(message: unknown) => void>(),
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: { getState: () => mocks.appState },
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => mocks.bridge,
}));
vi.mock("@/renderer/i18n/i18n", () => ({
  i18n: { _: (value: unknown) => String(value) },
}));
vi.mock("@heroui/react", () => ({
  toast: { warning: mocks.toastWarning, danger: vi.fn<(message: unknown) => void>() },
}));
vi.mock("@/renderer/analytics/posthog", () => ({
  captureThreadPromptSubmitted: vi.fn<(...args: unknown[]) => void>(),
  threadProductProperties: () => ({}),
}));
vi.mock("@/renderer/analytics/productAnalytics", () => ({
  captureProductEvent: vi.fn<(...args: unknown[]) => void>(),
}));
vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  captureFileCheckpoint: vi.fn<(input: unknown) => Promise<void>>(),
}));
vi.mock("./threadLaunchActions", () => ({
  performInitialThreadLaunch: vi.fn<(input: unknown) => Promise<void>>(),
}));

import { performThreadInputSubmit } from "./threadRuntimeActions";

const endpoint = "http://127.0.0.1:38987/";

function createThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "codex/model" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Thread;
}

/** The rollback write restores the pre-submit status; the optimistic one sets "working". */
function rollbackCalls(): unknown[] {
  return mocks.appState.updateThreadRuntime.mock.calls.filter(
    ([, input]) => (input as { status?: string }).status !== "working",
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(
  fetchImpl: RemoteFetch,
  options?: { requestTimeoutMs?: number },
): RemoteDesktopClient {
  return new RemoteDesktopClient(endpoint, "token", fetchImpl, options ?? {});
}

function submitWith(client: RemoteDesktopClient, thread = createThread()): Promise<void> {
  return performThreadInputSubmit({
    thread,
    prompt: "hello",
    transport: { sendThreadInput: (payload) => client.sendThreadInput(payload) },
  });
}

describe("performThreadInputSubmit over the real remote transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appState.threads = [{ id: "thread-1" }];
    mocks.bridge.getThreadSnapshots.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the optimistic turn and reads back once when the response is lost after the effect", async () => {
    vi.useFakeTimers();
    let effectDispatches = 0;
    const client = clientWith(
      async (_url, init) => {
        expect(init?.method).toBe("POST");
        effectDispatches += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("The operation was aborted.", "AbortError")),
            { once: true },
          );
        });
      },
      { requestTimeoutMs: 10 },
    );

    const pending = submitWith(client).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    const error = await pending;

    expect(effectDispatches).toBe(1);
    expect(error).toMatchObject({ status: 0, code: "timeout", requestMayHaveCommitted: true });
    // The one authoritative read ran; nothing was resent and no definite
    // failure was painted.
    expect(mocks.bridge.getThreadSnapshots).toHaveBeenCalledTimes(1);
    expect(effectDispatches).toBe(1);
    expect(mocks.toastWarning).toHaveBeenCalledTimes(1);
    expect(rollbackCalls()).toEqual([]);
  });

  it("treats a raw transport drop after dispatch as uncertain, not as a rollback", async () => {
    let effectDispatches = 0;
    const client = clientWith(async () => {
      effectDispatches += 1;
      throw new TypeError("Failed to fetch");
    });

    const error = await submitWith(client).catch((value: unknown) => value);

    expect(effectDispatches).toBe(1);
    expect(error).toMatchObject({ status: 0, code: "network", requestMayHaveCommitted: true });
    expect(mocks.bridge.getThreadSnapshots).toHaveBeenCalledTimes(1);
    expect(mocks.toastWarning).toHaveBeenCalledTimes(1);
    expect(rollbackCalls()).toEqual([]);
  });

  it("treats an HTTP 5xx after dispatch as uncertain for the mutation", async () => {
    const client = clientWith(async () =>
      jsonResponse(500, { error: { code: "internal_error", message: "boom" } }),
    );

    const error = await submitWith(client).catch((value: unknown) => value);

    expect(error).toMatchObject({ status: 500, code: "internal_error" });
    expect(mocks.bridge.getThreadSnapshots).toHaveBeenCalledTimes(1);
    expect(rollbackCalls()).toEqual([]);
  });

  it("keeps the host's explicit uncertain 409 ambiguous through the real pipeline", async () => {
    const client = clientWith(async () =>
      jsonResponse(409, {
        error: { code: "command_outcome_uncertain", message: "outcome uncertain" },
      }),
    );

    const error = await submitWith(client).catch((value: unknown) => value);

    expect(error).toMatchObject({ status: 409, code: "command_outcome_uncertain" });
    expect(mocks.bridge.getThreadSnapshots).toHaveBeenCalledTimes(1);
    expect(rollbackCalls()).toEqual([]);
  });

  it("keeps an ordinary 409 rejection on the definite rollback path", async () => {
    const client = clientWith(async () =>
      jsonResponse(409, { error: { code: "command_id_conflict", message: "conflict" } }),
    );

    const error = await submitWith(client).catch((value: unknown) => value);

    expect(error).toMatchObject({ status: 409, code: "command_id_conflict" });
    expect(mocks.bridge.getThreadSnapshots).not.toHaveBeenCalled();
    expect(mocks.toastWarning).not.toHaveBeenCalled();
    expect(rollbackCalls()).toHaveLength(1);
  });

  it("keeps a failed 401 authorization definite and never reads back", async () => {
    const client = clientWith(async () =>
      jsonResponse(401, { error: { code: "unauthorized", message: "expired" } }),
    );

    const error = await submitWith(client).catch((value: unknown) => value);

    expect(error).toMatchObject({ status: 401, code: "unauthorized" });
    expect(mocks.bridge.getThreadSnapshots).not.toHaveBeenCalled();
    expect(rollbackCalls()).toHaveLength(1);
  });

  it("retries once after a 401 refresh and succeeds without uncertainty handling", async () => {
    let requests = 0;
    const client = new RemoteDesktopClient(endpoint, "stale", async (_url, init) => {
      requests += 1;
      const authorization = (init?.headers as Record<string, string> | undefined)?.authorization;
      if (authorization === "Bearer stale") {
        return jsonResponse(401, { error: { code: "unauthorized", message: "expired" } });
      }
      return jsonResponse(200, {});
    });
    client.setTokenLifecycle({
      refreshToken: () => "refresh-1",
      onTokensRefreshed: vi.fn<(tokens: unknown) => void>(),
    });
    const refresh = vi.spyOn(client, "refreshTokens").mockImplementation(async () => {
      (client as unknown as { accessToken: string }).accessToken = "fresh";
      return { accessToken: "fresh" };
    });

    await expect(submitWith(client)).resolves.toBeUndefined();

    expect(requests).toBe(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mocks.bridge.getThreadSnapshots).not.toHaveBeenCalled();
    expect(mocks.toastWarning).not.toHaveBeenCalled();
    expect(rollbackCalls()).toEqual([]);
  });

  it("refuses a pinned-certificate mismatch before dispatch and rolls back definitely", async () => {
    let requests = 0;
    const client = new RemoteDesktopClient(
      endpoint,
      "token",
      async () => {
        requests += 1;
        return jsonResponse(200, {});
      },
      { certFingerprint: "aa", certFingerprintProbe: async () => "bb" },
    );

    const error = await submitWith(client).catch((value: unknown) => value);

    expect(requests).toBe(0);
    expect(error).toMatchObject({
      status: 502,
      code: "certificate_fingerprint_mismatch",
      requestPhase: "presend",
    });
    expect(mocks.bridge.getThreadSnapshots).not.toHaveBeenCalled();
    expect(mocks.toastWarning).not.toHaveBeenCalled();
    expect(rollbackCalls()).toHaveLength(1);
  });
});
