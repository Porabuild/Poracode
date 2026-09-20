import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "../../src/shared/contracts";
import { closeDatabase, initDatabase } from "../../src/main/db/connection";
import { dbGetProjects, dbUpsertThread } from "../../src/main/db/projectsThreads";
import { ProcessCleanup } from "./harness/processCleanup";
import { startRealHost, type RealHostHandle } from "./harness/realHost";
import { findRepoRoot } from "./harness/paths";
import { ProfileClient } from "./helpers/concurrencyProfileClient";
import {
  acquireDeviceCredential,
  allocateLoopbackPort,
  closeProfileClients,
} from "./helpers/profileClientFactory";
import { expectOk } from "./helpers/sharedHostWorkload";
import { writeExperimentArtifact } from "./helpers/experimentArtifacts";

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
const THREAD_ID = "4f1c0a92-6b5d-4e3a-9c8f-2d7e5a1b0c33";
const MODEL = "claude-haiku-4-5";
const SECRET = "BLUE-7741";

function databaseOpens(nativeBinding?: string): boolean {
  if (nativeBinding && !existsSync(nativeBinding)) return false;
  try {
    const database = nativeBinding
      ? new Database(":memory:", { nativeBinding })
      : new Database(":memory:");
    database.close();
    return true;
  } catch {
    return false;
  }
}

function prepareTestProcessBinding(): void {
  if (databaseOpens()) return;
  if (!databaseOpens(serverNativeBinding)) {
    throw new Error(
      "No Node-compatible better-sqlite3 binding available to open the host database.",
    );
  }
  process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = serverNativeBinding;
}

/**
 * The WS9 sign-off blocker: provider-backed anchor reverts with REAL model
 * turns. The automated WS2 coverage uses fixture data (no provider session,
 * no file checkpoint), which honestly cannot prove the provider-side rollback.
 * This journey runs three real Claude turns (low-cost model):
 *
 *  1. Turn 1 teaches the session an access code (BLUE-7741) and a file
 *     checkpoint is taken bound to that turn's user message.
 *  2. Turn 2 asks for the code — the live session answers with it, proving
 *     the provider conversation actually contains turn 2's context.
 *  3. The compound checkpoint-revert runs against turn 1's anchor and must
 *     complete every phase (provider anchor restore, file restore, truncate).
 *  4. Turn 3 asks for the code again — the rolled-back session must NOT know
 *     it. That answer is the provider-rollback proof.
 *
 * Opt-in via PORACODE_E2E_PROVIDER_REVERT=1 plus a live authenticated
 * `claude` CLI, so routine suite runs and CI stay free of provider cost.
 */

const envOptIn = process.env.PORACODE_E2E_PROVIDER_REVERT === "1";

function providerProbe(): boolean {
  if (!envOptIn) return false;
  const probe = spawnSync("claude", ["-p", "reply with OK only", "--model", MODEL], {
    timeout: 60_000,
    encoding: "utf8",
  });
  return probe.status === 0 && (probe.stdout ?? "").includes("OK");
}

const providerAvailable = providerProbe();

function seedGuiThread(dbPath: string): void {
  initDatabase(dbPath);
  try {
    const projectId = dbGetProjects()[0]!.id;
    const now = new Date().toISOString();
    const thread: Thread = {
      id: THREAD_ID,
      projectId,
      title: "Provider-backed revert proof",
      agentKind: "claude",
      config: { model: MODEL },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: now,
      updatedAt: now,
    };
    dbUpsertThread(thread, 0);
  } finally {
    closeDatabase();
  }
}

interface TurnOutcome {
  readonly userItemId: string;
  readonly assistantText: string;
  readonly waitedMs: number;
}

describe.skipIf(!providerAvailable)("provider-backed checkpoint revert (real host)", () => {
  const repoRoot = findRepoRoot();
  let cleanup: ProcessCleanup | undefined;
  let host: RealHostHandle | undefined;
  const clients: ProfileClient[] = [];

  beforeEach(() => {
    prepareTestProcessBinding();
  });

  afterEach(async () => {
    await closeProfileClients(clients);
    clients.length = 0;
    await host?.stop();
    host = undefined;
    await cleanup?.shutdown("test-end");
    cleanup = undefined;
    closeDatabase();
  });

  function itemText(item: { payload?: unknown; streams?: Record<string, string> }): string {
    const content = (
      (item.payload as { content?: Array<{ kind?: string; text?: string }> } | undefined)
        ?.content ?? []
    )
      .filter((part) => part.kind === "text")
      .map((part) => part.text ?? "")
      .join("\n");
    const streamed = item.streams?.assistant_text ?? "";
    return `${content}\n${streamed}`;
  }

  async function waitForTurn(
    client: ProfileClient,
    userItemOrdinal: number,
    timeoutMs: number,
  ): Promise<TurnOutcome> {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    for (;;) {
      const history = await client.fetchJson(
        "history-poll",
        `/api/threads/${THREAD_ID}/history?runtimePage=1`,
      );
      expectOk(history.status, "thread history poll", history.body);
      const snapshot = history.body as {
        thread?: { status?: string };
        runtimeItems?: Array<{
          id: string;
          type?: string;
          state?: string;
          payload?: unknown;
          streams?: Record<string, string>;
        }>;
      };
      const items = snapshot.runtimeItems ?? [];
      const target = items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.type === "user_message")[userItemOrdinal];
      if (target) {
        const assistant = items
          .slice(target.index + 1)
          .find(
            (item) =>
              item.type === "assistant_message" &&
              (item.state === "completed" || item.state === "updated") &&
              itemText(item).trim().length > 0,
          );
        if (assistant && snapshot.thread?.status === "idle") {
          return {
            userItemId: target.item.id,
            assistantText: itemText(assistant).trim(),
            waitedMs: Date.now() - startedAt,
          };
        }
      }
      if (Date.now() > deadline) {
        throw new Error(
          `turn ${String(userItemOrdinal + 1)} did not complete within ${String(timeoutMs)}ms ` +
            `(thread status: ${snapshot.thread?.status ?? "unknown"})`,
        );
      }
      await sleep(2_000);
    }
  }

  it("rolls a real provider conversation back to the anchor", async () => {
    cleanup = new ProcessCleanup();
    host = await startRealHost({
      port: await allocateLoopbackPort(),
      cleanup,
      baseDirRoot: join(repoRoot, "tmp", ".tmp", "provider-revert-qa"),
    });
    const dbPath = join(host.baseDir, "state.sqlite");
    seedGuiThread(dbPath);

    const credential = await acquireDeviceCredential(host, "provider-revert");
    const client = await ProfileClient.create({
      handle: host,
      label: "provider-revert",
      accessToken: credential.accessToken,
    });
    clients.push(client);

    const projectLocation = { kind: "posix" as const, path: join(host.baseDir, "fixture-repo") };
    const config = { model: MODEL };

    // Turn 1 — innocuous, so the revert anchor (turn 2's prompt, a non-first
    // user message) stays inside the supported rollback window.
    const startedAtIso = new Date().toISOString();
    const start = await client.fetchJson("thread-start", "/api/threads/start", {
      method: "POST",
      body: {
        threadId: THREAD_ID,
        projectLocation,
        agentKind: "claude",
        config,
        prompt: "Reply with exactly: OK",
        presentationMode: "gui",
        initialSize: { cols: 80, rows: 24 },
      },
    });
    expectOk(start.status, "thread start", start.body);
    const turn1 = await waitForTurn(client, 0, 180_000);
    expect(turn1.assistantText.toUpperCase()).toContain("OK");

    // Turn 2 — teach the session the code.
    const send2 = await client.fetchJson("thread-send-2", `/api/threads/${THREAD_ID}/send`, {
      method: "POST",
      body: {
        prompt: `Remember this access code for the rest of the conversation: ${SECRET}. Reply with exactly: NOTED`,
        config,
      },
    });
    expectOk(send2.status, "turn 2 send", send2.body);
    const turn2 = await waitForTurn(client, 1, 180_000);
    expect(turn2.assistantText.toUpperCase()).toContain("NOTED");

    // File checkpoint bound to turn 2's user message (the revert anchor).
    const checkpoint = await client.gitProcedure("file-checkpoint", "createFileCheckpoint", {
      threadId: THREAD_ID,
      checkpointItemId: turn2.userItemId,
      projectLocation,
    });
    expectOk(checkpoint.status, "create file checkpoint", checkpoint.body);

    // Turn 3 — the live session proves it knows the code.
    const send3 = await client.fetchJson("thread-send-3", `/api/threads/${THREAD_ID}/send`, {
      method: "POST",
      body: { prompt: "What was my access code? Reply with the code only.", config },
    });
    expectOk(send3.status, "turn 3 send", send3.body);
    const turn3 = await waitForTurn(client, 2, 180_000);
    expect(turn3.assistantText).toContain(SECRET);

    // The compound revert must complete every phase against the real provider.
    // Reverting to turn 2's prompt keeps turn 1 and rolls back turns 2 and 3.
    const revert = await client.fetchJson(
      "checkpoint-revert",
      `/api/threads/${THREAD_ID}/checkpoint-revert`,
      {
        method: "POST",
        body: {
          checkpointItemId: turn2.userItemId,
          operationKey: `provider-revert-${THREAD_ID}-1`,
        },
      },
    );
    expectOk(revert.status, "checkpoint revert", revert.body);
    expect(revert.body).toMatchObject({
      outcome: "completed",
      replayed: false,
      numTurns: 2,
      providerPhase: "completed",
      filesPhase: "completed",
      truncatePhase: "completed",
    });

    // The transcript keeps turn 1 and turn 2's prompt; turns 2–3 are gone.
    const history = await client.fetchJson(
      "history-after-revert",
      `/api/threads/${THREAD_ID}/history?runtimePage=1`,
    );
    expectOk(history.status, "history after revert", history.body);
    const items = (history.body as { runtimeItems?: Array<{ type?: string }> }).runtimeItems ?? [];
    expect(items.filter((item) => item.type === "user_message")).toHaveLength(2);
    expect(items.filter((item) => item.type === "assistant_message")).toHaveLength(1);

    // Turn 4 — the rolled-back session must not know the code.
    const send4 = await client.fetchJson("thread-send-4", `/api/threads/${THREAD_ID}/send`, {
      method: "POST",
      body: {
        prompt:
          "If I gave you an access code earlier in this conversation, reply with it. Otherwise reply exactly: NO CODE GIVEN",
        config,
      },
    });
    expectOk(send4.status, "turn 4 send", send4.body);
    const turn4 = await waitForTurn(client, 2, 180_000);
    expect(turn4.assistantText).not.toContain(SECRET);

    writeExperimentArtifact(repoRoot, "checkpoint-revert-provider-backed.json", {
      startedAtIso,
      threadId: THREAD_ID,
      model: MODEL,
      turns: {
        first: { assistantText: turn1.assistantText, waitedMs: turn1.waitedMs },
        second: { assistantText: turn2.assistantText, waitedMs: turn2.waitedMs },
        third: { assistantText: turn3.assistantText, waitedMs: turn3.waitedMs },
        afterRevert: { assistantText: turn4.assistantText, waitedMs: turn4.waitedMs },
      },
      revertOutcome: revert.body,
      proof:
        "Turn 3's live answer contains the secret (the provider conversation held it); " +
        "after the compound revert to turn 2's prompt (provider anchor restored, file " +
        "checkpoint restored, transcript truncated) the follow-up answer does not — the " +
        "provider session itself was rolled back, not just the local transcript.",
      scope:
        "Real headless host with an authenticated Claude CLI session (low-cost model), " +
        "four real model turns, file checkpoint + compound checkpoint-revert route. " +
        "Opt-in via PORACODE_E2E_PROVIDER_REVERT=1.",
    });
  }, 600_000);
});
