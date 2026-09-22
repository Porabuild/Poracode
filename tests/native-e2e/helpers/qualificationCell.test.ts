import { describe, expect, it } from "vitest";
import { startShellPayloadSchema, writeTerminalPayloadSchema } from "@/shared/contracts/thread.ts";
import type { Thread } from "@/shared/contracts";
import {
  dbReplaceRuntimeSnapshotPayloadSchema,
  persistedRuntimeItemSchema,
  persistedThreadSchema,
  readThreadPayloadSchema,
} from "@/shared/ipc/schemas.ts";
import type { ManagedCdpClient } from "./managedAppSession.ts";
import {
  buildFixtureThreads,
  buildPaneSetupScript,
  buildProducerStreams,
  diagnoseProducerFailure,
  parseQualificationCellSpec,
  producerCommand,
  seedQualificationFixture,
  startProducerStreams,
  verifyProducerStreams,
  waitForFixtureThreadsInStore,
  waitForNaturalBoot,
  waitForVisiblePanes,
} from "./qualificationCell.ts";

/**
 * Qualification fixture unit tests.
 *
 * The fixture drives the app's own procedure bridge; these tests pin the cell
 * spec parser, the synthetic stream shapes, the generated pane-setup script,
 * and — critically — that every fixture procedure payload still validates
 * against the production schemas the bridge uses.
 */

function stubCdp(
  invokeProcedure: (procedure: string, payload?: unknown) => Promise<unknown>,
): ManagedCdpClient {
  return { invokeProcedure } as unknown as ManagedCdpClient;
}

describe("parseQualificationCellSpec", () => {
  it("is absent without V2Q_CELL_SPEC and rejects a spec without id/label", () => {
    expect(parseQualificationCellSpec({})).toBeNull();
    expect(() => parseQualificationCellSpec({ V2Q_CELL_SPEC: '{"id":"A0-1"}' })).toThrow(
      "must carry string id and label",
    );
  });

  it("applies the documented defaults for every omitted field", () => {
    const spec = parseQualificationCellSpec({
      V2Q_CELL_SPEC: JSON.stringify({ id: "A0-1", label: "sanity" }),
    });
    expect(spec).toEqual({
      id: "A0-1",
      label: "sanity",
      producers: 8,
      clients: 1,
      legacyClient: false,
      slowClient: false,
      reconnectClient: false,
      visibleChatPanes: 2,
      terminalSurface: "pane",
      visibleTerminal: true,
      catalogThreads: 0,
      durationMs: 120_000,
      protocol: "idle",
      assertBudgets: false,
      trustedInput: null,
      structuredWorkload: null,
    });
  });

  it("defaults an explicit panel terminal surface and derives visibleTerminal from it", () => {
    const panel = parseQualificationCellSpec({
      V2Q_CELL_SPEC: JSON.stringify({
        id: "A0-panel",
        label: "panel terminal",
        visibleTerminal: false,
        terminalSurface: "panel",
      }),
    });
    expect(panel).toMatchObject({ terminalSurface: "panel", visibleTerminal: true });
    const none = parseQualificationCellSpec({
      V2Q_CELL_SPEC: JSON.stringify({
        id: "A0-none",
        label: "no terminal",
        terminalSurface: "none",
      }),
    });
    expect(none).toMatchObject({ terminalSurface: "none", visibleTerminal: false });
    const pane = parseQualificationCellSpec({
      V2Q_CELL_SPEC: JSON.stringify({
        id: "A0-pane",
        label: "pane terminal",
        terminalSurface: "pane",
      }),
    });
    expect(pane).toMatchObject({ terminalSurface: "pane", visibleTerminal: true });
  });

  it("honors an explicit zero-producer / zero-client observer preflight cell", () => {
    const spec = parseQualificationCellSpec({
      V2Q_CELL_SPEC: JSON.stringify({
        id: "A0-preflight",
        label: "observer-preflight",
        producers: 0,
        clients: 0,
        visibleChatPanes: 1,
        visibleTerminal: false,
        durationMs: 30_000,
        protocol: "longtask",
      }),
    });
    expect(spec).toMatchObject({ producers: 0, clients: 0, protocol: "longtask" });
  });

  it("parses the structured-workload block with defaults and explicit params", () => {
    const defaults = parseQualificationCellSpec({
      V2Q_CELL_SPEC: JSON.stringify({
        id: "A0-slw",
        label: "structured",
        structuredWorkload: {},
      }),
    });
    expect(defaults?.structuredWorkload).toEqual({
      instanceId: "structured-load-fixture",
      threadId: "v2q-slw-01",
      prompt: "v2q structured workload",
      minCanonicalFrames: 25,
      params: {},
    });
    const explicit = parseQualificationCellSpec({
      V2Q_CELL_SPEC: JSON.stringify({
        id: "A0-slw",
        label: "structured",
        structuredWorkload: {
          instanceId: "slw-custom",
          threadId: "v2q-slw-99",
          prompt: "custom",
          minCanonicalFrames: 4,
          params: { ratePerSec: 40, textChunks: 64 },
        },
      }),
    });
    expect(explicit?.structuredWorkload).toMatchObject({
      instanceId: "slw-custom",
      threadId: "v2q-slw-99",
      prompt: "custom",
      minCanonicalFrames: 4,
      params: { ratePerSec: 40, textChunks: 64 },
    });
    expect(() =>
      parseQualificationCellSpec({
        V2Q_CELL_SPEC: JSON.stringify({
          id: "A0-slw",
          label: "structured",
          structuredWorkload: "yes",
        }),
      }),
    ).toThrow("structuredWorkload must be an object");
    expect(() =>
      parseQualificationCellSpec({
        V2Q_CELL_SPEC: JSON.stringify({
          id: "A0-slw",
          label: "structured",
          structuredWorkload: { params: [] },
        }),
      }),
    ).toThrow("structuredWorkload.params must be an object");
  });

  it("parses the trusted-input protocol overrides and rejects invalid values", () => {
    const spec = parseQualificationCellSpec({
      V2Q_CELL_SPEC: JSON.stringify({
        id: "A0-8",
        label: "input",
        protocol: "longtask",
        trustedInput: { idleClicks: 20, blockedCycles: 3, blockMs: 250 },
      }),
    });
    expect(spec?.trustedInput).toEqual({ idleClicks: 20, blockedCycles: 3, blockMs: 250 });
    expect(
      parseQualificationCellSpec({
        V2Q_CELL_SPEC: JSON.stringify({ id: "A0-8", label: "input" }),
      })?.trustedInput,
    ).toBeNull();
    expect(() =>
      parseQualificationCellSpec({
        V2Q_CELL_SPEC: JSON.stringify({
          id: "A0-8",
          label: "input",
          trustedInput: { blockMs: -1 },
        }),
      }),
    ).toThrow("trustedInput.blockMs must be a non-negative integer");
    expect(() =>
      parseQualificationCellSpec({
        V2Q_CELL_SPEC: JSON.stringify({ id: "A0-8", label: "input", trustedInput: [] }),
      }),
    ).toThrow("trustedInput must be an object");
  });

  it("keeps explicit values, falls back on invalid numbers, and normalizes the protocol", () => {
    const spec = parseQualificationCellSpec({
      V2Q_CELL_SPEC: JSON.stringify({
        id: "A0-8",
        label: "input",
        producers: 64,
        clients: 8,
        legacyClient: true,
        slowClient: true,
        reconnectClient: true,
        visibleChatPanes: 1,
        visibleTerminal: false,
        catalogThreads: 10_000,
        durationMs: 180_000,
        protocol: "longtask",
        assertBudgets: true,
      }),
    });
    expect(spec).toMatchObject({
      producers: 64,
      clients: 8,
      legacyClient: true,
      slowClient: true,
      reconnectClient: true,
      visibleChatPanes: 1,
      visibleTerminal: false,
      catalogThreads: 10_000,
      durationMs: 180_000,
      protocol: "longtask",
      assertBudgets: true,
    });
    const invalid = parseQualificationCellSpec({
      V2Q_CELL_SPEC: JSON.stringify({
        id: "A0-x",
        label: "x",
        producers: -4,
        clients: 0.5,
        durationMs: "soon",
        protocol: "overload",
      }),
    });
    expect(invalid).toMatchObject({
      producers: 8,
      clients: 1,
      durationMs: 120_000,
      protocol: "idle",
    });
  });
});

describe("producer stream shapes", () => {
  it("numbers streams and binds only the first to the visible terminal", () => {
    const streams = buildProducerStreams(3, { firstShellId: "v2q-term-01" });
    expect(streams.map((stream) => stream.shellId)).toEqual([
      "v2q-term-01",
      "v2q-prod-02",
      "v2q-prod-03",
    ]);
    expect(buildProducerStreams(2).map((stream) => stream.shellId)).toEqual([
      "v2q-prod-01",
      "v2q-prod-02",
    ]);
  });

  it("runs a fork-free loop whose tick line is long enough to be bulk traffic", () => {
    const stream = buildProducerStreams(1)[0]!;
    const command = producerCommand(stream);
    expect(stream.linesPerSecond).toBe(20);
    // The loop is wrapped in an explicit real zsh so the session's login shell
    // (fish on the reference machine) only has to execute one quoted command.
    expect(command).toBe(
      `/bin/zsh -c 'while true; do echo "${stream.tickLine}"; sleep 0.05; done'\r`,
    );
    expect(command.endsWith("\r")).toBe(true);
    expect(stream.tickLine.length).toBeGreaterThan(64);
  });
});

describe("buildPaneSetupScript", () => {
  it("opens the first chat pane, splits the rest, and adds the terminal pane", () => {
    const script = buildPaneSetupScript({
      chatThreadIds: ["v2q-chat-01", "v2q-chat-02"],
      terminalThreadId: "v2q-term-01",
    });
    expect(script).toContain(`openThread("v2q-chat-01")`);
    // The additional chat panes travel as a data array and are split in a loop.
    expect(script).toContain(`for (const threadId of ["v2q-chat-02"])`);
    expect(script).toContain(`splitPaneById("v2q-term-01"`);
    expect(script).toContain("state.view.panes.length === 3");
    expect(() => new Function(script)).not.toThrow();
  });

  it("omits the terminal split when the cell has no visible terminal", () => {
    const script = buildPaneSetupScript({
      chatThreadIds: ["v2q-chat-01"],
      terminalThreadId: null,
    });
    expect(script).toContain("for (const threadId of [])");
    expect(script).not.toContain(`"bottom"`);
    expect(script).not.toContain("v2q-term-01");
    expect(script).toContain("state.view.panes.length === 1");
    expect(() => new Function(script)).not.toThrow();
  });
});

describe("startProducerStreams procedure payloads", () => {
  it("sends schema-valid startShell and writeTerminal payloads in two phases", async () => {
    const calls: Array<{ procedure: string; payload: unknown }> = [];
    const cdp = stubCdp(async (procedure, payload) => {
      calls.push({ procedure, payload });
    });
    const projectLocation = { kind: "posix", path: "/tmp/v2q-project" } as const;
    const streams = buildProducerStreams(2, { firstShellId: "v2q-term-01" });
    await startProducerStreams({ cdp, projectLocation, streams, settleMs: 0 });

    expect(calls.map((call) => call.procedure)).toEqual([
      "startShell",
      "startShell",
      "writeTerminal",
      "writeTerminal",
    ]);
    const firstStart = startShellPayloadSchema.parse(calls[0]?.payload);
    expect(firstStart).toEqual({
      shellId: "v2q-term-01",
      projectLocation,
      initialSize: { cols: 120, rows: 30 },
    });
    const secondStart = startShellPayloadSchema.parse(calls[1]?.payload);
    expect(secondStart.shellId).toBe("v2q-prod-02");
    for (const call of calls.slice(2)) {
      const write = writeTerminalPayloadSchema.parse(call.payload);
      expect(write.data).toBe(producerCommand(streams.find((s) => s.shellId === write.threadId)!));
    }
  });

  it("is a no-op for a producer-free observer preflight cell", async () => {
    const calls: string[] = [];
    const cdp = stubCdp(async (procedure) => {
      calls.push(procedure);
    });
    await startProducerStreams({
      cdp,
      projectLocation: { kind: "posix", path: "/tmp/v2q-project" },
      streams: [],
      settleMs: 0,
    });
    expect(calls).toEqual([]);
    const verification = await verifyProducerStreams({ cdp, streams: [], settleMs: 0 });
    expect(verification).toEqual({ verified: 0, samples: [] });
  });
});

describe("verifyProducerStreams", () => {
  it("verifies only streams with more than five observed ticks and reports binding evidence", async () => {
    const lines: Record<string, string> = {
      "v2q-prod-01": "v2q-prod-01-tick\n".repeat(6),
      "v2q-prod-02": "v2q-prod-02-tick\n".repeat(2),
    };
    const cdp = stubCdp(async (procedure, payload) => {
      expect(procedure).toBe("readTerminalSnapshot");
      const parsed = readThreadPayloadSchema.parse(payload);
      const { threadId } = parsed;
      return {
        data: lines[threadId] ?? "",
        processState: "running",
        generation: `gen-${threadId}`,
        fromCursor: 0,
        toCursor: (lines[threadId] ?? "").length,
      };
    });
    const result = await verifyProducerStreams({
      cdp,
      streams: buildProducerStreams(2),
      settleMs: 0,
    });
    expect(result.verified).toBe(1);
    expect(result.samples[0]).toMatchObject({
      shellId: "v2q-prod-01",
      ticks: 6,
      processState: "running",
      sampleBytes: lines["v2q-prod-01"]!.length,
      generation: "gen-v2q-prod-01",
      tickPresent: true,
    });
    expect(result.samples[1]).toMatchObject({
      shellId: "v2q-prod-02",
      ticks: 2,
      processState: "running",
      sampleBytes: lines["v2q-prod-02"]!.length,
      tickPresent: true,
    });
  });

  it("treats a null snapshot as no output instead of throwing", async () => {
    const cdp = stubCdp(async () => null);
    const result = await verifyProducerStreams({
      cdp,
      streams: buildProducerStreams(1),
      settleMs: 0,
    });
    expect(result.verified).toBe(0);
    expect(result.samples[0]).toMatchObject({
      ticks: 0,
      processState: null,
      sampleBytes: 0,
      generation: null,
      tickPresent: false,
    });
  });
});

describe("diagnoseProducerFailure", () => {
  const stream = buildProducerStreams(1)[0]!;
  const baseStart = {
    shellId: stream.shellId,
    startShellResult: null,
    startShellError: null,
    shellBound: true,
    boundAfterMs: 10,
    bindingBefore: {
      shellId: stream.shellId,
      generation: "gen-1",
      fromCursor: 0,
      toCursor: 100,
      processState: "running",
      dataBytes: 100,
      tickCount: 0,
      tailPreview: "prompt",
    },
    writeAtMs: 20,
    writeResult: null,
    writeError: null,
    echoObserved: true,
    bindingAfterWrite: null,
    bindingProbeError: null,
  } as const;

  it("names a replaced PTY generation, a missing echo, and low ticks distinctly", () => {
    const verification = {
      verified: 0,
      samples: [
        {
          shellId: stream.shellId,
          ticks: 0,
          processState: "running",
          sampleBytes: 200,
          generation: "gen-2",
          fromCursor: 0,
          toCursor: 200,
          tickPresent: false,
          lastTickIndex: null,
          tailPreview: "prompt",
        },
      ],
    };
    const replaced = diagnoseProducerFailure({
      start: [
        {
          ...baseStart,
          bindingAfterWrite: { ...baseStart.bindingBefore, generation: "gen-2", toCursor: 200 },
        },
      ],
      verification,
      expected: 1,
    });
    expect(replaced).toContain("PTY generation changed after the write");

    const noEcho = diagnoseProducerFailure({
      start: [{ ...baseStart, echoObserved: false }],
      verification,
      expected: 1,
    });
    expect(noEcho).toContain("write was never echoed");

    const lowTicks = diagnoseProducerFailure({
      start: [{ ...baseStart }],
      verification,
      expected: 1,
    });
    expect(lowTicks).toContain("echo observed but only 0 ticks");
  });

  it("reports refused startShell/writeTerminal calls", () => {
    const verification = { verified: 0, samples: [] };
    const diagnosis = diagnoseProducerFailure({
      start: [
        { ...baseStart, startShellError: "spawn failed", shellBound: false },
        { ...baseStart, writeError: "Unknown thread session" },
      ],
      verification,
      expected: 2,
    });
    expect(diagnosis).toContain("startShell refused (spawn failed)");
    expect(diagnosis).toContain("writeTerminal refused (Unknown thread session)");
  });
});

describe("buildFixtureThreads", () => {
  const spec = parseQualificationCellSpec({
    V2Q_CELL_SPEC: JSON.stringify({
      id: "A0-preflight",
      label: "preflight",
      visibleChatPanes: 2,
      visibleTerminal: true,
    }),
  })!;

  it("builds schema-valid inactive chat + terminal rows with fixed transcripts", () => {
    const rows = buildFixtureThreads({
      projectId: "smoke-project",
      spec,
      now: "2026-09-20T00:00:00.000Z",
    });
    expect(rows.map((row) => row.thread.id)).toEqual(["v2q-chat-01", "v2q-chat-02", "v2q-term-01"]);
    expect(rows.map((row) => row.thread.presentationMode)).toEqual(["gui", "gui", "terminal"]);
    for (const row of rows) {
      const parsed = persistedThreadSchema.parse(row.thread);
      expect(parsed.status).toBe("inactive");
      expect(parsed.projectId).toBe("smoke-project");
      expect(parsed.archived).toBe(false);
      for (const item of row.items ?? []) persistedRuntimeItemSchema.parse(item);
    }
    expect(rows[0]?.items).toHaveLength(40);
    expect(rows[0]?.turns?.[0]?.anchorItemId).toBe("v2q-item-01-009");
    expect(rows[2]?.items).toBeUndefined();
  });

  it("appends the structured producer row, which consumes a declared visible pane", () => {
    const rows = buildFixtureThreads({
      projectId: "smoke-project",
      spec,
      structuredWorkload: { threadId: "v2q-slw-01", instanceId: "structured-load-fixture" },
      now: "2026-09-20T00:00:00.000Z",
    });
    // visibleChatPanes=2 with a structured producer: one regular chat pane
    // plus the producer pane; the terminal row stays separate.
    expect(rows.map((row) => row.thread.id)).toEqual(["v2q-chat-01", "v2q-term-01", "v2q-slw-01"]);
    const structured = persistedThreadSchema.parse(rows[2]?.thread);
    expect(structured.agentKind).toBe("acp-generic:structured-load-fixture");
    expect(structured.agentInstanceId).toBe("structured-load-fixture");
    expect(structured.presentationMode).toBe("gui");
    expect(structured.status).toBe("inactive");
    expect(rows[2]?.items).toBeUndefined();
  });
});

describe("seedQualificationFixture over the host bridge", () => {
  const spec = parseQualificationCellSpec({
    V2Q_CELL_SPEC: JSON.stringify({
      id: "A0-preflight",
      label: "preflight",
      visibleChatPanes: 2,
      visibleTerminal: true,
    }),
  })!;
  const singleChatSpec = parseQualificationCellSpec({
    V2Q_CELL_SPEC: JSON.stringify({
      id: "A0-preflight",
      label: "preflight",
      visibleChatPanes: 1,
      visibleTerminal: true,
    }),
  })!;

  it("writes through the authenticated bridge and verifies host read-back", async () => {
    const calls: Array<{ procedure: string; payload: unknown }> = [];
    const stored = new Map<string, Thread>();
    const itemsByThread = new Map<string, unknown[]>();
    const cdp = stubCdp(async (procedure, payload) => {
      calls.push({ procedure, payload });
      switch (procedure) {
        case "dbGetProjects":
          return [{ id: "smoke-project", location: { kind: "posix", path: "/tmp/v2q-project" } }];
        case "dbUpsertThread": {
          const thread = persistedThreadSchema.parse(payload);
          stored.set(thread.id, thread);
          return undefined;
        }
        case "dbReplaceThreadRuntimeSnapshot": {
          const parsed = dbReplaceRuntimeSnapshotPayloadSchema.parse(payload);
          for (const item of parsed.items) persistedRuntimeItemSchema.parse(item);
          itemsByThread.set(parsed.threadId, [...parsed.items]);
          return undefined;
        }
        case "dbGetThreadsPage":
          return { threads: [...stored.values()], nextCursor: null };
        case "dbGetThreadRuntimeItems": {
          // Positional procedure: the raw thread id is the argument.
          const threadId = readThreadPayloadSchema.parse({ threadId: payload }).threadId;
          return itemsByThread.get(threadId) ?? [];
        }
        default:
          throw new Error(`unexpected procedure ${procedure}`);
      }
    });

    const fixture = await seedQualificationFixture({ cdp, spec });
    expect(fixture.projectLocation).toEqual({ kind: "posix", path: "/tmp/v2q-project" });
    expect(fixture.chatThreadIds).toEqual(["v2q-chat-01", "v2q-chat-02"]);
    expect(fixture.paneThreadIds).toEqual(["v2q-chat-01", "v2q-chat-02"]);
    expect(fixture.terminalThreadId).toBe("v2q-term-01");
    expect(fixture.projectSelection).toEqual({
      mode: "fallback-first-project",
      expectedProjectDir: null,
      projectCount: 1,
      selectedProjectId: "smoke-project",
      selectedPath: "/tmp/v2q-project",
    });
    expect(fixture.hostReadBack.threadIds).toEqual(["v2q-chat-01", "v2q-chat-02", "v2q-term-01"]);
    expect(fixture.hostReadBack.statuses).toEqual({
      "v2q-chat-01": "inactive",
      "v2q-chat-02": "inactive",
      "v2q-term-01": "inactive",
    });
    expect(fixture.hostReadBack.runtimeItemCounts).toEqual({
      "v2q-chat-01": 0,
      "v2q-chat-02": 0,
    });
    expect(fixture.historySeeding).toBe("unavailable-host-owned");
    expect(calls.map((call) => call.procedure)).toEqual([
      "dbGetProjects",
      "dbUpsertThread",
      "dbUpsertThread",
      "dbUpsertThread",
      "dbGetThreadsPage",
      "dbGetThreadRuntimeItems",
      "dbGetThreadRuntimeItems",
    ]);
    // The host refuses wholesale runtime replaces; the fixture must never try.
    expect(calls.map((call) => call.procedure)).not.toContain("dbReplaceThreadRuntimeSnapshot");
  });

  it("fails when the host does not read a seeded thread back", async () => {
    const cdp = stubCdp(async (procedure) => {
      if (procedure === "dbGetProjects") {
        return [{ id: "smoke-project", location: { kind: "posix", path: "/tmp/p" } }];
      }
      if (procedure === "dbGetThreadsPage") return { threads: [], nextCursor: null };
      if (procedure === "dbGetThreadRuntimeItems") return [];
      return undefined;
    });
    await expect(seedQualificationFixture({ cdp, spec: singleChatSpec })).rejects.toThrow(
      "host did not return seeded fixture threads",
    );
  });

  it("seeds the structured producer as a declared visible pane, preserving the pane count", async () => {
    const calls: Array<{ procedure: string; payload: unknown }> = [];
    const stored = new Map<string, Thread>();
    const cdp = stubCdp(async (procedure, payload) => {
      calls.push({ procedure, payload });
      switch (procedure) {
        case "dbGetProjects":
          return [{ id: "smoke-project", location: { kind: "posix", path: "/tmp/v2q-project" } }];
        case "dbUpsertThread": {
          const thread = persistedThreadSchema.parse(payload);
          stored.set(thread.id, thread);
          return undefined;
        }
        case "dbGetThreadsPage":
          return { threads: [...stored.values()], nextCursor: null };
        case "dbGetThreadRuntimeItems":
          return [];
        default:
          throw new Error(`unexpected procedure ${procedure}`);
      }
    });
    const fixture = await seedQualificationFixture({
      cdp,
      spec,
      structuredWorkload: { threadId: "v2q-slw-01", instanceId: "structured-load-fixture" },
    });
    // visibleChatPanes=2 includes the producer pane: one regular chat + producer.
    expect(fixture.chatThreadIds).toEqual(["v2q-chat-01"]);
    expect(fixture.paneThreadIds).toEqual(["v2q-chat-01", "v2q-slw-01"]);
    expect(fixture.structuredThreadId).toBe("v2q-slw-01");
    expect(fixture.hostReadBack.threadIds).toContain("v2q-slw-01");
    expect(fixture.hostReadBack.runtimeItemCounts).toEqual({ "v2q-chat-01": 0 });
    expect(calls.filter((call) => call.procedure === "dbUpsertThread")).toHaveLength(3);
  });

  it("selects the launcher fixture project by path and refuses an unknown project dir", async () => {
    const stored = new Map<string, Thread>();
    const cdp = stubCdp(async (procedure, payload) => {
      switch (procedure) {
        case "dbGetProjects":
          return [
            { id: "__lightcode_home__", location: { kind: "posix", path: "/Users/example" } },
            { id: "fixture-project", location: { kind: "posix", path: "/tmp/session/project" } },
          ];
        case "dbUpsertThread": {
          const thread = persistedThreadSchema.parse(payload);
          stored.set(thread.id, thread);
          return undefined;
        }
        case "dbGetThreadsPage":
          return { threads: [...stored.values()], nextCursor: null };
        case "dbGetThreadRuntimeItems":
          return [];
        default:
          throw new Error(`unexpected procedure ${procedure}`);
      }
    });
    const fixture = await seedQualificationFixture({
      cdp,
      spec: singleChatSpec,
      expectedProjectDir: "/tmp/session/project",
    });
    expect(fixture.projectId).toBe("fixture-project");
    expect(fixture.projectSelection).toMatchObject({
      mode: "expected-project-dir",
      projectCount: 2,
      selectedProjectId: "fixture-project",
    });
    await expect(
      seedQualificationFixture({
        cdp,
        spec: singleChatSpec,
        expectedProjectDir: "/tmp/other/project",
      }),
    ).rejects.toThrow("refusing to seed the user's own project");
  });
});

describe("natural boot gate", () => {
  it("passes only with genuine hydration and no startup surface", async () => {
    let polls = 0;
    const cdp = {
      evaluate: async () => {
        polls += 1;
        const ready = polls >= 3;
        return {
          hydrated: ready,
          startupSurfaceVisible: !ready,
          recoveryVisible: !ready,
          threadCount: ready ? 3 : 0,
        };
      },
    } as unknown as ManagedCdpClient;
    const evidence = await waitForNaturalBoot({ cdp, timeoutMs: 3_000 });
    expect(evidence).toMatchObject({
      hydrated: true,
      startupSurfaceVisible: false,
      recoveryVisible: false,
      threadCount: 3,
    });
    expect(evidence.polls).toBe(3);
  });

  it("fails with a distinct message when hydration never completes", async () => {
    const cdp = {
      evaluate: async () => ({
        hydrated: false,
        startupSurfaceVisible: true,
        recoveryVisible: true,
        threadCount: 0,
      }),
    } as unknown as ManagedCdpClient;
    await expect(waitForNaturalBoot({ cdp, timeoutMs: 150 })).rejects.toThrow(
      "natural boot gate failed",
    );
    await expect(waitForNaturalBoot({ cdp, timeoutMs: 150 })).rejects.toThrow(
      "never forces hydration through a DEV persist-storage seam",
    );
  });

  it("does not accept hydration while the startup surface is still mounted", async () => {
    const cdp = {
      evaluate: async () => ({
        hydrated: true,
        startupSurfaceVisible: true,
        recoveryVisible: false,
        threadCount: 3,
      }),
    } as unknown as ManagedCdpClient;
    await expect(waitForNaturalBoot({ cdp, timeoutMs: 150 })).rejects.toThrow(
      "startupSurfaceVisible=true",
    );
  });

  it("reads the real hydration flag and never mutates persist storage", async () => {
    const expressions: string[] = [];
    const cdp = {
      evaluate: async (expression: string) => {
        expressions.push(expression);
        return {
          hydrated: true,
          startupSurfaceVisible: false,
          recoveryVisible: false,
          threadCount: 3,
        };
      },
    } as unknown as ManagedCdpClient;
    await waitForNaturalBoot({ cdp, timeoutMs: 1_000 });
    expect(expressions[0]).toContain("hasHydrated()");
    expect(expressions[0]).toContain("h-screen.w-screen");
    for (const expression of expressions) {
      expect(expression).not.toContain("setState");
      expect(expression).not.toContain("rehydrate");
      expect(expression).not.toContain("getOptions");
      expect(expression).not.toContain("storage");
    }
  });
});

describe("waitForFixtureThreadsInStore (read-only gate)", () => {
  const fixture = {
    projectId: "smoke-project",
    projectLocation: { kind: "posix", path: "/tmp/v2q-project" },
    chatThreadIds: ["v2q-chat-01", "v2q-chat-02"],
    paneThreadIds: ["v2q-chat-01", "v2q-chat-02", "v2q-slw-01"],
    terminalThreadId: "v2q-term-01",
    structuredThreadId: "v2q-slw-01",
    catalogThreadCount: 0,
    projectSelection: {
      mode: "fallback-first-project",
      expectedProjectDir: null,
      projectCount: 1,
      selectedProjectId: "smoke-project",
      selectedPath: "/tmp/v2q-project",
    },
    historySeeding: "unavailable-host-owned",
    hostReadBack: {
      projectId: "smoke-project",
      threadIds: ["v2q-chat-01", "v2q-chat-02", "v2q-term-01", "v2q-slw-01"],
      statuses: {
        "v2q-chat-01": "inactive",
        "v2q-chat-02": "inactive",
        "v2q-term-01": "inactive",
        "v2q-slw-01": "inactive",
      },
      runtimeItemCounts: { "v2q-chat-01": 0, "v2q-chat-02": 0 },
      pagesScanned: 1,
    },
  } as const;

  it("passes once every seeded id (including the structured producer) is in the hydrated store", async () => {
    let polls = 0;
    const cdp = {
      evaluate: async () => {
        polls += 1;
        const missing = polls >= 2 ? [] : ["v2q-slw-01"];
        return { hydrated: polls >= 2, missing };
      },
    } as unknown as ManagedCdpClient;
    const evidence = await waitForFixtureThreadsInStore({ cdp, fixture, timeoutMs: 2_000 });
    expect(evidence).toMatchObject({
      mode: "app-store-hydration",
      primedByHostReadBack: false,
      hydrated: true,
      missingAtFirstPoll: ["v2q-slw-01"],
    });
    expect(evidence.threadIds).toEqual(["v2q-chat-01", "v2q-chat-02", "v2q-term-01", "v2q-slw-01"]);
  });

  it("fails on timeout and never installs rows or touches persist storage", async () => {
    const expressions: string[] = [];
    const procedures: string[] = [];
    const cdp = {
      evaluate: async (expression: string) => {
        expressions.push(expression);
        return { hydrated: false, missing: ["v2q-chat-01"] };
      },
      invokeProcedure: async (procedure: string) => {
        procedures.push(procedure);
      },
    } as unknown as ManagedCdpClient;
    await expect(waitForFixtureThreadsInStore({ cdp, fixture, timeoutMs: 150 })).rejects.toThrow(
      "does not install fixture rows through the DEV store",
    );
    expect(procedures).toEqual([]);
    for (const expression of expressions) {
      expect(expression).not.toContain("setState");
      expect(expression).not.toContain("rehydrate");
      expect(expression).not.toContain("getOptions");
      expect(expression).not.toContain("storage");
    }
  });
});

describe("waitForVisiblePanes", () => {
  const spec = parseQualificationCellSpec({
    V2Q_CELL_SPEC: JSON.stringify({
      id: "A0-preflight",
      label: "preflight",
      visibleChatPanes: 2,
      visibleTerminal: true,
    }),
  })!;

  it("polls until the DOM shows the composer and terminal surfaces", async () => {
    let polls = 0;
    const cdp = {
      evaluate: async () => {
        polls += 1;
        const ready = polls >= 3;
        return {
          viewKind: "thread",
          panes: ["v2q-chat-01", "v2q-chat-02", "v2q-term-01"],
          paneThreadsPresent: [true, true, true],
          titlesVisible: [],
          xtermCount: ready ? 1 : 0,
          composerCount: ready ? 2 : 0,
        };
      },
    } as unknown as ManagedCdpClient;
    const result = await waitForVisiblePanes({ cdp, spec, timeoutMs: 3_000 });
    expect(result.composerCount).toBe(2);
    expect(result.xtermCount).toBe(1);
    expect(polls).toBe(3);
  });

  it("returns the last observation at the deadline instead of throwing", async () => {
    const cdp = {
      evaluate: async () => ({
        viewKind: "thread",
        panes: ["v2q-chat-01"],
        paneThreadsPresent: [true],
        titlesVisible: [],
        xtermCount: 0,
        composerCount: 0,
      }),
    } as unknown as ManagedCdpClient;
    const result = await waitForVisiblePanes({ cdp, spec, timeoutMs: 300 });
    expect(result.composerCount).toBe(0);
    expect(result.xtermCount).toBe(0);
  });

  it("does not require a pane xterm when the terminal lives in the integrated panel", async () => {
    const panelSpec = parseQualificationCellSpec({
      V2Q_CELL_SPEC: JSON.stringify({
        id: "A0-panel",
        label: "panel",
        visibleChatPanes: 2,
        terminalSurface: "panel",
      }),
    })!;
    const cdp = {
      evaluate: async () => ({
        viewKind: "thread",
        panes: ["v2q-chat-01", "v2q-chat-02"],
        paneThreadsPresent: [true, true],
        titlesVisible: [],
        xtermCount: 0,
        composerCount: 2,
      }),
    } as unknown as ManagedCdpClient;
    const result = await waitForVisiblePanes({ cdp, spec: panelSpec, timeoutMs: 300 });
    expect(result.composerCount).toBe(2);
    expect(result.xtermCount).toBe(0);
  });
});
