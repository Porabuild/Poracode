import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteClientError, RemoteDesktopClient } from "@/shared/remote/client";
import type { StartRemoteNewThreadInput } from "@/shared/remote/client";
import { useAppStore } from "@/renderer/state/appStore";
import { performInitialThreadLaunch } from "@/renderer/actions/threadLaunchActions";
import { deleteThread } from "@/renderer/actions/threadActions";
import { isRemoteCommandOutcomeUncertainError } from "@/renderer/actions/threadCommandOutcomeActions";
import { runHostOriginatedManagedRootMutation } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import {
  dropPendingManagedRootLaunch,
  notePendingManagedRootLaunch,
  peekPendingManagedRootLaunch,
  pinnedManagedRootThreadIds,
  retainPendingManagedRootLaunch,
  retainedUncertainManagedRootThreadIds,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";
import { removeRootCatalogThreads } from "@/renderer/state/managedRootCatalog/rootCatalogRows";
import { refreshManagedRootCatalogSoon } from "@/renderer/state/managedRootCatalog/rootCatalogAdapter";
import {
  activate,
  hostThreadRow,
  rootThreads,
  setupManagedRootFixture,
  teardownManagedRootFixture,
  threadRow,
} from "@/renderer/state/managedRootCatalog/managedRootFixture";

/**
 * R2 uncertain launch identity (absent-host-row case): a managed-root
 * create+launch whose outcome is UNCERTAIN retains the SAME command id and
 * the exact original body for an explicit retry, because absence of the
 * durable row never proves the provider never started. The confirmation-gated
 * catalog deletion pass must therefore never remove the optimistic row nor
 * evict the retained operation — including after the user navigates away and
 * no pin, pane, provisioning mark, or queued launch protects it. Release
 * happens only through the operation's own lifecycle: authoritative
 * resolution (the replayed start completing) or removal of the row
 * (`removeRootCatalogThreads`, the same removal the explicit delete flow
 * converges through). Fresh, non-uncertain markers stay unprotected so the
 * gate keeps garbage-collecting abandoned rows.
 *
 * Like `rootCorrections.integration.test.ts`, this runs the production launch
 * path over the real `RemoteAccessServer` fixture, with the `start` command
 * rejected at the client transport seam as a dispatched timeout — the shape
 * the shared mutation rule classifies as may-have-committed — so no dispatch
 * reaches the host and the host row stays absent.
 */

const UNCERTAIN_PROMPT = "uncertain absent row";

beforeEach(async () => {
  await setupManagedRootFixture();
});

afterEach(async () => {
  await teardownManagedRootFixture();
});

interface StartInjection {
  readonly commandIds: string[];
  restore(): void;
}

/** Reject every `start` command with a dispatched-timeout uncertain error. */
function injectUncertainStart(): StartInjection {
  const commandIds: string[] = [];
  const prototype = RemoteDesktopClient.prototype as unknown as {
    sendThreadCommand: (
      command: unknown,
      options?: { readonly commandId?: string },
    ) => Promise<unknown>;
  };
  const originalSend = prototype.sendThreadCommand;
  prototype.sendThreadCommand = function (
    this: RemoteDesktopClient,
    command: unknown,
    options?: { readonly commandId?: string },
  ) {
    if ((command as { kind?: string }).kind === "start") {
      commandIds.push(options?.commandId ?? "<none>");
      // The transport's dispatched-timeout shape: the request may have
      // reached the host, the response never came back.
      return Promise.reject(
        new RemoteClientError("retention: dispatched timeout, response lost", 0, "timeout", {
          requestPhase: "dispatched",
        }),
      );
    }
    return originalSend.call(this, command, options);
  };
  return {
    commandIds,
    restore: () => {
      prototype.sendThreadCommand = originalSend;
    },
  };
}

/** Reject delete after dispatch so the host outcome remains ambiguous. */
function injectUncertainDelete(): { restore(): void } {
  const prototype = RemoteDesktopClient.prototype as unknown as {
    sendThreadCommand: (command: unknown) => Promise<unknown>;
  };
  const originalSend = prototype.sendThreadCommand;
  prototype.sendThreadCommand = function (this: RemoteDesktopClient, command: unknown) {
    if ((command as { kind?: string }).kind === "delete") {
      return Promise.reject(
        new RemoteClientError("retention: delete response lost", 0, "timeout", {
          requestPhase: "dispatched",
        }),
      );
    }
    return originalSend.call(this, command);
  };
  return {
    restore: () => {
      prototype.sendThreadCommand = originalSend;
    },
  };
}

function createLaunchRow() {
  return useAppStore.getState().createThread({
    projectId: "p-1",
    agentKind: "claude",
    config: { model: "sonnet" },
    prompt: UNCERTAIN_PROMPT,
  });
}

async function attemptLaunch(threadId: string): Promise<unknown> {
  return performInitialThreadLaunch({
    thread: useAppStore.getState().threads.find((thread) => thread.id === threadId)!,
    projectLocation: { kind: "posix", path: "/tmp/repo" },
    prompt: UNCERTAIN_PROMPT,
    initialSize: { cols: 80, rows: 24 },
  }).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({
      ok: false as const,
      uncertain: isRemoteCommandOutcomeUncertainError(error),
    }),
  );
}

/** Drive one confirmation-gated deletion pass and let it finish. */
async function runDeletionPass(): Promise<void> {
  refreshManagedRootCatalogSoon();
  await new Promise((resolve) => setTimeout(resolve, 2_500));
}

/** A synthetic replay body; the accessor only ever reads its presence. */
function replayBody(threadId: string): StartRemoteNewThreadInput {
  return {
    threadId,
    projectId: "p-1",
    agentKind: "claude",
    config: { model: "sonnet" },
    prompt: UNCERTAIN_PROMPT,
  } as StartRemoteNewThreadInput;
}

describe("retained uncertain root launch identity", () => {
  it("mirrors only entries whose uncertain episode is still retained", () => {
    // A fresh marker (armed by createThread, or a definite-failure re-arm)
    // carries no replay body: it is not an uncertain episode.
    notePendingManagedRootLaunch("t-fresh", false);
    expect(retainedUncertainManagedRootThreadIds().has("t-fresh")).toBe(false);

    retainPendingManagedRootLaunch("t-fresh", {
      isNewWorktree: false,
      commandId: "command-1",
      replay: replayBody("t-fresh"),
    });
    expect(retainedUncertainManagedRootThreadIds()).toContain("t-fresh");

    // Either lifecycle end (authoritative drop or row removal) releases it.
    dropPendingManagedRootLaunch("t-fresh");
    expect(retainedUncertainManagedRootThreadIds()).not.toContain("t-fresh");
  });

  it("keeps the same command id and body after navigation and catalog passes when the host row is absent", async () => {
    await activate();
    const row = createLaunchRow();
    const injection = injectUncertainStart();
    try {
      // Production keeps the launched thread in an open pane; the user then
      // navigates away, which is what retires every other protection source.
      useAppStore.setState({ view: { kind: "thread", panes: [row.id] } });
      const first = await attemptLaunch(row.id);
      expect(first).toMatchObject({ ok: false, uncertain: true });

      // Epistemic worst case: the host never persisted the row, and the
      // reconcile read answered "absent" — evidence only, never a verdict.
      expect(hostThreadRow(row.id)).toBeUndefined();

      const retained = peekPendingManagedRootLaunch(row.id);
      expect(retained?.commandId).toBe(injection.commandIds[0]);
      expect(retained?.replay?.threadId).toBe(row.id);
      expect(retained?.replay?.prompt).toBe(UNCERTAIN_PROMPT);
      // No call-scoped pin, pane, provisioning mark, or queued launch
      // outlives the launch action — the retained operation itself must.
      expect(pinnedManagedRootThreadIds().has(row.id)).toBe(false);
      expect(useAppStore.getState().provisioningWorktreeThreadIds[row.id]).toBeUndefined();
      expect(useAppStore.getState().pendingThreadLaunches[row.id]).toBeUndefined();

      useAppStore.setState({ view: { kind: "home" } });
      // Two full deletion passes: the gate must decline both times.
      await runDeletionPass();
      await runDeletionPass();

      expect(threadRow(row.id)).toBeDefined();
      const survived = peekPendingManagedRootLaunch(row.id);
      expect(survived?.commandId).toBe(injection.commandIds[0]);
      expect(survived?.replay).toEqual(retained?.replay);
      expect(hostThreadRow(row.id)).toBeUndefined();
    } finally {
      injection.restore();
    }
  }, 45_000);

  it("explicit row removal still releases the retained operation", async () => {
    await activate();
    const row = createLaunchRow();
    const injection = injectUncertainStart();
    try {
      useAppStore.setState({ view: { kind: "home" } });
      const first = await attemptLaunch(row.id);
      expect(first).toMatchObject({ ok: false, uncertain: true });
      await runDeletionPass();
      expect(peekPendingManagedRootLaunch(row.id)?.commandId).toBe(injection.commandIds[0]);

      // The removal path (the gate's removeThreadRows callback, and the same
      // removal the explicit delete flow converges through) is not blocked by
      // the protection: removing the row retires the retained operation.
      removeRootCatalogThreads([row.id]);
      expect(threadRow(row.id)).toBeUndefined();
      expect(peekPendingManagedRootLaunch(row.id)).toBeUndefined();
      expect(retainedUncertainManagedRootThreadIds()).not.toContain(row.id);
    } finally {
      injection.restore();
    }
  }, 45_000);

  it("successful explicit deletion releases the retained operation", async () => {
    await activate();
    const row = createLaunchRow();
    const injection = injectUncertainStart();
    try {
      expect(await attemptLaunch(row.id)).toMatchObject({ ok: false, uncertain: true });
      expect(peekPendingManagedRootLaunch(row.id)?.replay).toBeDefined();
      injection.restore();

      deleteThread(row.id);
      await vi.waitFor(() => expect(threadRow(row.id)).toBeUndefined());
      expect(peekPendingManagedRootLaunch(row.id)).toBeUndefined();
    } finally {
      injection.restore();
    }
  }, 45_000);

  it("uncertain explicit deletion retains the row and launch operation", async () => {
    await activate();
    const row = createLaunchRow();
    const startInjection = injectUncertainStart();
    let deleteInjection: { restore(): void } | undefined;
    try {
      expect(await attemptLaunch(row.id)).toMatchObject({ ok: false, uncertain: true });
      const retained = peekPendingManagedRootLaunch(row.id);
      startInjection.restore();
      deleteInjection = injectUncertainDelete();

      deleteThread(row.id);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(threadRow(row.id)).toBeDefined();
      expect(peekPendingManagedRootLaunch(row.id)).toEqual(retained);
    } finally {
      deleteInjection?.restore();
      startInjection.restore();
    }
  }, 45_000);

  it("host-originated deletion releases the retained operation without echoing", async () => {
    await activate();
    const row = createLaunchRow();
    const injection = injectUncertainStart();
    try {
      expect(await attemptLaunch(row.id)).toMatchObject({ ok: false, uncertain: true });
      expect(peekPendingManagedRootLaunch(row.id)?.replay).toBeDefined();
      const dispatchesBeforeDelete = injection.commandIds.length;

      runHostOriginatedManagedRootMutation(() => deleteThread(row.id));

      expect(threadRow(row.id)).toBeUndefined();
      expect(peekPendingManagedRootLaunch(row.id)).toBeUndefined();
      expect(injection.commandIds).toHaveLength(dispatchesBeforeDelete);
    } finally {
      injection.restore();
    }
  }, 45_000);

  it("the retained operation replays verbatim and authoritative completion releases it", async () => {
    await activate();
    const row = createLaunchRow();
    const injection = injectUncertainStart();
    try {
      useAppStore.setState({ view: { kind: "home" } });
      const first = await attemptLaunch(row.id);
      expect(first).toMatchObject({ ok: false, uncertain: true });
      const retained = peekPendingManagedRootLaunch(row.id);
      expect(retained?.replay?.threadId).toBe(row.id);

      // The explicit retry: the host is reachable again, so the SAME command
      // id replays the SAME body and completes. The host row is born, and the
      // operation's episode ends — retention is released.
      injection.restore();
      const retry = await attemptLaunch(row.id);
      expect(retry).toMatchObject({ ok: true });
      expect(injection.commandIds).toHaveLength(1);
      expect(hostThreadRow(row.id)).toBeDefined();
      expect(peekPendingManagedRootLaunch(row.id)).toBeUndefined();
      expect(retainedUncertainManagedRootThreadIds()).not.toContain(row.id);
    } finally {
      injection.restore();
    }
  }, 45_000);

  it("fresh, non-uncertain optimistic rows stay garbage-collectable", async () => {
    await activate();
    const row = createLaunchRow();
    // The create-intent marker is fresh (no replay body): nothing was sent,
    // so the row is ordinary abandoned optimistic state, never protected.
    expect(peekPendingManagedRootLaunch(row.id)?.replay).toBeUndefined();
    expect(retainedUncertainManagedRootThreadIds()).not.toContain(row.id);

    useAppStore.setState({ view: { kind: "home" } });
    refreshManagedRootCatalogSoon();
    await vi.waitFor(
      () => {
        expect(rootThreads().some((thread) => thread.id === row.id)).toBe(false);
      },
      { timeout: 15_000 },
    );
    expect(peekPendingManagedRootLaunch(row.id)).toBeUndefined();
    expect(hostThreadRow(row.id)).toBeUndefined();
  }, 45_000);
});
