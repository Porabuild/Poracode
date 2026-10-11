// Real process fault fixture for the B1 durable canonical-gap evidence.
// Never imported by a production entry point: the crash test forks this
// module, waits for its marker, and SIGKILLs it so the close hook never runs.
// The reopened database must still identify the thread from the durable arm +
// touch evidence (or be truthfully clean after a real clean close).
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { dbApplyThreadRuntimeEvents } from "@/host/db/runtimeItems";
import { markRuntimeRebaseDropped } from "@/host/db/runtimePersistenceRuntime";
import type { RuntimeEvent, Thread } from "@/shared/contracts";

const THREAD_ID = "thread-crash-fixture";

type FixtureMode = "armed-touch-accepted" | "gap-write-failed" | "clean-close";

function requiredArgument(index: number, name: string): string {
  const value = process.argv[index];
  if (!value) throw new Error(`Missing durable-gap crash fixture ${name}.`);
  return value;
}

function fixtureThread(): Thread {
  return {
    id: THREAD_ID,
    projectId: "project-crash",
    title: "Crash fixture",
    agentKind: "claude",
    config: { model: "claude-sonnet-4-5" },
    status: "inactive",
    attention: "none",
    canResumeWithConfig: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as Thread;
}

function started(itemId: string): RuntimeEvent {
  return {
    type: "item.started",
    threadId: THREAD_ID,
    itemId,
    itemType: "assistant_message",
  } as RuntimeEvent;
}

const mode = requiredArgument(2, "mode") as FixtureMode;
const dbPath = requiredArgument(3, "database path");

initDatabase(dbPath);
dbUpsertProject(
  {
    id: "project-crash",
    name: "Crash fixture",
    location: { kind: "posix", path: process.cwd() },
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  0,
);
dbUpsertThread(fixtureThread(), 0);

switch (mode) {
  case "armed-touch-accepted": {
    // Arms the boot, touches the thread, and accepts one event in the same
    // process: a SIGKILL now loses the accepted event but leaves the touch.
    dbApplyThreadRuntimeEvents(THREAD_ID, [started("accepted")]);
    console.log("TOUCHED_ACCEPTED");
    break;
  }
  case "gap-write-failed": {
    dbApplyThreadRuntimeEvents(THREAD_ID, [started("accepted")]);
    // Storage becomes unwritable: the next refusal cannot persist its exact
    // gap row. The refusal is still explicit and the pending obligation is
    // tracked; the boot must not be able to close cleanly.
    getSqlite().pragma("query_only = ON");
    markRuntimeRebaseDropped(THREAD_ID);
    console.log("GAP_WRITE_REFUSED");
    break;
  }
  case "clean-close": {
    dbApplyThreadRuntimeEvents(THREAD_ID, [started("committed")]);
    closeDatabase();
    console.log("CLEAN_CLOSED");
    process.exit(0);
  }
}

// Stay alive so the parent controls the SIGKILL point.
setInterval(() => {}, 1_000);
