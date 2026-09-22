import type { Project, Thread } from "@/shared/contracts";
import type { PersistedCompletedTurn, PersistedRuntimeItem } from "@/shared/ipc";
import type { ManagedCdpClient } from "./managedAppSession.ts";
import {
  buildStructuredWorkloadThreadRow,
  DEFAULT_STRUCTURED_WORKLOAD_CELL_SPEC,
  type StructuredWorkloadCellSpec,
  type StructuredWorkloadParams,
} from "./structuredWorkload.ts";

/**
 * Qualification cell fixture and synthetic stream helpers.
 *
 * The synthetic provider streams are real supervisor PTYs (`startShell` +
 * `writeTerminal` through the app's own procedure bridge). They are declared
 * as provider stand-ins: no model turn runs, but every byte travels the
 * production supervisor → host → client pipeline the qualification matrix
 * measures.
 *
 * Fixture threads are seeded through the renderer's authenticated preload
 * bridge (`dbUpsertThread` / `dbReplaceThreadRuntimeSnapshot`), which lands in
 * the running host's own database (`<baseDir>.host-v1/state.sqlite`). The
 * harness never opens or writes that database directly: a direct SQLite writer
 * would bypass the single-host authority and (as the first preflight proved)
 * could target the pre-promotion `state.sqlite` the live app ignores. After
 * every write the same bridge reads the rows back before pane setup.
 *
 * The store gate is read-only: after the diagnostics reload the cell requires
 * the renderer's genuine `persist.hasHydrated()` and the absence of the
 * startup spinner/recovery screen (`waitForNaturalBoot`), then requires every
 * seeded row in the hydrated store (`waitForFixtureThreadsInStore`). A
 * hydration failure is a product failure and must stay one — the cell never
 * swaps persist storage or forces a rehydrate.
 */

export interface QualificationCellSpec {
  readonly id: string;
  readonly label: string;
  /** Synthetic PTY producer streams (0 for a workload-independent preflight cell). */
  readonly producers: number;
  /** Instrumented WS clients (0 for a producer-free observer preflight cell). */
  readonly clients: number;
  readonly legacyClient: boolean;
  readonly slowClient: boolean;
  readonly reconnectClient: boolean;
  /**
   * Visible chat panes, including the structured producer pane when the cell
   * declares a structuredWorkload block (the producer is a real rendered GUI
   * thread, not an offscreen row).
   */
  readonly visibleChatPanes: number;
  /**
   * Where the reference workload's visible terminal lives:
   *  - `pane`: a terminal-presentation thread opened as a split pane (only
   *    valid for a thread the app does not own as a provider session);
   *  - `panel`: the app's integrated Terminal panel, which owns and starts its
   *    own dedicated shell (`shell:<uuid>`); the harness never reuses an
   *    app-managed provider thread id;
   *  - `none`: no visible terminal surface.
   * Defaults from the legacy `visibleTerminal` boolean (`true` -> `pane`).
   */
  readonly terminalSurface: "none" | "pane" | "panel";
  /** Legacy derived flag; true when any terminal surface is declared. */
  readonly visibleTerminal: boolean;
  readonly catalogThreads: number;
  readonly durationMs: number;
  readonly protocol: "idle" | "input" | "longtask";
  readonly assertBudgets: boolean;
  /** Trusted-input protocol overrides (only meaningful for input/longtask cells). */
  readonly trustedInput: Partial<TrustedInputCellSpec> | null;
  /**
   * Deterministic structured ACP workload (real supervisor launch). Null for
   * PTY-only cells; when present the cell launches in an isolated real-mode
   * profile and counts canonical GUI frames per structured producer.
   */
  readonly structuredWorkload: StructuredWorkloadCellSpec | null;
}

/** Per-cell trusted-input protocol override block (declared in V2Q_CELL_SPEC). */
export interface TrustedInputCellSpec {
  readonly idleClicks: number;
  readonly idleTypedChars: number;
  /** Segmented collection batch sizes (bounded disjoint observer windows). */
  readonly idleClicksPerSegment: number;
  readonly idleTypedCharsPerSegment: number;
  readonly blockedCycles: number;
  readonly blockMs: number;
  readonly minQueuedInputDelayMs: number;
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Explicit 0 is honored (workload-independent preflight); invalid values fall back. */
function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function parseStructuredWorkloadSpec(raw: unknown): StructuredWorkloadCellSpec | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("V2Q_CELL_SPEC.structuredWorkload must be an object");
  }
  const parsed = raw as Partial<StructuredWorkloadCellSpec>;
  if (
    parsed.params !== undefined &&
    (typeof parsed.params !== "object" || parsed.params === null || Array.isArray(parsed.params))
  ) {
    throw new Error("V2Q_CELL_SPEC.structuredWorkload.params must be an object");
  }
  return {
    instanceId:
      typeof parsed.instanceId === "string" && parsed.instanceId.length > 0
        ? parsed.instanceId
        : DEFAULT_STRUCTURED_WORKLOAD_CELL_SPEC.instanceId,
    threadId:
      typeof parsed.threadId === "string" && parsed.threadId.length > 0
        ? parsed.threadId
        : DEFAULT_STRUCTURED_WORKLOAD_CELL_SPEC.threadId,
    prompt:
      typeof parsed.prompt === "string" && parsed.prompt.length > 0
        ? parsed.prompt
        : DEFAULT_STRUCTURED_WORKLOAD_CELL_SPEC.prompt,
    minCanonicalFrames: positiveInt(
      parsed.minCanonicalFrames,
      DEFAULT_STRUCTURED_WORKLOAD_CELL_SPEC.minCanonicalFrames,
    ),
    params: (parsed.params ?? {}) as Partial<StructuredWorkloadParams>,
  };
}

function parseTrustedInputSpec(raw: unknown): Partial<TrustedInputCellSpec> | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("V2Q_CELL_SPEC.trustedInput must be an object");
  }
  const parsed = raw as Record<string, unknown>;
  const block: Record<string, number> = {};
  for (const key of [
    "idleClicks",
    "idleTypedChars",
    "idleClicksPerSegment",
    "idleTypedCharsPerSegment",
    "blockedCycles",
    "blockMs",
    "minQueuedInputDelayMs",
  ] as const) {
    const value = parsed[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`V2Q_CELL_SPEC.trustedInput.${key} must be a non-negative integer`);
    }
    block[key] = value;
  }
  return block as Partial<TrustedInputCellSpec>;
}

export function parseQualificationCellSpec(
  environment: NodeJS.ProcessEnv,
): QualificationCellSpec | null {
  const raw = environment.V2Q_CELL_SPEC;
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<QualificationCellSpec>;
  if (typeof parsed.id !== "string" || typeof parsed.label !== "string") {
    throw new Error("V2Q_CELL_SPEC must carry string id and label");
  }
  const terminalSurface: QualificationCellSpec["terminalSurface"] =
    parsed.terminalSurface === "panel" || parsed.terminalSurface === "none"
      ? parsed.terminalSurface
      : parsed.terminalSurface === "pane"
        ? "pane"
        : parsed.visibleTerminal === false
          ? "none"
          : "pane";
  return {
    id: parsed.id,
    label: parsed.label,
    producers: nonNegativeInt(parsed.producers, 8),
    clients: nonNegativeInt(parsed.clients, 1),
    legacyClient: parsed.legacyClient === true,
    slowClient: parsed.slowClient === true,
    reconnectClient: parsed.reconnectClient === true,
    visibleChatPanes: positiveInt(parsed.visibleChatPanes, 2),
    terminalSurface,
    visibleTerminal: terminalSurface !== "none",
    catalogThreads: typeof parsed.catalogThreads === "number" ? parsed.catalogThreads : 0,
    durationMs: positiveInt(parsed.durationMs, 120_000),
    protocol:
      parsed.protocol === "input" || parsed.protocol === "longtask" ? parsed.protocol : "idle",
    assertBudgets: parsed.assertBudgets === true,
    trustedInput: parseTrustedInputSpec(parsed.trustedInput),
    structuredWorkload: parseStructuredWorkloadSpec(parsed.structuredWorkload),
  };
}

const FILLER_WORDS = ["fixed", "visible", "qualification", "transcript", "content", "baseline"];

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

function buildItems(threadIndex: number, itemCount: number): PersistedRuntimeItem[] {
  const items: PersistedRuntimeItem[] = [];
  for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
    const id = `v2q-item-${String(threadIndex).padStart(2, "0")}-${String(itemIndex).padStart(3, "0")}`;
    const seed = threadIndex * 1_000 + itemIndex;
    items.push(
      itemIndex % 2 === 0
        ? {
            id,
            type: "user_message",
            state: "completed",
            payload: { text: fillerText(seed, 180) },
            streams: {},
          }
        : {
            id,
            type: "assistant_message",
            state: "completed",
            payload: { text: fillerText(seed, 600) },
            streams: {},
          },
    );
  }
  return items;
}

function buildTurns(threadIndex: number, itemCount: number): PersistedCompletedTurn[] {
  const anchorIndex = Math.min(10, itemCount) - 1;
  const startedAt = new Date(Date.UTC(2026, 8, 1, 12, threadIndex, 0)).toISOString();
  return [
    {
      startedAt,
      endedAt: new Date(Date.parse(startedAt) + 20_000).toISOString(),
      anchorItemId: `v2q-item-${String(threadIndex).padStart(2, "0")}-${String(Math.max(0, anchorIndex)).padStart(3, "0")}`,
    },
  ];
}

export interface QualificationFixture {
  readonly projectId: string;
  readonly projectLocation: { readonly kind: "posix"; readonly path: string };
  readonly chatThreadIds: readonly string[];
  /** Visible pane order: regular chat panes followed by the structured producer. */
  readonly paneThreadIds: readonly string[];
  readonly terminalThreadId: string;
  /** Structured-workload producer row id, present only when the cell declares one. */
  readonly structuredThreadId: string | null;
  readonly catalogThreadCount: number;
  /** How the fixture project was selected from the running host's project list. */
  readonly projectSelection: {
    readonly mode: "expected-project-dir" | "fallback-first-project";
    readonly expectedProjectDir: string | null;
    readonly projectCount: number;
    readonly selectedProjectId: string;
    readonly selectedPath: string;
  };
  /**
   * Transcript seeding status. The backend host refuses every wholesale
   * runtime-replace RPC (`dbReplaceThreadRuntimeSnapshot` and friends: "the
   * backend host owns thread runtime mutations") and no production procedure
   * appends runtime events to an existing thread, so a cell can only seed
   * thread rows through the bridge. This narrow preflight does not need
   * history; the fixed-content transcript fixture stays pending until a
   * host-owned append seam exists.
   */
  readonly historySeeding: "unavailable-host-owned";
  /** Host read-back taken through the seeding bridge before pane setup. */
  readonly hostReadBack: HostFixtureReadBack;
}

export interface HostFixtureReadBack {
  readonly projectId: string;
  readonly threadIds: readonly string[];
  readonly statuses: Readonly<Record<string, string>>;
  readonly runtimeItemCounts: Readonly<Record<string, number>>;
  readonly pagesScanned: number;
}

export interface QualificationFixtureRow {
  readonly thread: Thread;
  readonly items?: readonly PersistedRuntimeItem[];
  readonly turns?: readonly PersistedCompletedTurn[];
}

/** The schema-valid thread rows (and chat transcripts) a cell seeds into the host. */
export function buildFixtureThreads(input: {
  readonly projectId: string;
  readonly spec: QualificationCellSpec;
  readonly itemsPerChatThread?: number;
  readonly now?: string;
  /**
   * Structured-workload producer row: an `acp-generic` GUI thread that the
   * cell later starts through the normal supervisor launch. Its row is seeded
   * with the pane rows so genuine boot hydration carries it into the store,
   * and it consumes one of the declared visible chat panes: the producer is a
   * real rendered streaming thread, so the pane count must include it.
   */
  readonly structuredWorkload?: { readonly threadId: string; readonly instanceId: string };
}): QualificationFixtureRow[] {
  const now = input.now ?? new Date().toISOString();
  const rows: QualificationFixtureRow[] = [];
  const structuredPanes = input.structuredWorkload ? 1 : 0;
  const regularChatPanes = Math.max(0, input.spec.visibleChatPanes - structuredPanes);
  for (let index = 1; index <= regularChatPanes; index += 1) {
    const items = buildItems(index, input.itemsPerChatThread ?? 40);
    rows.push({
      thread: {
        id: `v2q-chat-${String(index).padStart(2, "0")}`,
        projectId: input.projectId,
        title: `V2Q chat pane ${String(index).padStart(2, "0")} fixed visible content`,
        agentKind: "codex",
        config: { model: "v2q-fixed-content" },
        status: "inactive",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        createdAt: now,
        updatedAt: now,
      },
      items,
      turns: buildTurns(index, items.length),
    });
  }
  rows.push({
    thread: {
      id: "v2q-term-01",
      projectId: input.projectId,
      title: "V2Q terminal pane fixed visible content",
      agentKind: "codex",
      config: { model: "v2q-fixed-content" },
      status: "inactive",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "terminal",
      createdAt: now,
      updatedAt: now,
    },
  });
  if (input.structuredWorkload) {
    rows.push({
      thread: buildStructuredWorkloadThreadRow({
        projectId: input.projectId,
        threadId: input.structuredWorkload.threadId,
        instanceId: input.structuredWorkload.instanceId,
        now,
      }),
    });
  }
  return rows;
}

async function readHostThreadsByIds(
  cdp: ManagedCdpClient,
  ids: readonly string[],
): Promise<{ readonly found: Map<string, Thread>; readonly pagesScanned: number }> {
  const wanted = new Set(ids);
  const found = new Map<string, Thread>();
  let cursor: string | undefined;
  let pagesScanned = 0;
  for (let page = 0; page < 5; page += 1) {
    const result = (await cdp.invokeProcedure("dbGetThreadsPage", {
      limit: 200,
      ...(cursor === undefined ? {} : { cursor }),
    })) as { threads?: Thread[]; nextCursor?: string | null } | null;
    pagesScanned += 1;
    for (const thread of result?.threads ?? []) {
      if (wanted.has(thread.id)) found.set(thread.id, thread);
    }
    if (found.size === wanted.size) break;
    const next = result?.nextCursor ?? null;
    if (next === null) break;
    cursor = next;
  }
  return { found, pagesScanned };
}

/**
 * Seeds chat/terminal fixture threads through the running host's own
 * authenticated bridge and verifies the host reads every fixture id back
 * (thread row plus non-empty chat runtime items) before the cell touches panes.
 *
 * When `expectedProjectDir` is given (the launcher's isolated fixture project),
 * the fixture must land in that project — never in whichever project happens to
 * sort first (the managed app also carries the user's real-home project row).
 */
export async function seedQualificationFixture(input: {
  readonly cdp: ManagedCdpClient;
  readonly spec: QualificationCellSpec;
  readonly itemsPerChatThread?: number;
  readonly expectedProjectDir?: string;
  readonly structuredWorkload?: { readonly threadId: string; readonly instanceId: string };
}): Promise<QualificationFixture> {
  const projects = (await input.cdp.invokeProcedure("dbGetProjects")) as Project[] | null;
  const list = Array.isArray(projects) ? projects : [];
  const expectedProjectDir = input.expectedProjectDir ?? null;
  const expected = list.find((candidate) => {
    const location = candidate.location as { kind?: unknown; path?: unknown };
    return (
      expectedProjectDir !== null &&
      location.kind === "posix" &&
      location.path === expectedProjectDir
    );
  });
  const project = expected ?? list[0];
  if (!project) throw new Error("managed session host has no project to seed fixture threads into");
  const projectSelection = {
    mode: expected ? ("expected-project-dir" as const) : ("fallback-first-project" as const),
    expectedProjectDir,
    projectCount: list.length,
    selectedProjectId: project.id,
    selectedPath: String((project.location as { path?: unknown }).path ?? ""),
  };
  const location = project.location as { kind?: unknown; path?: unknown };
  if (location.kind !== "posix" || typeof location.path !== "string") {
    throw new Error("managed session fixture project is not a posix location");
  }
  if (expectedProjectDir !== null && !expected) {
    throw new Error(
      `managed session host has no project at the launcher fixture path ${expectedProjectDir} ` +
        `(projects=${String(list.length)}); refusing to seed the user's own project`,
    );
  }
  const rows = buildFixtureThreads({
    projectId: project.id,
    spec: input.spec,
    ...(input.itemsPerChatThread === undefined
      ? {}
      : { itemsPerChatThread: input.itemsPerChatThread }),
    ...(input.structuredWorkload === undefined
      ? {}
      : { structuredWorkload: input.structuredWorkload }),
  });
  for (const row of rows) {
    // Thread rows are the only fixture mutation the host serves to a client:
    // `dbUpsertThread` is this window's catalog write, while every wholesale
    // runtime replace is refused by the backend host that owns the transcript.
    await input.cdp.invokeProcedure("dbUpsertThread", row.thread);
  }

  const expectedIds = rows.map((row) => row.thread.id);
  const { found, pagesScanned } = await readHostThreadsByIds(input.cdp, expectedIds);
  const missing = expectedIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`host did not return seeded fixture threads: ${missing.join(", ")}`);
  }
  const notInactive = expectedIds.filter((id) => found.get(id)?.status !== "inactive");
  if (notInactive.length > 0) {
    throw new Error(
      `host fixture threads are not inactive: ${notInactive
        .map((id) => `${id}=${String(found.get(id)?.status)}`)
        .join(", ")}`,
    );
  }

  const structuredThreadId = input.structuredWorkload?.threadId ?? null;
  const chatRows = rows.filter(
    (row) =>
      row.thread.presentationMode === "gui" &&
      (structuredThreadId === null || row.thread.id !== structuredThreadId),
  );
  const terminalRow = rows.find((row) => row.thread.presentationMode === "terminal");
  if (!terminalRow) throw new Error("fixture builder produced no terminal pane thread");
  const runtimeItemCounts: Record<string, number> = {};
  for (const row of chatRows) {
    // Read-back only: the host must serve the (empty) transcript for the row
    // it just accepted, proving the pane will bind a real host thread.
    // `dbGetThreadRuntimeItems` is a positional procedure: it takes the raw
    // thread id, not a `{ threadId }` payload.
    const items = (await input.cdp.invokeProcedure("dbGetThreadRuntimeItems", row.thread.id)) as
      | unknown[]
      | null;
    runtimeItemCounts[row.thread.id] = Array.isArray(items) ? items.length : 0;
  }

  return {
    projectId: project.id,
    projectLocation: { kind: "posix", path: location.path },
    chatThreadIds: chatRows.map((row) => row.thread.id),
    paneThreadIds: [
      ...chatRows.map((row) => row.thread.id),
      ...(structuredThreadId === null ? [] : [structuredThreadId]),
    ],
    terminalThreadId: terminalRow.thread.id,
    structuredThreadId,
    catalogThreadCount: input.spec.catalogThreads,
    projectSelection,
    historySeeding: "unavailable-host-owned",
    hostReadBack: {
      projectId: project.id,
      threadIds: expectedIds,
      statuses: Object.fromEntries(
        expectedIds.map((id) => [id, String(found.get(id)?.status ?? "missing")]),
      ),
      runtimeItemCounts,
      pagesScanned,
    },
  };
}

export interface NaturalBootState {
  /** `persist.hasHydrated()` of the app store; null when the DEV store is absent. */
  readonly hydrated: boolean | null;
  /** True while the startup spinner or recovery screen owns the document. */
  readonly startupSurfaceVisible: boolean;
  /** True when the startup surface is the recovery screen (a `<section>` inside it). */
  readonly recoveryVisible: boolean;
  readonly threadCount: number | null;
}

/**
 * The startup surfaces are the only `h-screen w-screen` flex roots in the main
 * renderer: the loading spinner (`div`) and `StartupRecoveryScreen` (`main` with
 * a `<section>`). MainView's shell uses different roots. This reads the genuine
 * zustand hydration flag — never a forced rehydrate or a storage seam.
 */
export function readNaturalBootState(cdp: ManagedCdpClient): Promise<NaturalBootState> {
  return cdp.evaluate<NaturalBootState>(
    `(() => {` +
      ` const store = window.__poracodeDev?.stores?.app;` +
      ` const persisted = store?.persist;` +
      ` const hydrated = typeof persisted?.hasHydrated === "function" ? persisted.hasHydrated() : null;` +
      ` const startupSurface = document.querySelector(` +
      `"main.flex.h-screen.w-screen, div.flex.h-screen.w-screen");` +
      ` const threadCount = store ? (store.getState().threads?.length ?? 0) : null;` +
      ` return { hydrated, startupSurfaceVisible: Boolean(startupSurface),` +
      ` recoveryVisible: Boolean(document.querySelector("main.flex.h-screen.w-screen section")),` +
      ` threadCount }; })()`,
  );
}

export interface NaturalBootEvidence extends NaturalBootState {
  readonly hydrated: true;
  readonly startupSurfaceVisible: false;
  readonly recoveryVisible: false;
  readonly waitedMs: number;
  readonly polls: number;
}

/**
 * Natural boot gate: the reloaded renderer must have completed its OWN app-store
 * hydration and left the startup spinner/recovery surface before the cell
 * installs or launches anything. A false hydration here is a product failure
 * (the cell does not force hydration through a persist-storage seam), so the
 * gate throws a distinct, evidence-carrying error instead of proceeding.
 */
export async function waitForNaturalBoot(input: {
  readonly cdp: ManagedCdpClient;
  readonly timeoutMs?: number;
}): Promise<NaturalBootEvidence> {
  const timeoutMs = input.timeoutMs ?? 60_000;
  const startedAt = Date.now();
  let polls = 0;
  let last: NaturalBootState = {
    hydrated: null,
    startupSurfaceVisible: true,
    recoveryVisible: false,
    threadCount: null,
  };
  for (;;) {
    last = await readNaturalBootState(input.cdp).catch(() => last);
    polls += 1;
    if (last.hydrated === true && !last.startupSurfaceVisible) {
      return {
        ...last,
        hydrated: true,
        startupSurfaceVisible: false,
        recoveryVisible: false,
        waitedMs: Date.now() - startedAt,
        polls,
      };
    }
    if (Date.now() - startedAt >= timeoutMs) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `natural boot gate failed after ${String(timeoutMs)}ms: persist.hasHydrated()=${String(
      last.hydrated,
    )}, startupSurfaceVisible=${String(last.startupSurfaceVisible)}, recoveryVisible=${String(
      last.recoveryVisible,
    )}, threadCount=${String(last.threadCount)}; ` +
      "the qualification cell never forces hydration through a DEV persist-storage seam",
  );
}

export interface FixtureStoreEvidence {
  readonly mode: "app-store-hydration";
  readonly threadIds: readonly string[];
  readonly primedByHostReadBack: false;
  readonly hydrated: true;
  readonly missingAtFirstPoll: readonly string[];
  readonly waitedMs: number;
  readonly polls: number;
}

/**
 * Read-only fixture gate: every seeded thread (chat panes, terminal pane and
 * the structured producer) must be present in the naturally hydrated app store.
 * The host rows were written before the reload, so a missing id means the
 * product's hydration path did not carry it — a failure, not a reason to install
 * rows through the DEV store.
 */
export async function waitForFixtureThreadsInStore(input: {
  readonly cdp: ManagedCdpClient;
  readonly fixture: QualificationFixture;
  readonly timeoutMs?: number;
}): Promise<FixtureStoreEvidence> {
  const threadIds = [
    ...input.fixture.chatThreadIds,
    input.fixture.terminalThreadId,
    ...(input.fixture.structuredThreadId === null ? [] : [input.fixture.structuredThreadId]),
  ];
  const timeoutMs = input.timeoutMs ?? 30_000;
  const startedAt = Date.now();
  let polls = 0;
  let missingAtFirstPoll: readonly string[] = threadIds;
  let lastMissing: readonly string[] = threadIds;
  let lastHydrated: boolean | null = null;
  for (;;) {
    const state = await input.cdp
      .evaluate<{ readonly hydrated: boolean | null; readonly missing: readonly string[] }>(
        `(() => { const store = window.__poracodeDev?.stores?.app;` +
          ` const hydrated = typeof store?.persist?.hasHydrated === "function" ? store.persist.hasHydrated() : null;` +
          ` if (!store) return { hydrated, missing: ${JSON.stringify(threadIds)} };` +
          ` const ids = new Set(store.getState().threads.map((thread) => thread.id));` +
          ` return { hydrated, missing: ${JSON.stringify(threadIds)}.filter((id) => !ids.has(id)) }; })()`,
      )
      .catch(() => ({ hydrated: null, missing: threadIds }));
    polls += 1;
    if (polls === 1) missingAtFirstPoll = state.missing;
    lastMissing = state.missing;
    lastHydrated = state.hydrated;
    if (state.hydrated === true && state.missing.length === 0) {
      return {
        mode: "app-store-hydration",
        threadIds,
        primedByHostReadBack: false,
        hydrated: true,
        missingAtFirstPoll,
        waitedMs: Date.now() - startedAt,
        polls,
      };
    }
    if (Date.now() - startedAt >= timeoutMs) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `fixture threads are not in the naturally hydrated app store after ${String(
      timeoutMs,
    )}ms (missing: ${lastMissing.join(", ") || "none"}, hydrated=${String(lastHydrated)}); ` +
      "the qualification cell does not install fixture rows through the DEV store",
  );
}

export interface ProducerStream {
  readonly shellId: string;
  readonly tickLine: string;
  readonly linesPerSecond: number;
}

export function buildProducerStreams(
  count: number,
  options?: {
    /**
     * Shell id for the first stream. Production cells never pass a visible pane
     * thread id: the app owns pane-bound terminal threads and replaces (or is
     * replaced by) a harness PTY on the same id. Unit tests use it to pin the
     * legacy shape.
     */
    readonly firstShellId?: string;
  },
): ProducerStream[] {
  return Array.from({ length: count }, (_, index) => {
    const shellId =
      index === 0 && options?.firstShellId
        ? options.firstShellId
        : `v2q-prod-${String(index + 1).padStart(2, "0")}`;
    return {
      shellId,
      tickLine: `${shellId}-tick-${"x".repeat(72)}`,
      linesPerSecond: 20,
    };
  });
}

/**
 * Producer loop for a real supervisor shell. The loop is wrapped in an
 * explicit `/bin/zsh -c` because the supervisor spawns the session's login
 * shell (`$SHELL`, here fish on the reference machine) whose syntax does not
 * accept a POSIX `while do done` loop; the outer shell only has to run one
 * quoted command, and the loop itself runs in a real zsh under the PTY.
 */
export function producerCommand(stream: ProducerStream): string {
  return `/bin/zsh -c 'while true; do echo "${stream.tickLine}"; sleep 0.05; done'\r`;
}

/** One raw PTY snapshot probe; every field is recorded as returned by the
 * production `readTerminalSnapshot` procedure (no shell mock stands in). */
export interface ProducerSnapshotProbe {
  readonly shellId: string;
  readonly generation: string | null;
  readonly fromCursor: number | null;
  readonly toCursor: number | null;
  readonly processState: string | null;
  readonly dataBytes: number;
  readonly tickCount: number;
  readonly tailPreview: string;
}

/** Removes ANSI escape sequences (CSI `ESC [ ... final`) without a control-char regex. */
function stripAnsi(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 27 && value[index + 1] === "[") {
      let cursor = index + 2;
      while (cursor < value.length) {
        const code = value.charCodeAt(cursor);
        if (code >= 0x40 && code <= 0x7e) break;
        cursor += 1;
      }
      index = cursor;
      continue;
    }
    result += value[index];
  }
  return result;
}

function countTicks(data: string, stream: ProducerStream): number {
  return (data.match(new RegExp(`${stream.shellId}-tick`, "gu")) ?? []).length;
}

export function probeProducerSnapshot(input: {
  readonly cdp: ManagedCdpClient;
  readonly stream: ProducerStream;
}): Promise<ProducerSnapshotProbe> {
  return input.cdp
    .invokeProcedure("readTerminalSnapshot", { threadId: input.stream.shellId })
    .then((snapshot) => {
      const record = snapshot as {
        data?: unknown;
        generation?: unknown;
        fromCursor?: unknown;
        toCursor?: unknown;
        processState?: unknown;
      } | null;
      const data = typeof record?.data === "string" ? record.data : "";
      return {
        shellId: input.stream.shellId,
        generation: typeof record?.generation === "string" ? record.generation : null,
        fromCursor: typeof record?.fromCursor === "number" ? record.fromCursor : null,
        toCursor: typeof record?.toCursor === "number" ? record.toCursor : null,
        processState: typeof record?.processState === "string" ? record.processState : null,
        dataBytes: data.length,
        tickCount: countTicks(data, input.stream),
        tailPreview: stripAnsi(data).slice(-160),
      };
    });
}

export interface ProducerStartEvidence {
  readonly shellId: string;
  readonly startShellResult: unknown;
  readonly startShellError: string | null;
  readonly shellBound: boolean;
  readonly boundAfterMs: number | null;
  readonly bindingBefore: ProducerSnapshotProbe | null;
  readonly writeAtMs: number | null;
  readonly writeResult: unknown;
  readonly writeError: string | null;
  readonly echoObserved: boolean | null;
  readonly bindingAfterWrite: ProducerSnapshotProbe | null;
  readonly bindingProbeError: string | null;
}

/**
 * Starts every real supervisor shell, then writes each producer loop through
 * the production `writeTerminal` procedure. Every procedure result, the PTY
 * generation/cursor binding and the write echo are recorded so a zero-tick
 * failure can be diagnosed (write refused vs shell replaced vs command never
 * executed) before any producer mechanism is changed. No shell mock replaces
 * the real PTY.
 */
export async function startProducerStreams(input: {
  readonly cdp: ManagedCdpClient;
  readonly projectLocation: { readonly kind: "posix"; readonly path: string };
  readonly streams: readonly ProducerStream[];
  /** Legacy shell-spawn settle before the first write; 0 in unit tests. */
  readonly settleMs?: number;
  readonly bindTimeoutMs?: number;
  readonly echoTimeoutMs?: number;
}): Promise<ProducerStartEvidence[]> {
  if (input.streams.length === 0) return [];
  const probeBinding = (input.settleMs ?? 2_000) !== 0;
  const evidence: ProducerStartEvidence[] = [];
  for (const stream of input.streams) {
    let startShellResult: unknown = null;
    let startShellError: string | null = null;
    try {
      startShellResult = await input.cdp.invokeProcedure("startShell", {
        shellId: stream.shellId,
        projectLocation: input.projectLocation,
        initialSize: { cols: 120, rows: 30 },
      });
    } catch (error) {
      startShellError = error instanceof Error ? error.message : String(error);
    }
    evidence.push({
      shellId: stream.shellId,
      startShellResult,
      startShellError,
      shellBound: false,
      boundAfterMs: null,
      bindingBefore: null,
      writeAtMs: null,
      writeResult: null,
      writeError: null,
      echoObserved: null,
      bindingAfterWrite: null,
      bindingProbeError: null,
    });
  }
  if ((input.settleMs ?? 2_000) > 0) {
    await new Promise((resolve) => setTimeout(resolve, input.settleMs));
  }
  for (const [index, stream] of input.streams.entries()) {
    const record = evidence[index]!;
    let bindingBefore: ProducerSnapshotProbe | null = null;
    let bindingProbeError: string | null = null;
    if (probeBinding) {
      const bindStartedAt = Date.now();
      const deadline = bindStartedAt + (input.bindTimeoutMs ?? 10_000);
      for (;;) {
        try {
          const probe = await probeProducerSnapshot({ cdp: input.cdp, stream });
          bindingBefore = probe;
          // Bound once the PTY exists and has painted something (a prompt or
          // login output); writing before the line editor is ready leaves the
          // command unexecuted (observed with a fish continuation prompt).
          if (probe.processState !== null && probe.dataBytes > 0) break;
        } catch (error) {
          bindingProbeError = error instanceof Error ? error.message : String(error);
        }
        if (Date.now() >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      evidence[index] = {
        ...record,
        shellBound: bindingBefore !== null && bindingBefore.processState !== null,
        boundAfterMs: bindingBefore === null ? null : Date.now() - bindStartedAt,
        bindingBefore,
        bindingProbeError,
      };
    }
    let writeResult: unknown = null;
    let writeError: string | null = null;
    const writeAtMs = Date.now();
    try {
      writeResult = await input.cdp.invokeProcedure("writeTerminal", {
        threadId: stream.shellId,
        data: producerCommand(stream),
      });
    } catch (error) {
      writeError = error instanceof Error ? error.message : String(error);
    }
    let bindingAfterWrite: ProducerSnapshotProbe | null = null;
    let echoObserved: boolean | null = null;
    if (probeBinding && bindingBefore !== null) {
      const echoDeadline = Date.now() + (input.echoTimeoutMs ?? 5_000);
      for (;;) {
        try {
          const probe = await probeProducerSnapshot({ cdp: input.cdp, stream });
          bindingAfterWrite = probe;
          const beforeCursor = bindingBefore.toCursor ?? 0;
          const afterCursor = probe.toCursor ?? 0;
          const generationChanged =
            bindingBefore.generation !== null && probe.generation !== bindingBefore.generation;
          if (generationChanged) {
            echoObserved = false;
            break;
          }
          if (afterCursor > beforeCursor || probe.tickCount > bindingBefore.tickCount) {
            echoObserved = true;
            break;
          }
        } catch (error) {
          bindingProbeError = error instanceof Error ? error.message : String(error);
        }
        if (Date.now() >= echoDeadline) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    evidence[index] = {
      ...evidence[index]!,
      writeAtMs,
      writeResult,
      writeError,
      echoObserved,
      bindingAfterWrite,
      bindingProbeError,
    };
  }
  return evidence;
}

export interface ProducerVerification {
  readonly verified: number;
  readonly samples: ReadonlyArray<{
    readonly shellId: string;
    readonly ticks: number;
    readonly processState: string | null;
    readonly sampleBytes: number;
    readonly generation: string | null;
    readonly fromCursor: number | null;
    readonly toCursor: number | null;
    readonly tickPresent: boolean;
    readonly lastTickIndex: number | null;
    readonly tailPreview: string;
  }>;
}

export async function verifyProducerStreams(input: {
  readonly cdp: ManagedCdpClient;
  readonly streams: readonly ProducerStream[];
  /** Snapshot settle before reading; 0 in unit tests. */
  readonly settleMs?: number;
}): Promise<ProducerVerification> {
  if (input.streams.length === 0) return { verified: 0, samples: [] };
  await new Promise((resolve) => setTimeout(resolve, input.settleMs ?? 3_000));
  const samples: ProducerVerification["samples"][number][] = [];
  for (const stream of input.streams) {
    const probe = await probeProducerSnapshot({ cdp: input.cdp, stream });
    const lastTickIndex =
      probe.tickCount > 0 ? probe.tailPreview.lastIndexOf(`${stream.shellId}-tick`) : null;
    samples.push({
      shellId: stream.shellId,
      ticks: probe.tickCount,
      processState: probe.processState,
      sampleBytes: probe.dataBytes,
      generation: probe.generation,
      fromCursor: probe.fromCursor,
      toCursor: probe.toCursor,
      tickPresent: probe.tickCount > 0,
      lastTickIndex,
      tailPreview: probe.tailPreview,
    });
  }
  return {
    verified: samples.filter((sample) => sample.ticks > 5).length,
    samples,
  };
}

/**
 * Diagnoses a zero/low-tick producer failure from the recorded start evidence
 * and the verification samples, distinguishing: startShell refused, write
 * refused, PTY generation replaced after the write, write never echoed, echo
 * observed but no ticks, and ticks below the >5 acceptance threshold.
 */
export function diagnoseProducerFailure(input: {
  readonly start: readonly ProducerStartEvidence[];
  readonly verification: ProducerVerification;
  readonly expected: number;
}): string {
  const problems: string[] = [];
  for (const record of input.start) {
    if (record.startShellError !== null) {
      problems.push(`${record.shellId}: startShell refused (${record.startShellError})`);
    } else if (!record.shellBound) {
      problems.push(`${record.shellId}: no readable PTY snapshot after startShell`);
    }
    if (record.writeError !== null) {
      problems.push(`${record.shellId}: writeTerminal refused (${record.writeError})`);
    }
    const before = record.bindingBefore;
    const after = record.bindingAfterWrite;
    if (before && after && before.generation !== null && after.generation !== before.generation) {
      problems.push(
        `${record.shellId}: PTY generation changed after the write ` +
          `(${before.generation} -> ${after.generation}); the shell was replaced`,
      );
    } else if (record.echoObserved === false) {
      problems.push(`${record.shellId}: write was never echoed by the bound PTY`);
    } else if (record.echoObserved === true) {
      const sample = input.verification.samples.find((entry) => entry.shellId === record.shellId);
      if (sample && sample.ticks <= 5) {
        problems.push(
          `${record.shellId}: echo observed but only ${String(sample.ticks)} ticks ` +
            `(${String(sample.sampleBytes)} snapshot bytes)`,
        );
      }
    }
  }
  const summary = input.verification.samples
    .map(
      (sample) =>
        `${sample.shellId}: ticks=${String(sample.ticks)} state=${String(
          sample.processState,
        )} bytes=${String(sample.sampleBytes)} generation=${String(sample.generation)}`,
    )
    .join("; ");
  return (
    `${String(input.verification.verified)}/${String(input.expected)} synthetic streams are running. ` +
    `Diagnosis: ${problems.length > 0 ? problems.join(" | ") : "no procedure or binding error recorded"}. ` +
    `Samples: ${summary}`
  );
}

export function buildPaneSetupScript(input: {
  readonly chatThreadIds: readonly string[];
  readonly terminalThreadId: string | null;
}): string {
  const [first, ...rest] = input.chatThreadIds;
  return `(() => {
    const store = window.__poracodeDev.stores.app;
    if (!store) return { ok: false, step: "no-app-store" };
    store.getState().openThread(${JSON.stringify(first)});
    let state = store.getState();
    if (state.view.kind !== "thread") return { ok: false, step: "open-chat", view: state.view };
    let firstPane = state.view.panes[0];
    for (const threadId of ${JSON.stringify(rest)}) {
      state.splitPaneById(threadId, firstPane, "right");
      state = store.getState();
      if (state.view.kind !== "thread") return { ok: false, step: "split-chat", view: state.view };
      firstPane = state.view.panes[state.view.panes.length - 1];
    }
    ${
      input.terminalThreadId === null
        ? ""
        : `state.splitPaneById(${JSON.stringify(input.terminalThreadId)}, firstPane, "bottom");
    state = store.getState();`
    }
    return {
      ok: state.view.kind === "thread" && state.view.panes.length === ${
        input.chatThreadIds.length + (input.terminalThreadId === null ? 0 : 1)
      },
      step: "done",
      panes: state.view.kind === "thread" ? [...state.view.panes] : [],
      viewKind: state.view.kind,
    };
  })()`;
}

export interface PaneVerification {
  readonly viewKind: string;
  readonly panes: readonly string[];
  readonly paneThreadsPresent: readonly boolean[];
  readonly titlesVisible: ReadonlyArray<{
    readonly id: string;
    readonly title: string | null;
    readonly visible: boolean;
  }>;
  readonly xtermCount: number;
  readonly composerCount: number;
}

export function verifyVisiblePanes(cdp: ManagedCdpClient): Promise<PaneVerification> {
  return cdp.evaluate<PaneVerification>(
    `(() => {
      const state = window.__poracodeDev.stores.app.getState();
      const panes = state.view.kind === "thread" ? [...state.view.panes] : [];
      const threads = new Map(state.threads.map((thread) => [thread.id, thread]));
      const text = document.body.innerText;
      return {
        viewKind: state.view.kind,
        panes,
        paneThreadsPresent: panes.map((id) => threads.has(id)),
        titlesVisible: panes.map((id) => {
          const title = threads.get(id)?.title ?? null;
          return { id, title, visible: title !== null && text.includes(title) };
        }),
        xtermCount: document.querySelectorAll(".xterm").length,
        composerCount: document.querySelectorAll("[data-composer-input-anchor]").length,
      };
    })()`,
  );
}

/**
 * Waits (bounded) until the store-driven pane layout is actually committed to
 * the DOM: React renders MainView after hydration flips, and the terminal pane
 * mounts its xterm asynchronously, so an immediate check reads the previous
 * frame. Returns the last observation; the caller decides whether it satisfies
 * the cell.
 */
export async function waitForVisiblePanes(input: {
  readonly cdp: ManagedCdpClient;
  readonly spec: QualificationCellSpec;
  /** Exact pane count the cell declared (chat panes incl. structured + terminal). */
  readonly expectedPaneCount?: number;
  readonly timeoutMs?: number;
}): Promise<PaneVerification> {
  const deadline = Date.now() + (input.timeoutMs ?? 60_000);
  let last = await verifyVisiblePanes(input.cdp);
  for (;;) {
    const satisfied =
      last.viewKind === "thread" &&
      last.panes.length > 0 &&
      (input.expectedPaneCount === undefined || last.panes.length === input.expectedPaneCount) &&
      last.paneThreadsPresent.every((present) => present) &&
      (input.spec.visibleChatPanes === 0 || last.composerCount >= 1) &&
      // Only a pane-hosted terminal surface lives inside the pane layout; the
      // integrated Terminal panel is verified by its own calibration leg.
      (input.spec.terminalSurface !== "pane" || last.xtermCount >= 1);
    if (satisfied) return last;
    if (Date.now() >= deadline) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
    last = await verifyVisiblePanes(input.cdp).catch(() => last);
  }
}
