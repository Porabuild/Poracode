/**
 * Adapter-level qualification of the structured workload fixture.
 *
 * Each test runs the fixture as a REAL child process through the production
 * `acp-generic` driver + `AcpStructuredSession` + shared canonical mapping —
 * no fake event injection. This is the strongest proof available without
 * launching Electron or a supervisor (see
 * `tmp/v2-production/structured-workload-fixture.md` for the evidence limits
 * and the preflight integration requirements).
 */
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_TERMINAL_SIZE } from "@/shared/contracts";
import {
  closeThreadPayloadSchema,
  interruptThreadPayloadSchema,
  startThreadPayloadSchema,
} from "@/shared/contracts/thread.ts";
import { mergeManagedSharedSettings } from "@/host/sharedSettingsFile";
import type { ProjectLocation } from "@/shared/contracts";
import {
  agentInstanceConfigSchema,
  parseAcpGenericInstanceConfig,
} from "@/shared/contracts/agentInstance";
import { persistedThreadSchema } from "@/shared/ipc/schemas.ts";
import { normalizeSharedSettings } from "@/shared/settings";
import type { ManagedCdpClient } from "./managedAppSession.ts";
import {
  buildStructuredWorkloadInstance,
  buildStructuredWorkloadOfflineSeed,
  buildStructuredWorkloadThreadRow,
  canonicalGuiEventCounts,
  checkStructuredWorkloadTurn,
  closeStructuredWorkloadThread,
  collectCanonicalGuiFrameEvidence,
  createStructuredWorkloadSession,
  disposeStructuredWorkload,
  interruptStructuredWorkloadThread,
  isStructuredWorkloadProcessAlive,
  launchStructuredWorkloadThread,
  openStructuredWorkload,
  prepareStructuredWorkloadMarkers,
  readSeededStructuredWorkloadInstance,
  readStructuredWorkloadMarker,
  readStructuredWorkloadPid,
  resolveStructuredWorkloadParams,
  seedStructuredWorkloadThreadRow,
  startStructuredWorkloadTurn,
  STRUCTURED_WORKLOAD_FIXTURE_PATH,
  StructuredWorkloadRecorder,
  structuredWorkloadFixtureSha256,
  structuredWorkloadHash,
  structuredWorkloadSettingsPath,
  waitForCanonicalGuiFrames,
  waitForStructuredWorkloadCondition,
  waitForStructuredWorkloadExit,
  waitForStructuredWorkloadPid,
  waitForStructuredWorkloadWireStatus,
  writeStructuredWorkloadSettingsSeed,
} from "./structuredWorkload.ts";

const roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "structured-load-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function projectLocation(path: string): ProjectLocation {
  return process.platform === "win32" ? { kind: "windows", path } : { kind: "posix", path };
}

describe("structured workload fixture (real generic ACP adapter)", () => {
  it("normalizes ordered marker-tagged turns and tears the child down", async () => {
    const root = await makeRoot();
    const params = resolveStructuredWorkloadParams({
      promptMarkerPath: join(root, "prompt.marker"),
      cancelMarkerPath: join(root, "cancel.marker"),
      readyMarkerPath: join(root, "ready.marker"),
    });
    const session = await createStructuredWorkloadSession({
      params,
      projectLocation: projectLocation(root),
      threadId: "structured-load-thread",
    });
    expect(session.adapterKind).toBe("acp-generic:structured-load-fixture");

    const recorder = new StructuredWorkloadRecorder();
    const sessionRef = await openStructuredWorkload({ session, recorder });
    expect(sessionRef).toBe(params.sessionId);
    const pid = readStructuredWorkloadPid(params.readyMarkerPath!);

    for (const turn of [1, 2] as const) {
      const eventsAtStart = recorder.events.length;
      const started = startStructuredWorkloadTurn({
        session,
        recorder,
        prompt: `structured load probe ${String(turn)}`,
      });
      const outcome = await started.done;
      expect(outcome.state).toBe("completed");
      const problems = checkStructuredWorkloadTurn({
        turn,
        params,
        events: recorder.events.slice(eventsAtStart),
      });
      expect(problems).toEqual([]);
    }

    const snapshot = recorder.snapshot();
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.turnCompletedStates).toEqual(["completed", "completed"]);
    expect(snapshot.deltaByStream.assistant_text).toBe(params.textChunks * 2);
    expect(snapshot.deltaByStream.reasoning_text).toBe(params.thoughtChunks * 2);
    expect(snapshot.itemStartedByType.user_message).toBe(2);
    expect(snapshot.itemStartedByType.command_execution).toBe(params.toolCalls * 2);
    expect(snapshot.itemCompletedByType.command_execution).toBe(params.toolCalls * 2);
    expect(snapshot.statusTransitions[0]).toBe("working");
    expect(snapshot.statusTransitions.at(-1)).toBe("idle");

    expect(await readFile(params.promptMarkerPath!, "utf8")).toBe("2");
    expect(session.fixtureSha256).toBe(structuredWorkloadFixtureSha256());
    expect(session.paramsHash).toBe(structuredWorkloadHash(params));

    await disposeStructuredWorkload(session);
    await waitForStructuredWorkloadCondition(() => !isStructuredWorkloadProcessAlive(pid), {
      label: "fixture process exit after dispose",
    });
  }, 30_000);

  it("throttles frame emission to the calibrated rate", async () => {
    const root = await makeRoot();
    const params = resolveStructuredWorkloadParams({
      ratePerSec: 40,
      thoughtChunks: 2,
      textChunks: 4,
      toolCalls: 1,
      promptMarkerPath: join(root, "prompt.marker"),
      readyMarkerPath: join(root, "ready.marker"),
    });
    const session = await createStructuredWorkloadSession({
      params,
      projectLocation: projectLocation(root),
      threadId: "structured-load-rate-thread",
    });
    const recorder = new StructuredWorkloadRecorder();
    await openStructuredWorkload({ session, recorder });
    const pid = readStructuredWorkloadPid(params.readyMarkerPath!);
    const started = startStructuredWorkloadTurn({ session, recorder, prompt: "rate probe" });
    const outcome = await started.done;
    expect(outcome.state).toBe("completed");
    // The plan holds 8 frames; 40/s needs at least 7 x 25 ms of scheduling.
    expect(outcome.elapsedMs).toBeGreaterThanOrEqual(120);
    expect(checkStructuredWorkloadTurn({ turn: 1, params, events: recorder.events })).toEqual([]);
    await disposeStructuredWorkload(session);
    await waitForStructuredWorkloadCondition(() => !isStructuredWorkloadProcessAlive(pid), {
      label: "fixture process exit after dispose",
    });
  }, 30_000);

  it("cancels an in-flight turn and stops the producer", async () => {
    const root = await makeRoot();
    const params = resolveStructuredWorkloadParams({
      ratePerSec: 30,
      thoughtChunks: 2,
      textChunks: 400,
      toolCalls: 3,
      promptMarkerPath: join(root, "prompt.marker"),
      cancelMarkerPath: join(root, "cancel.marker"),
      readyMarkerPath: join(root, "ready.marker"),
    });
    const session = await createStructuredWorkloadSession({
      params,
      projectLocation: projectLocation(root),
      threadId: "structured-load-cancel-thread",
    });
    const recorder = new StructuredWorkloadRecorder();
    await openStructuredWorkload({ session, recorder });
    const pid = readStructuredWorkloadPid(params.readyMarkerPath!);
    const started = startStructuredWorkloadTurn({ session, recorder, prompt: "cancel probe" });
    await waitForStructuredWorkloadCondition(
      () =>
        recorder.events.filter(
          (event) => event.type === "content.delta" && event.stream === "assistant_text",
        ).length >= 3,
      { label: "three assistant deltas" },
    );

    if (!session.handle.interruptTurn) throw new Error("structured session has no interruptTurn()");
    await session.handle.interruptTurn();
    const outcome = await started.done;
    expect(outcome.state).toBe("cancelled");
    expect(await readFile(params.cancelMarkerPath!, "utf8")).toBe("1");

    const problems = checkStructuredWorkloadTurn({
      turn: 1,
      params,
      events: recorder.events,
      truncated: true,
    });
    expect(problems).toEqual([]);
    const completedIndex = recorder.events.findIndex((event) => event.type === "turn.completed");
    expect(completedIndex).toBe(recorder.events.length - 1);
    expect(
      recorder.events.slice(completedIndex).some((event) => event.type === "content.delta"),
    ).toBe(false);

    await disposeStructuredWorkload(session);
    await waitForStructuredWorkloadCondition(() => !isStructuredWorkloadProcessAlive(pid), {
      label: "fixture process exit after dispose",
    });
  }, 30_000);

  it("exits on parent stdin EOF", async () => {
    const root = await makeRoot();
    const exitMarker = join(root, "exit.marker");
    const child = spawn(process.execPath, [STRUCTURED_WORKLOAD_FIXTURE_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        STRUCTURED_LOAD_EXIT_MARKER: exitMarker,
        STRUCTURED_LOAD_RATE_PER_SEC: "0",
      },
    });
    const stdout = child.stdout;
    const stdin = child.stdin;
    if (!stdout || !stdin) throw new Error("fixture child did not expose stdio pipes");
    const lines = createInterface({ input: stdout });
    const firstLine = new Promise<string>((resolve, reject) => {
      lines.once("line", resolve);
      child.once("error", reject);
    });
    stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
    const initialized = JSON.parse(await firstLine) as {
      result?: { agentInfo?: { name?: string } };
    };
    expect(initialized.result?.agentInfo?.name).toBe("structured-load-agent");

    stdin.end();
    const exitCode = await new Promise<number | null>((resolve) => child.once("exit", resolve));
    expect(exitCode).toBe(0);
    expect(existsSync(exitMarker)).toBe(true);
    lines.close();
  }, 15_000);

  it("prepares the persisted generic instance for offline seeding without weakening the host guard", () => {
    const params = resolveStructuredWorkloadParams({});
    const instance = buildStructuredWorkloadInstance(params);
    expect(agentInstanceConfigSchema.parse(instance)).toEqual(instance);
    expect(parseAcpGenericInstanceConfig(instance.config)).toMatchObject({
      binary: process.execPath,
      args: [STRUCTURED_WORKLOAD_FIXTURE_PATH],
    });

    const seed = buildStructuredWorkloadOfflineSeed({ instance });
    expect(seed.agentInstances[instance.id]).toEqual(instance);

    // On-disk acp-generic instances survive a renderer-originated settings write.
    const preserved = mergeManagedSharedSettings(seed, { ...seed, agentInstances: {} });
    expect(preserved.agentInstances[instance.id]).toBeDefined();

    // An incoming acp-generic instance is still filtered: the guard stays intact.
    const incoming = buildStructuredWorkloadOfflineSeed({
      instance: buildStructuredWorkloadInstance(params, "structured-load-incoming"),
    });
    const filtered = mergeManagedSharedSettings(normalizeSharedSettings({}), incoming);
    expect(filtered.agentInstances["structured-load-incoming"]).toBeUndefined();
  });
});

function stubCdp(
  invokeProcedure: (procedure: string, payload?: unknown) => Promise<unknown>,
): ManagedCdpClient {
  return { invokeProcedure } as unknown as ManagedCdpClient;
}

describe("structured workload managed-cell integration", () => {
  it("seeds the isolated profile settings before host start and reads the instance back", async () => {
    const root = await makeRoot();
    const settingsPath = structuredWorkloadSettingsPath(root);
    expect(settingsPath).toBe(join(root, "data", "settings.json"));

    const params = resolveStructuredWorkloadParams({});
    const instance = buildStructuredWorkloadInstance(params);
    writeStructuredWorkloadSettingsSeed({ settingsPath, instance });
    expect(readSeededStructuredWorkloadInstance({ settingsPath, instanceId: instance.id })).toEqual(
      instance,
    );

    expect(() =>
      readSeededStructuredWorkloadInstance({ settingsPath, instanceId: "absent" }),
    ).toThrow("is absent from");
    expect(() =>
      readSeededStructuredWorkloadInstance({
        settingsPath: join(root, "missing", "settings.json"),
        instanceId: instance.id,
      }),
    ).toThrow("is unreadable at");
  });

  it("prepares absolute marker paths under the session root", async () => {
    const root = await makeRoot();
    const markers = prepareStructuredWorkloadMarkers(root);
    expect(existsSync(markers.directory)).toBe(true);
    expect(markers.readyMarkerPath.startsWith(root)).toBe(true);
    writeFileSync(markers.cancelMarkerPath, "1");
    expect(readStructuredWorkloadMarker(markers.cancelMarkerPath)).toBe("1");
    expect(readStructuredWorkloadMarker(join(root, "absent.marker"))).toBeNull();
  });

  it("builds a schema-valid structured producer row for the seeded catalog", () => {
    const row = buildStructuredWorkloadThreadRow({
      projectId: "smoke-project",
      threadId: "v2q-slw-01",
      instanceId: "structured-load-fixture",
      now: "2026-09-20T00:00:00.000Z",
    });
    const parsed = persistedThreadSchema.parse(row);
    expect(parsed.agentKind).toBe("acp-generic:structured-load-fixture");
    expect(parsed.agentInstanceId).toBe("structured-load-fixture");
    expect(parsed.presentationMode).toBe("gui");
    expect(parsed.status).toBe("inactive");
    expect(parsed.canResumeWithConfig).toBe(false);
  });

  it("launches and stops the fixture through the production supervisor procedures", async () => {
    const calls: Array<{ procedure: string; payload: unknown }> = [];
    const cdp = stubCdp(async (procedure, payload) => {
      calls.push({ procedure, payload });
      return { threadId: "v2q-slw-01" };
    });
    const spec = {
      instanceId: "structured-load-fixture",
      threadId: "v2q-slw-01",
      prompt: "probe",
      minCanonicalFrames: 1,
      params: {},
    } as const;

    const launch = await launchStructuredWorkloadThread({
      cdp,
      projectLocation: { kind: "posix", path: "/tmp/v2q-project" },
      spec,
    });
    expect(launch.threadId).toBe("v2q-slw-01");
    expect(calls[0]?.procedure).toBe("startThread");
    const start = startThreadPayloadSchema.parse(calls[0]?.payload);
    expect(start).toMatchObject({
      threadId: "v2q-slw-01",
      agentKind: "acp-generic:structured-load-fixture",
      agentInstanceId: "structured-load-fixture",
      prompt: "probe",
      presentationMode: "gui",
      projectLocation: { kind: "posix", path: "/tmp/v2q-project" },
    });
    expect(start.initialSize).toEqual(DEFAULT_TERMINAL_SIZE);

    await interruptStructuredWorkloadThread({ cdp, threadId: spec.threadId });
    expect(interruptThreadPayloadSchema.parse(calls[1]?.payload)).toEqual({
      threadId: "v2q-slw-01",
    });
    await closeStructuredWorkloadThread({ cdp, threadId: spec.threadId });
    expect(closeThreadPayloadSchema.parse(calls[2]?.payload)).toEqual({
      threadId: "v2q-slw-01",
    });
  });

  it("seeds the producer row through the bridge with a schema-valid thread", async () => {
    const calls: Array<{ procedure: string; payload: unknown }> = [];
    const cdp = stubCdp(async (procedure, payload) => {
      calls.push({ procedure, payload });
    });
    const row = buildStructuredWorkloadThreadRow({
      projectId: "smoke-project",
      threadId: "v2q-slw-01",
      instanceId: "structured-load-fixture",
    });
    await seedStructuredWorkloadThreadRow({ cdp, row });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.procedure).toBe("dbUpsertThread");
    expect(persistedThreadSchema.parse(calls[0]?.payload).id).toBe("v2q-slw-01");
  });

  it("counts only canonical GUI events attributed to the producer thread, including batches", () => {
    const events = [
      {
        type: "thread-runtime-events-multi",
        event: {
          type: "thread-runtime-events-multi",
          batches: [
            {
              threadId: "v2q-slw-01",
              events: [
                { type: "content.delta", threadId: "v2q-slw-01", stream: "assistant_text" },
                { type: "item.started", threadId: "v2q-slw-01", itemType: "assistant_message" },
              ],
            },
            {
              threadId: "v2q-chat-01",
              events: [{ type: "content.delta", threadId: "v2q-chat-01" }],
            },
          ],
        },
      },
      {
        type: "thread-runtime-event",
        event: {
          type: "thread-runtime-event",
          event: { type: "item.completed", threadId: "v2q-slw-01" },
        },
      },
      {
        type: "terminal-output",
        event: { type: "terminal-output", id: "v2q-slw-01", data: "tick" },
      },
      {
        type: "thread-runtime-events",
        event: {
          type: "thread-runtime-events",
          threadId: "v2q-slw-01",
          events: [{ type: "turn.started" }, { type: "turn.completed" }],
        },
      },
    ];
    const counts = canonicalGuiEventCounts(events, "v2q-slw-01");
    expect(counts.total).toBe(3);
    expect(counts.byType).toEqual({
      "content.delta": 1,
      "item.started": 1,
      "item.completed": 1,
    });

    const evidence = collectCanonicalGuiFrameEvidence(
      [
        { label: "v2q-c01", receivedEvents: () => events },
        { label: "legacy", receivedEvents: () => [] },
      ],
      "v2q-slw-01",
    );
    expect(evidence.total).toBe(3);
    expect(evidence.sources).toEqual([
      {
        label: "v2q-c01",
        total: 3,
        byType: { "content.delta": 1, "item.started": 1, "item.completed": 1 },
      },
      { label: "legacy", total: 0, byType: {} },
    ]);
  });

  it("fails the canonical-frame gate with a distinct no-fake-load error", async () => {
    await expect(
      waitForCanonicalGuiFrames({
        sources: [{ label: "v2q-c01", receivedEvents: () => [] }],
        threadId: "v2q-slw-01",
        minTotal: 1,
        label: "unit",
        timeoutMs: 150,
      }),
    ).rejects.toThrow("PTY terminal frames do not count as structured load");
  });

  it("joins the fixture child and refuses a still-alive pid", async () => {
    let checks = 0;
    const joined = await waitForStructuredWorkloadExit({
      pid: 4242,
      timeoutMs: 2_000,
      isAlive: () => {
        checks += 1;
        return checks < 3;
      },
    });
    expect(joined).toMatchObject({ pid: 4242, exited: true });
    expect(checks).toBe(3);

    await expect(
      waitForStructuredWorkloadExit({ pid: 4242, timeoutMs: 150, isAlive: () => true }),
    ).rejects.toThrow("did not exit within 150ms");
  });
});

describe("authoritative wire status and pid wait", () => {
  const wireSource = (
    label: string,
    events: ReadonlyArray<{ type: string; event: Record<string, unknown> }>,
  ) => ({ label, receivedEvents: () => events });

  it("collects thread-state frames for the interested thread and ignores others", async () => {
    const source = wireSource("v2q-c01", [
      { type: "thread-state", event: { threadId: "v2q-slw-01", status: "launching" } },
      { type: "thread-state", event: { threadId: "other", status: "working" } },
      { type: "thread-state", event: { threadId: "v2q-slw-01", status: "working" } },
      { type: "content.delta", event: { threadId: "v2q-slw-01", delta: "x" } },
    ]);
    const waited = await waitForStructuredWorkloadWireStatus({
      sources: [source],
      threadId: "v2q-slw-01",
      label: "working",
      accept: (status) => status.status === "working",
      timeoutMs: 500,
    });
    expect(waited.accepted).toMatchObject({
      present: true,
      status: "working",
      eventCount: 2,
      observed: ["launching/null", "working/null"],
      sourceLabels: ["v2q-c01"],
    });
  });

  it("fails with the last wire state when the status never arrives", async () => {
    const source = wireSource("v2q-c01", []);
    await expect(
      waitForStructuredWorkloadWireStatus({
        sources: [source],
        threadId: "v2q-slw-01",
        label: "working",
        accept: (status) => status.status === "working",
        timeoutMs: 150,
      }),
    ).rejects.toThrow("did not reach wire status working");
  });

  it("waits for a valid ready-marker pid and rejects a marker with no pid", async () => {
    let reads = 0;
    const pid = await waitForStructuredWorkloadPid({
      markerPath: "/tmp/unused.marker",
      timeoutMs: 1_000,
      readMarker: () => {
        reads += 1;
        return reads < 3 ? "" : "4242";
      },
    });
    expect(pid).toBe(4242);
    expect(reads).toBe(3);
    await expect(
      waitForStructuredWorkloadPid({
        markerPath: "/tmp/unused.marker",
        timeoutMs: 150,
        readMarker: () => "not-a-pid",
      }),
    ).rejects.toThrow("carried no pid");
  });
});
