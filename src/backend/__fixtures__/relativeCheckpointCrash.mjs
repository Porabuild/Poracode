import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BackendHostCore } from "../BackendHostCore.ts";
import { dbUpsertProject, dbUpsertThread } from "../../host/db/projectsThreads.ts";
import {
  dbApplyThreadRuntimeEvents,
  dbAppendThreadCompletedTurn,
} from "../../host/db/runtimeItems.ts";

const directory = process.argv[2];
const crash = process.argv[3] === "crash";
const fresh = !existsSync(join(directory, "state.sqlite"));
const thread = JSON.parse(readFileSync(join(directory, "thread.json"), "utf8"));
const host = new BackendHostCore({
  baseDir: directory,
  dbPath: join(directory, "state.sqlite"),
  supervisor: {
    appVersion: "test",
    isDev: false,
    supervisorPath: "/unused",
    wslHelpersDir: "/unused",
    secretStorageKey: "",
  },
  onEvent() {},
  onReset() {},
});
host.supervisorClient.call = async (procedure) => {
  if (procedure === "createRevertAnchor")
    throw new Error("Provider does not support revert anchors.");
  if (procedure === "rollbackThreadConversation") {
    appendFileSync(join(directory, "rollback-effects"), "rollback\n");
    if (crash) process.kill(process.pid, "SIGKILL");
  }
};
try {
  if (fresh) {
    dbUpsertProject(
      {
        id: thread.projectId,
        name: "Project",
        location: { kind: "posix", path: directory },
        createdAt: thread.createdAt,
      },
      0,
    );
    dbUpsertThread(thread, 0);
    dbApplyThreadRuntimeEvents(
      thread.id,
      ["checkpoint", "assistant-after"].map((itemId) => ({
        type: "item.started",
        threadId: thread.id,
        itemId,
        itemType: "assistant_message",
      })),
    );
    dbAppendThreadCompletedTurn(thread.id, {
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:01.000Z",
      anchorItemId: "assistant-after",
    });
  } else {
    const gap = host.getThreadRuntimeGap(thread.id);
    if (gap) await host.acknowledgeThreadRuntimeGap(thread.id, gap.token);
  }
  console.log(
    JSON.stringify(
      await host.revertCheckpoint({
        operationKey: "relative-operation",
        threadId: thread.id,
        checkpointItemId: "checkpoint",
      }),
    ),
  );
} finally {
  await host.dispose();
}
