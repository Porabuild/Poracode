import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  closeDatabase,
  dbReplaceThreadRuntimeSnapshot,
  dbUpsertProject,
  dbUpsertThread,
  initDatabase,
  type PersistedCompletedTurn,
  type PersistedRuntimeItem,
} from "@/main/db";
import type { Thread } from "@/shared/contracts";
import { acquireRealHostFixtureRoot } from "../harness/realHostRoot";

/**
 * Deterministic many-thread/long-history host workload for payload baselines
 * (M2-4). Seeds the host's own SQLite database — through the application's DB
 * layer (`@/main/db`), before the headless server boots — with one fixture
 * project plus 60 `inactive` threads, 10 of which carry 40-item runtime
 * histories. Real threads require real agent spawns, so a durable pre-seed is
 * the only way to measure the production snapshot/history serialization path
 * without model calls. The headless host opens the same WAL database and its
 * `markLiveThreadsInactiveOnOpen` sweep leaves `inactive` rows untouched, so
 * `/api/snapshot` and `/api/threads/:id/history` serve the seeded rows through
 * the real zod-parsed remote pipeline.
 */

const LOAD_PROJECT_ID = "proj-native-e2e-load";
const LOAD_PROJECT_NAME = "native-e2e-load";
const LOAD_THREAD_COUNT = 60;
const LOAD_LONG_THREAD_COUNT = 10;
const LOAD_LONG_ITEMS_PER_THREAD = 40;
const LOAD_SHORT_ITEMS_PER_THREAD = 6;

/** Sort order for the seeded project: far behind harness-created projects so
 * reordering by other workloads never interleaves with them. */
const LOAD_PROJECT_SORT_ORDER = 5_000;
const LOAD_THREAD_SORT_ORDER_BASE = 10_000;
const SEED_EPOCH_MS = Date.UTC(2026, 8, 1, 12, 0, 0);

export interface LoadThreadSpec {
  readonly threadId: string;
  readonly itemCount: number;
}

export interface LoadWorkloadSpec {
  readonly threadCount: number;
  readonly longThreads: readonly LoadThreadSpec[];
  readonly itemsPerShortThread: number;
}

const FILLER_WORDS = [
  "constrained",
  "network",
  "baseline",
  "payload",
  "workload",
  "history",
  "thread",
  "profile",
];

/** Deterministic pseudo-text: same seed → same bytes, so evidence runs are
 * reproducible and byte deltas are attributable to code, not fixtures. */
function fillerText(seed: number, targetChars: number): string {
  const words: string[] = [];
  let size = 0;
  let cursor = (seed % 100_003) + 1;
  while (size < targetChars) {
    const word = FILLER_WORDS[cursor % FILLER_WORDS.length]!;
    words.push(word);
    size += word.length + 1;
    cursor = (cursor * 31 + 7) % 100_003;
  }
  return words.join(" ").slice(0, targetChars);
}

function itemId(threadIndex: number, itemIndex: number): string {
  return `itm-load-${String(threadIndex).padStart(3, "0")}-${String(itemIndex).padStart(3, "0")}`;
}

function buildItems(threadIndex: number, itemCount: number): PersistedRuntimeItem[] {
  const items: PersistedRuntimeItem[] = [];
  for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
    const id = itemId(threadIndex, itemIndex);
    const seed = threadIndex * 1_000 + itemIndex;
    const kind = itemIndex % 4;
    if (kind === 0) {
      items.push({
        id,
        type: "user_message",
        state: "completed",
        payload: { text: fillerText(seed, 200) },
        streams: {},
      });
    } else if (kind === 2) {
      items.push({
        id,
        type: "tool_call",
        state: "completed",
        payload: {
          toolName: "read_project_file",
          input: { path: `src/module-${String(itemIndex).padStart(2, "0")}.ts` },
          output: { content: fillerText(seed, 650) },
        },
        streams: {},
      });
    } else {
      items.push({
        id,
        type: "assistant_message",
        state: "completed",
        payload: { text: fillerText(seed, 650) },
        streams: {},
      });
    }
  }
  return items;
}

function buildTurns(
  threadIndex: number,
  itemCount: number,
  turnCount: number,
): PersistedCompletedTurn[] {
  return Array.from({ length: turnCount }, (_, turnIndex) => {
    const anchorIndex = Math.min((turnIndex + 1) * 10, itemCount) - 1;
    return {
      startedAt: new Date(SEED_EPOCH_MS + threadIndex * 60_000 + turnIndex * 30_000).toISOString(),
      endedAt: new Date(
        SEED_EPOCH_MS + threadIndex * 60_000 + turnIndex * 30_000 + 25_000,
      ).toISOString(),
      anchorItemId: itemId(threadIndex, Math.max(0, anchorIndex)),
    };
  });
}

/**
 * Acquires the disposable namespace, initializes its synthetic credentials,
 * seeds the mapped owned database, and closes SQLite before releasing the lease.
 * The later server process opens the same root through the normal bootstrap.
 */
export async function seedLoadWorkload(profileNamespace: string): Promise<LoadWorkloadSpec> {
  const { owner, runtime } = await acquireRealHostFixtureRoot(profileNamespace);
  try {
    const projectPath = join(runtime.paths.baseDir, "load-fixture");
    mkdirSync(projectPath, { recursive: true, mode: 0o700 });
    initDatabase(runtime.paths.dbPath);
    const createdAt = new Date(SEED_EPOCH_MS).toISOString();
    dbUpsertProject(
      {
        id: LOAD_PROJECT_ID,
        name: LOAD_PROJECT_NAME,
        location: { kind: "posix", path: projectPath },
        createdAt,
      },
      LOAD_PROJECT_SORT_ORDER,
    );

    const longThreads: LoadThreadSpec[] = [];
    for (let threadIndex = 0; threadIndex < LOAD_THREAD_COUNT; threadIndex += 1) {
      const isLong = threadIndex < LOAD_LONG_THREAD_COUNT;
      const itemCount = isLong ? LOAD_LONG_ITEMS_PER_THREAD : LOAD_SHORT_ITEMS_PER_THREAD;
      const threadId = `thr-load-${String(threadIndex).padStart(3, "0")}`;
      const thread: Thread = {
        id: threadId,
        projectId: LOAD_PROJECT_ID,
        title: `Load thread ${String(threadIndex)} (constrained-network payload baseline)`,
        agentKind: "codex",
        config: { model: "load-baseline-model" },
        status: "inactive",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "terminal",
        createdAt,
        updatedAt: createdAt,
      };
      dbUpsertThread(thread, LOAD_THREAD_SORT_ORDER_BASE + threadIndex);
      dbReplaceThreadRuntimeSnapshot(
        threadId,
        buildItems(threadIndex, itemCount),
        buildTurns(threadIndex, itemCount, isLong ? 4 : 1),
        isLong ? { usedTokens: 12_000 + threadIndex * 37, maxTokens: 200_000 } : undefined,
      );
      if (isLong) longThreads.push({ threadId, itemCount });
    }

    return {
      threadCount: LOAD_THREAD_COUNT,
      longThreads,
      itemsPerShortThread: LOAD_SHORT_ITEMS_PER_THREAD,
    };
  } finally {
    closeDatabase();
    await owner.close();
  }
}
