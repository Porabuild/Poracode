import { afterEach, describe, expect, it } from "vitest";
import { backgroundTaskOutputSchema } from "../../src/shared/contracts/runtimeEvent.ts";
import {
  BACKGROUND_TASK_STAGES,
  loadBackgroundTaskFixture,
  type BackgroundTaskLabSnapshot,
} from "./harness/backgroundTaskLab.ts";
import { controlRequest, openReadySocket, pairAndAuth, startLab } from "./helpers/testClient.ts";

const fixture = loadBackgroundTaskFixture();
const THREAD_ID = fixture.threadId;

type Harness = Awaited<ReturnType<typeof startLab>>;

async function callProcedure(
  harness: Harness,
  accessToken: string,
  procedure: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL("/api/git/call", harness.httpBaseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ procedure, payload }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function readHistory(
  harness: Harness,
  accessToken: string,
): Promise<{ backgroundTasks?: Array<Record<string, unknown>> }> {
  const response = await fetch(
    new URL(`/api/threads/${encodeURIComponent(THREAD_ID)}/history`, harness.httpBaseUrl),
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { backgroundTasks?: Array<Record<string, unknown>> };
}

function invokePayload(actionId: string, payload: Record<string, string>) {
  return { threadId: THREAD_ID, actionId, payload };
}

function taskOf(handle: string): Record<string, unknown> {
  const task = fixture.stages.initial.tasks.find(
    (candidate) => candidate.stopAction?.payload.handle === handle,
  );
  if (!task) throw new Error(`fixture has no task for ${handle}`);
  return task as unknown as Record<string, unknown>;
}

function monitorAction(action: "stop" | "output"): Record<string, string> {
  const task = taskOf("monitor-handle");
  const actionEntry = (action === "stop" ? task.stopAction : task.outputAction) as
    | { payload: Record<string, string> }
    | undefined;
  if (!actionEntry) throw new Error(`fixture task has no ${action} action`);
  return { ...actionEntry.payload };
}

function snapshot(harness: Harness): BackgroundTaskLabSnapshot {
  return harness.scenario.state().backgroundTasks;
}

async function scenarioAction(harness: Harness, body: Record<string, unknown>): Promise<Response> {
  return controlRequest(harness, "/v1/scenario/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("shared background-task fixture", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("serves the fixture roster in initial history and lists its actions", async () => {
    harness = await startLab();
    expect(BACKGROUND_TASK_STAGES).toEqual(["initial", "progress", "category-command", "drain"]);
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);

    const history = await readHistory(harness, accessToken);
    expect(history.backgroundTasks?.map((task) => task.taskId)).toEqual([
      "bg-command",
      "bg-monitor",
      "bg-tool",
    ]);
    expect(history.backgroundTasks?.[1]).toMatchObject({
      category: "monitor",
      description: "Watch the fixture server health",
      progress: "Watching 3 endpoints",
    });

    const inventory = await callProcedure(harness, accessToken, "listThreadSessionActions", {
      threadId: THREAD_ID,
    });
    expect(inventory.status).toBe(200);
    expect(inventory.body.result).toEqual({
      actions: [{ id: fixture.actions.output }, { id: fixture.actions.stop }],
    });

    const authoritative = await callProcedure(harness, accessToken, "readThreadBackgroundTasks", {
      threadId: THREAD_ID,
    });
    expect(authoritative.status).toBe(200);
    expect(authoritative.body.result).toEqual(history.backgroundTasks);
  });

  it("publishes progress and category/command-only replacements that stay authoritative", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);
    const socket = await openReadySocket(harness, accessToken);

    expect(
      (
        await scenarioAction(harness, {
          type: "background-task-stage",
          stage: "progress",
        })
      ).status,
    ).toBe(200);
    const progressFrame = (await socket.next()) as {
      type: string;
      event: { type: string; event: { type: string; tasks: Array<Record<string, unknown>> } };
    };
    expect(progressFrame.type).toBe("event");
    expect(progressFrame.event.type).toBe("thread-runtime-event");
    expect(progressFrame.event.event.type).toBe("background_tasks.changed");
    expect(
      progressFrame.event.event.tasks.find((task) => task.taskId === "bg-monitor"),
    ).toMatchObject({ progress: "Watching 3 endpoints: 1 degraded" });

    expect(
      (
        await scenarioAction(harness, {
          type: "background-task-stage",
          stage: "category-command",
        })
      ).status,
    ).toBe(200);
    const updateFrame = (await socket.next()) as {
      event: { event: { tasks: Array<Record<string, unknown>> } };
    };
    const changed = updateFrame.event.event.tasks;
    expect(changed.find((task) => task.taskId === "bg-monitor")).toMatchObject({
      command: "node scripts/watch-health.mjs --follow",
      progress: "Watching 3 endpoints: 1 degraded",
    });
    expect(changed.find((task) => task.taskId === "bg-tool")).toMatchObject({
      category: "workflow",
      command: "node fixture/index-tools.mjs",
      description: "Index the fixture tool catalog",
    });

    const history = await readHistory(harness, accessToken);
    expect(history.backgroundTasks).toEqual(changed);
    socket.ws.close();
  });

  it("returns changing bounded output and records reads without starting a model", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);

    const first = await callProcedure(
      harness,
      accessToken,
      "invokeThreadSessionAction",
      invokePayload(fixture.actions.output, monitorAction("output")),
    );
    const second = await callProcedure(
      harness,
      accessToken,
      "invokeThreadSessionAction",
      invokePayload(fixture.actions.output, monitorAction("output")),
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstOutput = backgroundTaskOutputSchema.parse(first.body.result);
    const secondOutput = backgroundTaskOutputSchema.parse(second.body.result);
    expect(firstOutput.output).toContain("read 1");
    expect(secondOutput.output).toContain("read 2");
    expect(firstOutput.output).not.toBe(secondOutput.output);
    expect(firstOutput.truncated).toBe(false);
    expect(firstOutput.totalBytes).toBeGreaterThan(0);

    const empty = await callProcedure(
      harness,
      accessToken,
      "invokeThreadSessionAction",
      invokePayload(fixture.actions.output, {
        runKey: fixture.output.emptyRunKey,
        handle: "monitor-handle",
      }),
    );
    expect(empty.status).toBe(200);
    expect(backgroundTaskOutputSchema.parse(empty.body.result)).toEqual({
      output: "",
      totalBytes: 0,
      truncated: false,
    });

    const truncated = await callProcedure(
      harness,
      accessToken,
      "invokeThreadSessionAction",
      invokePayload(fixture.actions.output, {
        runKey: fixture.output.truncatedRunKey,
        handle: "monitor-handle",
      }),
    );
    expect(truncated.status).toBe(200);
    const truncatedOutput = backgroundTaskOutputSchema.parse(truncated.body.result);
    expect(truncatedOutput.truncated).toBe(true);
    expect(truncatedOutput.output).toHaveLength(fixture.output.truncatedTailLength);
    expect(truncatedOutput.totalBytes).toBe(fixture.output.truncatedTotalBytes);

    const observed = harness.scenario.state().observedOperationIds;
    expect(observed).toContain("procedure:invokeThreadSessionAction");
    expect(observed).not.toContain("route:thread-send");
    expect(observed).not.toContain("runtime:turn.started");
    expect(harness.lab.backgroundTasks.snapshot().outputReads).toBe(4);
  });

  it("confirms Stop by replacing the roster and keeps a drained reconnect empty", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);
    const socket = await openReadySocket(harness, accessToken);

    const stopped = await callProcedure(
      harness,
      accessToken,
      "invokeThreadSessionAction",
      invokePayload(fixture.actions.stop, monitorAction("stop")),
    );
    expect(stopped.status).toBe(200);
    expect(stopped.body.result).toEqual({});
    expect(snapshot(harness).stops).toBe(1);
    const stopFrame = (await socket.next()) as {
      event: { event: { type: string; tasks: Array<Record<string, unknown>> } };
    };
    expect(stopFrame.event.event.type).toBe("background_tasks.changed");
    expect(stopFrame.event.event.tasks.map((task) => task.taskId)).toEqual(
      fixture.stages.stopped.tasks.map((task) => task.taskId),
    );
    // Stop removed a task, so the scenario snapshot names the stopped stage.
    expect(snapshot(harness).stage).toBe("stopped");

    // Arm the delayed reply, issue an old-run read, then drain before it lands.
    expect(
      (
        await scenarioAction(harness, {
          type: "background-task-output-delay",
          delayMs: 120,
        })
      ).status,
    ).toBe(200);
    const delayedRead = callProcedure(
      harness,
      accessToken,
      "invokeThreadSessionAction",
      invokePayload(fixture.actions.output, monitorAction("output")),
    );
    expect(
      (await scenarioAction(harness, { type: "background-task-stage", stage: "drain" })).status,
    ).toBe(200);
    const drainedFrame = (await socket.next()) as {
      event: { event: { type: string; tasks: Array<Record<string, unknown>> } };
    };
    expect(drainedFrame.event.event.tasks).toEqual([]);
    const latest = await callProcedure(
      harness,
      accessToken,
      "invokeThreadSessionAction",
      invokePayload(fixture.actions.output, monitorAction("output")),
    );
    const delayed = await delayedRead;
    expect(delayed.status).toBe(200);
    expect(backgroundTaskOutputSchema.parse(delayed.body.result).output).toContain("read 1");
    expect(backgroundTaskOutputSchema.parse(latest.body.result).output).toContain("read 2");

    // Reconnect reads the snapshot, never the delayed reply: authoritative empty.
    const history = await readHistory(harness, accessToken);
    expect(history.backgroundTasks).toEqual([]);
    expect(snapshot(harness)).toMatchObject({
      stage: "drain",
      taskIds: [],
      outputReads: 2,
      outputDelivered: 2,
      stops: 1,
    });
    socket.ws.close();
  });

  it("treats an unadvertised opaque action as a no-op without starting a model", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);
    const result = await callProcedure(
      harness,
      accessToken,
      "invokeThreadSessionAction",
      invokePayload("background-unknown.test.v1", { runKey: "one", handle: "monitor-handle" }),
    );
    expect(result.status).toBe(200);
    expect(result.body.result).toEqual({});
    const observed = harness.scenario.state().observedOperationIds;
    expect(observed).not.toContain("route:thread-send");
    expect(observed).not.toContain("runtime:turn.started");
    expect(snapshot(harness).outputReads).toBe(0);
  });
});
