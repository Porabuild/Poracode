import { mkdir, mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AnyMessage,
  CompleteElicitationNotification,
  CreateElicitationRequest,
  CreateElicitationResponse,
  RequestPermissionRequest,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import type { ProjectLocation } from "@/shared/contracts";
import type { CommandSpec } from "../base";
import { buildAcpInitializeRequest } from "./session";
import { createSharedAcpStructuredSession } from "./sessionFactory";
import {
  acquireSharedAcpProcess,
  shutdownSharedAcpProcesses,
  type AcpSharedProcessLease,
  type AcpSharedProcessMember,
  type AcpSharedProcessPrepare,
} from "./sharedProcess";

const FIXTURE = fileURLToPath(new URL("./fixtures/fake-shared-acp-agent.mjs", import.meta.url));

const INIT_REQUEST = buildAcpInitializeRequest({
  fsTextCapability: true,
  terminalCapability: true,
  booleanConfigOptions: false,
});

const scopes = new Set<string>();
const tempDirs: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function agentCommand(env: Record<string, string> = {}): CommandSpec {
  return {
    command: process.execPath,
    args: [FIXTURE],
    env: { FAKE_SELF_DESTRUCT_MS: "60000", ...env },
  };
}

function projectLocation(): ProjectLocation {
  return process.platform === "win32"
    ? { kind: "windows", path: process.cwd() }
    : { kind: "posix", path: process.cwd() };
}

interface MemberSpy {
  readonly member: AcpSharedProcessMember;
  readonly updates: SessionNotification[];
  readonly extMethods: Array<{ method: string; params: Record<string, unknown> }>;
  readonly extNotifications: Array<{ method: string; params: Record<string, unknown> }>;
  readonly transportClosed: Array<number | null>;
  readonly stderr: string[];
  readonly writes: AnyMessage[];
  readonly work: { value: boolean };
  readonly routeKey: { value: string | undefined };
  readonly elicitations: CreateElicitationRequest[];
  readonly elicitResponse: { value: CreateElicitationResponse };
  readonly completes: CompleteElicitationNotification[];
  readonly permissions: RequestPermissionRequest[];
}

function makeMember(): MemberSpy {
  const updates: SessionNotification[] = [];
  const extMethods: Array<{ method: string; params: Record<string, unknown> }> = [];
  const extNotifications: Array<{ method: string; params: Record<string, unknown> }> = [];
  const transportClosed: Array<number | null> = [];
  const stderr: string[] = [];
  const writes: AnyMessage[] = [];
  const work = { value: false };
  const routeKey = { value: undefined as string | undefined };
  const elicitations: CreateElicitationRequest[] = [];
  const completes: CompleteElicitationNotification[] = [];
  const permissions: RequestPermissionRequest[] = [];
  const elicitResponse: { value: CreateElicitationResponse } = {
    value: { action: "accept", content: { answer: "unset" } },
  };
  const member: AcpSharedProcessMember = {
    client: {
      requestPermission: async (params) => {
        permissions.push(params);
        return { outcome: { outcome: "cancelled" } };
      },
      sessionUpdate: (params) => {
        updates.push(params);
      },
      createElicitation: async (params) => {
        elicitations.push(params);
        return elicitResponse.value;
      },
      completeElicitation: (params) => {
        completes.push(params);
      },
      extMethod: async (method, params) => {
        extMethods.push({ method, params });
        return { ok: true };
      },
      extNotification: (method, params) => {
        extNotifications.push({ method, params });
      },
    },
    onTransportClosed: (code) => {
      transportClosed.push(code);
    },
    onStderr: (text) => {
      stderr.push(text);
    },
    onBeforeWrite: (message) => {
      writes.push(message);
    },
    hasAgentWork: () => work.value,
    unaddressedRouteKey: () => routeKey.value,
  };
  return {
    member,
    updates,
    extMethods,
    extNotifications,
    transportClosed,
    stderr,
    writes,
    work,
    routeKey,
    elicitations,
    elicitResponse,
    completes,
    permissions,
  };
}

function updateTexts(spy: MemberSpy): string {
  return spy.updates.map((update) => JSON.stringify(update)).join("\n");
}

async function readMarker(path: string): Promise<string[]> {
  return (await readFile(path, "utf8").catch(() => ""))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Wait until the fake agent recorded every expected session/prompt pair. */
async function waitForPrompts(
  markerPath: string,
  expected: ReadonlyArray<readonly [sessionId: string, text: string]>,
): Promise<void> {
  await vi.waitFor(
    async () => {
      const records = (await readMarker(markerPath)).map(
        (line) => JSON.parse(line) as { sessionId?: string; text?: string },
      );
      for (const [sessionId, text] of expected) {
        expect(
          records.some(
            (record) => record.sessionId === sessionId && (record.text ?? "").includes(text),
          ),
        ).toBe(true);
      }
    },
    { timeout: 10_000 },
  );
}

async function acquireAttached(
  scope: string,
  command: CommandSpec,
  prepare?: AcpSharedProcessPrepare,
  unaddressedRequests?: "reject" | "single-active-session",
  maxSessionsPerProcess?: number,
): Promise<{ lease: AcpSharedProcessLease; spy: MemberSpy }> {
  scopes.add(scope);
  const lease = await acquireSharedAcpProcess({
    options: {
      scope,
      ...(prepare ? { prepare } : {}),
      ...(unaddressedRequests ? { unaddressedRequests } : {}),
      ...(maxSessionsPerProcess !== undefined ? { maxSessionsPerProcess } : {}),
    },
    command,
    initializeRequest: INIT_REQUEST,
  });
  await lease.initialized;
  const spy = makeMember();
  lease.attach(spy.member);
  return { lease, spy };
}

async function openNewSession(lease: AcpSharedProcessLease): Promise<string> {
  const opened = await lease.openNew(() =>
    lease.connection.newSession({ cwd: process.cwd(), mcpServers: [] }),
  );
  return opened.sessionId;
}

async function prompt(lease: AcpSharedProcessLease, sessionId: string, text: string) {
  return lease.connection.prompt({
    sessionId,
    prompt: [{ type: "text", text }],
  });
}

function prepareSpy(key = "prepare-1") {
  const calls = { materialize: 0, cleanup: 0 };
  const prepare: AcpSharedProcessPrepare = {
    key,
    materialize: async () => {
      calls.materialize++;
      const dir = await tempDir("acp-shared-prepare-");
      return {
        env: { SHARED_TEST_OVERLAY: dir },
        cleanup: async () => {
          calls.cleanup++;
          await rm(dir, { recursive: true, force: true });
        },
      };
    },
  };
  return { calls, prepare };
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function sharedTmpDirs(): Promise<string[]> {
  return (await readdir(tmpdir()).catch(() => [] as string[])).filter((name) =>
    name.startsWith("poracode-acp-shared-"),
  );
}

afterEach(async () => {
  for (const scope of scopes) {
    await shutdownSharedAcpProcesses(scope).catch(() => undefined);
  }
  scopes.clear();
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

describe("acquireSharedAcpProcess", () => {
  it("shares one process and one initialize across identical specs", async () => {
    const scope = "share-basic";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const command = agentCommand({ FAKE_SHARED_INIT_MARKER: initMarker });

    const first = await acquireAttached(scope, command);
    const second = await acquireAttached(scope, command);
    const sessionA = await openNewSession(first.lease);
    const sessionB = await openNewSession(second.lease);
    expect(sessionA).not.toBe(sessionB);

    // The pre-response session/update for each new session reached its own
    // member only.
    expect(updateTexts(first.spy)).toContain(`open:${sessionA}`);
    expect(updateTexts(first.spy)).not.toContain(`open:${sessionB}`);
    expect(updateTexts(second.spy)).toContain(`open:${sessionB}`);
    expect(updateTexts(second.spy)).not.toContain(`open:${sessionA}`);

    const [replyA, replyB] = await Promise.all([
      prompt(first.lease, sessionA, "alpha"),
      prompt(second.lease, sessionB, "beta"),
    ]);
    expect(replyA.stopReason).toBe("end_turn");
    expect(replyB.stopReason).toBe("end_turn");
    expect(updateTexts(first.spy)).toContain(`echo:${sessionA}:alpha`);
    expect(updateTexts(first.spy)).not.toContain("beta");
    expect(updateTexts(second.spy)).toContain(`echo:${sessionB}:beta`);
    expect(updateTexts(second.spy)).not.toContain("alpha");

    // One process, one initialize for both sessions.
    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(1);

    await first.lease.release();
    await second.lease.release();
    const pids = inits.map((line) => (JSON.parse(line) as { pid: number }).pid);
    expect(processAlive(pids[0]!)).toBe(false);
  }, 30_000);

  it("routes session/load replay only to the loading member", async () => {
    const scope = "share-load";
    const command = agentCommand({});

    const first = await acquireAttached(scope, command);
    const second = await acquireAttached(scope, command);
    await openNewSession(first.lease);

    // A load replays history for the addressed id while another member's
    // session is live on the same process: the replay must not leak.
    await second.lease.openKnown("s-9", () =>
      second.lease.connection.loadSession({
        sessionId: "s-9",
        cwd: process.cwd(),
        mcpServers: [],
      }),
    );

    expect(updateTexts(second.spy)).toContain("replay:s-9");
    expect(updateTexts(first.spy)).not.toContain("replay:s-9");

    await first.lease.release();
    await second.lease.release();
  }, 30_000);

  it("spawns separate processes for different env, args, or prepare keys", async () => {
    const scope = "share-split";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const base = agentCommand({ FAKE_SHARED_INIT_MARKER: initMarker });

    const { calls: callsA, prepare: prepareA } = prepareSpy("key-a");
    const { calls: callsB, prepare: prepareB } = prepareSpy("key-b");

    const envVariant = await acquireAttached(scope, {
      ...base,
      env: { ...base.env, SHARED_TEST_TAG: "one" },
    });
    const argsVariant = await acquireAttached(scope, {
      ...base,
      args: [...base.args, "--extra-arg"],
    });
    const prepareVariant = await acquireAttached(scope, base, prepareA);
    const prepareVariantB = await acquireAttached(scope, base, prepareB);

    // env, args, and each prepare key all produced their own process.
    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(4);
    expect(callsA.materialize).toBe(1);
    expect(callsB.materialize).toBe(1);

    await envVariant.lease.release();
    await argsVariant.lease.release();
    await prepareVariant.lease.release();
    await prepareVariantB.lease.release();
    expect(callsA.cleanup).toBe(1);
    expect(callsB.cleanup).toBe(1);
  }, 30_000);

  it("shares one process when env differs only in dropped bookkeeping or symlinked PATH entries", async () => {
    const scope = "share-envnorm";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const realPathDir = join(dir, "real-bin");
    const linkPathDir = join(dir, "link-bin");
    await mkdir(realPathDir);
    await symlink(realPathDir, linkPathDir, process.platform === "win32" ? "junction" : "dir");
    const base = agentCommand({ FAKE_SHARED_INIT_MARKER: initMarker });

    // Two shell probes of the same project: identical exported env, different
    // per-instance bookkeeping and a PATH entry that is a symlink to the same
    // real directory.
    const probeA = await acquireAttached(scope, {
      ...base,
      env: {
        ...base.env,
        PWD: "/probe/a",
        OLDPWD: "/probe/old-a",
        SHLVL: "1",
        _: "/probe/a/cmd",
        DIRENV_DIFF: "eJwBAAAAAAAA",
        DIRENV_DIR: "/probe/a",
        DIRENV_FILE: "/probe/a/.envrc",
        DIRENV_WATCHES: "/probe/a/.envrc",
        STARSHIP_SESSION_KEY: "session-a",
        FNM_MULTISHELL_PATH: "/fnm/a",
        PATH: linkPathDir,
      },
    });
    const probeB = await acquireAttached(scope, {
      ...base,
      env: {
        ...base.env,
        PWD: "/probe/b",
        OLDPWD: "/probe/old-b",
        SHLVL: "2",
        _: "/probe/b/cmd",
        DIRENV_DIFF: "eJwBAAAAAAAB",
        DIRENV_DIR: "/probe/b",
        DIRENV_FILE: "/probe/b/.envrc",
        DIRENV_WATCHES: "/probe/b/.envrc",
        STARSHIP_SESSION_KEY: "session-b",
        FNM_MULTISHELL_PATH: "/fnm/b",
        PATH: realPathDir,
      },
    });

    expect(await readMarker(initMarker)).toHaveLength(1);

    await probeA.lease.release();
    await probeB.lease.release();
  }, 30_000);

  it("splits processes on kept env values or PATH entries resolving to different real dirs", async () => {
    const scope = "share-envsplit";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const pathDirA = join(dir, "path-a");
    const pathDirB = join(dir, "path-b");
    await mkdir(pathDirA);
    await mkdir(pathDirB);
    const base = agentCommand({ FAKE_SHARED_INIT_MARKER: initMarker });

    const shared = await acquireAttached(scope, {
      ...base,
      env: { ...base.env, PATH: pathDirA },
    });
    // A kept exported variable still splits the pool.
    const ghVariant = await acquireAttached(scope, {
      ...base,
      env: { ...base.env, PATH: pathDirA, GH_TOKEN: "project-token" },
    });
    // A PATH entry that resolves to a different real directory splits too.
    const pathVariant = await acquireAttached(scope, {
      ...base,
      env: { ...base.env, PATH: pathDirB },
    });

    expect(await readMarker(initMarker)).toHaveLength(3);

    await shared.lease.release();
    await ghVariant.lease.release();
    await pathVariant.lease.release();
  }, 30_000);

  it("releases a hanging-prompt member with cancel+close for its id only", async () => {
    const scope = "share-release";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const closeMarker = join(dir, "closed.txt");
    const promptMarker = join(dir, "prompts.jsonl");
    const command = agentCommand({
      FAKE_SHARED_INIT_MARKER: initMarker,
      FAKE_SHARED_CLOSE_MARKER: closeMarker,
      FAKE_SHARED_PROMPT_MARKER: promptMarker,
    });
    const { calls, prepare } = prepareSpy("release-prepare");

    const before = await sharedTmpDirs();
    const hanging = await acquireAttached(scope, command, prepare);
    const working = await acquireAttached(scope, command, prepare);
    const hangSession = await openNewSession(hanging.lease);
    const workSession = await openNewSession(working.lease);

    const hangPrompt = prompt(hanging.lease, hangSession, "hang");
    const workPrompt = prompt(working.lease, workSession, "still-working");
    // Wait until both prompts reached the agent before the release starts.
    await waitForPrompts(promptMarker, [
      [hangSession, "hang"],
      [workSession, "still-working"],
    ]);

    await hanging.lease.release();
    // The hanging prompt was cancelled by the release; it resolves cancelled.
    await expect(hangPrompt).resolves.toMatchObject({ stopReason: "cancelled" });
    // The other member's prompt completed on the still-alive process.
    await expect(workPrompt).resolves.toMatchObject({ stopReason: "end_turn" });
    expect(updateTexts(working.spy)).toContain(`echo:${workSession}:still-working`);

    // Only the hanging session was closed.
    const closed = await readMarker(closeMarker);
    expect(closed).toEqual([hangSession]);

    // Materialize ran once for the shared process; cleanup runs after exit.
    expect(calls.materialize).toBe(1);
    expect(calls.cleanup).toBe(0);

    await working.lease.release();
    expect(calls.cleanup).toBe(1);
    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(1);
    const pid = (JSON.parse(inits[0]!) as { pid: number }).pid;
    expect(processAlive(pid)).toBe(false);
    // The private process cwd was removed exactly once.
    const after = await sharedTmpDirs();
    expect(after.sort()).toEqual(before.sort());
  }, 30_000);

  it("escalates to process termination when close never succeeds", async () => {
    const scope = "share-escalate";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const promptMarker = join(dir, "prompts.jsonl");
    const command = agentCommand({
      FAKE_SHARED_INIT_MARKER: initMarker,
      FAKE_SHARED_PROMPT_MARKER: promptMarker,
      FAKE_CLOSE_ALWAYS_FAILS: "1",
    });

    const first = await acquireAttached(scope, command);
    const second = await acquireAttached(scope, command);
    const sessionA = await openNewSession(first.lease);
    await openNewSession(second.lease);
    void prompt(first.lease, sessionA, "hang");
    await waitForPrompts(promptMarker, [[sessionA, "hang"]]);
    // The member still reports agent work (for example a cancel the agent
    // ignored): a failed close must escalate to killing the process.
    first.spy.work.value = true;

    // Close retries for ~5s then escalates: the whole process is terminated
    // and the surviving member is notified of the transport close.
    await first.lease.release();
    expect(second.spy.transportClosed.length).toBe(1);

    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(1);
    const pid = (JSON.parse(inits[0]!) as { pid: number }).pid;
    expect(processAlive(pid)).toBe(false);

    // A new acquire on the same spec spawns a fresh process (the dead entry
    // was evicted).
    const fresh = await acquireAttached(scope, command);
    await fresh.lease.release();
    const initsAfter = await readMarker(initMarker);
    expect(initsAfter).toHaveLength(2);
  }, 30_000);

  it("escalates when session/close never answers instead of hanging forever", async () => {
    const scope = "share-close-hangs";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const promptMarker = join(dir, "prompts.jsonl");
    const command = agentCommand({
      FAKE_SHARED_INIT_MARKER: initMarker,
      FAKE_SHARED_PROMPT_MARKER: promptMarker,
      FAKE_CLOSE_HANGS: "1",
    });

    const first = await acquireAttached(scope, command);
    const second = await acquireAttached(scope, command);
    const sessionA = await openNewSession(first.lease);
    await openNewSession(second.lease);
    const hangPrompt = prompt(first.lease, sessionA, "hang");
    await waitForPrompts(promptMarker, [[sessionA, "hang"]]);
    // The member still reports agent work, so the failed close escalates to
    // process termination instead of quarantining the session ids.
    first.spy.work.value = true;

    // cancel resolves the prompt, but close never answers: each RPC is raced
    // against the ~5s deadline, then the process is terminated.
    const started = Date.now();
    await first.lease.release();
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(4_000);
    expect(elapsed).toBeLessThan(15_000);
    await expect(hangPrompt).resolves.toMatchObject({ stopReason: "cancelled" });
    expect(second.spy.transportClosed.length).toBe(1);

    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(1);
    const pid = (JSON.parse(inits[0]!) as { pid: number }).pid;
    expect(processAlive(pid)).toBe(false);
    await second.lease.release();
  }, 30_000);

  it("quarantines a settled member when close hangs instead of killing the process", async () => {
    const scope = "share-quarantine";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const command = agentCommand({
      FAKE_SHARED_INIT_MARKER: initMarker,
      FAKE_CLOSE_HANGS: "1",
    });

    const first = await acquireAttached(scope, command);
    const second = await acquireAttached(scope, command);
    const sessionA = await openNewSession(first.lease);
    const sessionB = await openNewSession(second.lease);
    // A's turn settles normally before its release.
    await prompt(first.lease, sessionA, "alpha");
    expect(updateTexts(first.spy)).toContain(`echo:${sessionA}:alpha`);

    // Close never answers: after the ~5s deadline the pool abandons A's
    // session ids and drains the entry rather than terminating the process.
    await first.lease.release();
    expect(first.spy.transportClosed).toHaveLength(0);

    // B keeps working on the still-alive process.
    await prompt(second.lease, sessionB, "bravo");
    expect(updateTexts(second.spy)).toContain(`echo:${sessionB}:bravo`);

    // Late traffic for A's abandoned session: the notification drops
    // silently and the permission request is answered cancelled — the
    // fixture echoes that outcome into B's relay turn.
    await prompt(second.lease, sessionB, `relay:${sessionA}`);
    const relayUpdates = updateTexts(second.spy);
    expect(relayUpdates).toContain("relay:");
    expect(relayUpdates).toContain("cancelled");
    expect(relayUpdates).not.toContain(`late:${sessionA}`);
    expect(updateTexts(first.spy)).not.toContain("late:");

    // The drained entry joins nobody: a new acquirer gets a fresh process.
    const third = await acquireAttached(scope, command);
    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(2);
    const pids = inits.map((line) => (JSON.parse(line) as { pid: number }).pid);
    expect(new Set(pids).size).toBe(2);

    // Releasing B retires the quarantined process; releasing the new member
    // retires the second one.
    await second.lease.release();
    await third.lease.release();
    expect(processAlive(pids[0]!)).toBe(false);
    expect(processAlive(pids[1]!)).toBe(false);
  }, 30_000);

  it("caps members per process and rejoins a freed slot", async () => {
    const scope = "share-cap";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const command = agentCommand({ FAKE_SHARED_INIT_MARKER: initMarker });

    // Three concurrent acquirers with a cap of two: two processes with
    // distinct pids serve them.
    const [a, b, c] = await Promise.all([
      acquireAttached(scope, command, undefined, undefined, 2),
      acquireAttached(scope, command, undefined, undefined, 2),
      acquireAttached(scope, command, undefined, undefined, 2),
    ]);
    let inits = await readMarker(initMarker);
    expect(inits).toHaveLength(2);
    const pids = inits.map((line) => (JSON.parse(line) as { pid: number }).pid);
    expect(new Set(pids).size).toBe(2);

    // Releasing one member of the full first process frees its slot: the
    // next acquirer joins that process instead of spawning a third.
    await a.lease.release();
    const d = await acquireAttached(scope, command, undefined, undefined, 2);
    inits = await readMarker(initMarker);
    expect(inits).toHaveLength(2);

    await b.lease.release();
    await c.lease.release();
    await d.lease.release();
  }, 30_000);

  it("routes unaddressed requests across working members that share a route key", async () => {
    const scope = "share-routekey";
    const command = agentCommand({});

    const first = await acquireAttached(scope, command, undefined, "single-active-session");
    const second = await acquireAttached(scope, command, undefined, "single-active-session");
    const sessionA = await openNewSession(first.lease);
    const sessionB = await openNewSession(second.lease);

    first.spy.work.value = true;
    second.spy.work.value = true;
    first.spy.routeKey.value = "posix:/same/project";
    second.spy.routeKey.value = "posix:/same/project";

    // Equal defined keys mean every working member answers the unaddressed
    // request identically, so it routes to the first working member.
    await prompt(first.lease, sessionA, "diag");
    expect(first.spy.extMethods).toHaveLength(1);
    expect(first.spy.extMethods[0]!.method).toBe("_test/diagnostics");
    expect(second.spy.extMethods).toHaveLength(0);
    expect(updateTexts(first.spy)).toContain("diag:");

    // Different keys leave no safe attribution: methodNotFound.
    second.spy.routeKey.value = "posix:/other/project";
    await prompt(second.lease, sessionB, "diag");
    expect(first.spy.extMethods).toHaveLength(1);
    expect(second.spy.extMethods).toHaveLength(0);
    expect(updateTexts(second.spy)).toContain("-32601");

    await first.lease.release();
    await second.lease.release();
  }, 30_000);

  it("keeps a same-tick joining acquirer alive when the last member releases", async () => {
    const scope = "share-join-race";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const command = agentCommand({ FAKE_SHARED_INIT_MARKER: initMarker });

    const first = await acquireAttached(scope, command);
    // Session-less lease L1: the join reserves its member record
    // synchronously, so L1's release in the same tick must not drain and
    // terminate the process out from under the joiner.
    const joining = acquireSharedAcpProcess({
      options: { scope },
      command,
      initializeRequest: INIT_REQUEST,
    });
    const releasePromise = first.lease.release();
    const secondLease = await joining;
    await releasePromise;
    await secondLease.initialized;
    const spy = makeMember();
    secondLease.attach(spy.member);

    const sessionId = await openNewSession(secondLease);
    await prompt(secondLease, sessionId, "joined");
    expect(updateTexts(spy)).toContain(`echo:${sessionId}:joined`);

    // The joiner rode the same live process — exactly one initialize total.
    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(1);
    await secondLease.release();
  }, 30_000);

  it("shutdown terminates an entry drained by a missing close capability", async () => {
    const scope = "share-no-close-cap";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const command = agentCommand({
      FAKE_SHARED_INIT_MARKER: initMarker,
      FAKE_NO_CLOSE_CAPABILITY: "1",
    });
    const { calls, prepare } = prepareSpy("no-close-cap");

    const { lease, spy } = await acquireAttached(scope, command, prepare);
    await openNewSession(lease);

    // Initialize succeeded without sessionCapabilities.close: the entry
    // drained (no new members may join) but the process stayed alive for
    // this member — shutdown must still find and terminate it.
    await shutdownSharedAcpProcesses(scope);
    expect(spy.transportClosed.length).toBe(1);
    expect(calls.materialize).toBe(1);
    expect(calls.cleanup).toBe(1);
    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(1);
    const pid = (JSON.parse(inits[0]!) as { pid: number }).pid;
    expect(processAlive(pid)).toBe(false);

    await lease.release();
  }, 30_000);

  it("notifies every member and respawns after a crash", async () => {
    const scope = "share-crash";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const command = agentCommand({ FAKE_SHARED_INIT_MARKER: initMarker });

    const first = await acquireAttached(scope, command);
    const second = await acquireAttached(scope, command);
    const sessionA = await openNewSession(first.lease);
    await openNewSession(second.lease);

    await expect(prompt(first.lease, sessionA, "crash")).rejects.toBeDefined();
    await vi.waitFor(() => {
      expect(first.spy.transportClosed.length).toBe(1);
      expect(second.spy.transportClosed.length).toBe(1);
    });
    // The exit code is best-effort: a transport close can notify before the
    // child's exit event supplies it (same race as the dedicated path).
    expect(first.spy.transportClosed[0] === 1 || first.spy.transportClosed[0] === null).toBe(true);

    const fresh = await acquireAttached(scope, command);
    await fresh.lease.release();
    expect(await readMarker(initMarker)).toHaveLength(2);
    await first.lease.release().catch(() => undefined);
    await second.lease.release().catch(() => undefined);
  }, 30_000);

  it("routes unaddressed requests by the single-active-session policy", async () => {
    const scope = "share-unaddressed";
    const command = agentCommand({});

    const idle = await acquireAttached(scope, command, undefined, "single-active-session");
    const working = await acquireAttached(scope, command, undefined, "single-active-session");
    const idleSession = await openNewSession(idle.lease);
    const workSession = await openNewSession(working.lease);

    working.spy.work.value = true;
    await prompt(working.lease, workSession, "diag");
    expect(working.spy.extMethods).toHaveLength(1);
    expect(working.spy.extMethods[0]!.method).toBe("_test/diagnostics");
    expect(working.spy.extMethods[0]!.params).toEqual({});
    expect(updateTexts(working.spy)).toContain('diag:{\\"result\\":{\\"ok\\":true}}');
    expect(idle.spy.extMethods).toHaveLength(0);
    expect(updateTexts(idle.spy)).not.toContain("diag:");

    // Two working members → methodNotFound, nobody's extMethod runs.
    idle.spy.work.value = true;
    working.spy.work.value = true;
    await prompt(idle.lease, idleSession, "diag");
    expect(idle.spy.extMethods).toHaveLength(0);
    expect(updateTexts(idle.spy)).toContain("-32601");

    await idle.lease.release();
    await working.lease.release();
  }, 30_000);

  it("rejects unaddressed requests by default", async () => {
    const scope = "share-unaddressed-default";
    const command = agentCommand({});
    const { lease, spy } = await acquireAttached(scope, command);
    const sessionId = await openNewSession(lease);
    spy.work.value = true;

    await prompt(lease, sessionId, "diag");
    expect(spy.extMethods).toHaveLength(0);
    expect(updateTexts(spy)).toContain("-32601");
    await lease.release();
  }, 30_000);

  it("rejects joined members when initialize fails and evicts the entry", async () => {
    const scope = "share-init-fail";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const command = agentCommand({
      FAKE_SHARED_INIT_MARKER: initMarker,
      FAKE_FAIL_INITIALIZE: "1",
    });

    const first = acquireSharedAcpProcess({
      options: { scope },
      command,
      initializeRequest: INIT_REQUEST,
    });
    const second = acquireSharedAcpProcess({
      options: { scope },
      command,
      initializeRequest: INIT_REQUEST,
    });
    scopes.add(scope);
    const [leaseA, leaseB] = await Promise.all([first, second]);
    await expect(leaseA.initialized).rejects.toBeDefined();
    await expect(leaseB.initialized).rejects.toBeDefined();
    // Both joined members share the single initialize attempt.
    expect(await readMarker(initMarker)).toHaveLength(1);

    await leaseA.release();
    await leaseB.release();

    // The failed entry was evicted: a new acquire spawns a fresh process,
    // which also fails initialize (marker grows).
    const fresh = await acquireSharedAcpProcess({
      options: { scope },
      command,
      initializeRequest: INIT_REQUEST,
    });
    await expect(fresh.initialized).rejects.toBeDefined();
    await fresh.release();
    expect(await readMarker(initMarker)).toHaveLength(2);
  }, 30_000);

  it("keeps sibling sessions when a member of a no-close process releases", async () => {
    const scope = "share-no-close-release";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const command = agentCommand({
      FAKE_SHARED_INIT_MARKER: initMarker,
      FAKE_NO_CLOSE_CAPABILITY: "1",
      FAKE_SHARED_INIT_DELAY_MS: "300",
    });

    // Both members join while initialize is still pending, so neither has
    // seen the agent's capabilities yet.
    const [first, second] = await Promise.all([
      acquireAttached(scope, command),
      acquireAttached(scope, command),
    ]);
    await openNewSession(first.lease);
    const sessionB = await openNewSession(second.lease);

    // Releasing the idle first member must not kill the sibling's session.
    await first.lease.release();
    expect(first.spy.transportClosed).toHaveLength(0);
    expect(second.spy.transportClosed).toHaveLength(0);

    await prompt(second.lease, sessionB, "still-alive");
    expect(updateTexts(second.spy)).toContain(`echo:${sessionB}:still-alive`);

    await second.lease.release();
    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(1);
    const pid = (JSON.parse(inits[0]!) as { pid: number }).pid;
    expect(processAlive(pid)).toBe(false);
  }, 30_000);

  it("terminates a no-close process when the releasing member's turn ignores cancel", async () => {
    const scope = "share-no-close-unsettled";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const promptMarker = join(dir, "prompts.jsonl");
    const command = agentCommand({
      FAKE_SHARED_INIT_MARKER: initMarker,
      FAKE_SHARED_PROMPT_MARKER: promptMarker,
      FAKE_NO_CLOSE_CAPABILITY: "1",
      FAKE_IGNORE_CANCEL: "1",
      FAKE_SHARED_INIT_DELAY_MS: "300",
    });

    // Both members must join while initialize is pending: a no-close agent
    // drains its entry once capabilities resolve, so a later acquire would
    // spawn a second process instead of sharing this one.
    const [first, second] = await Promise.all([
      acquireAttached(scope, command),
      acquireAttached(scope, command),
    ]);
    const sessionA = await openNewSession(first.lease);
    await openNewSession(second.lease);

    // The agent ignores session/cancel: the hang prompt never settles and
    // the member still reports agent work at release time.
    const hangPrompt = prompt(first.lease, sessionA, "hang");
    hangPrompt.catch(() => undefined);
    await waitForPrompts(promptMarker, [[sessionA, "hang"]]);
    first.spy.work.value = true;

    // Cancel is ignored and the deadline lapses with work outstanding, so
    // the process is terminated and the sibling member sees the close.
    await first.lease.release();
    await vi.waitFor(() => expect(second.spy.transportClosed.length).toBe(1), {
      timeout: 10_000,
    });

    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(1);
    const pid = (JSON.parse(inits[0]!) as { pid: number }).pid;
    expect(processAlive(pid)).toBe(false);
    await second.lease.release().catch(() => undefined);
  }, 30_000);

  it("waits for initialize before deciding a release", async () => {
    const scope = "share-init-wait-release";
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const command = agentCommand({
      FAKE_SHARED_INIT_MARKER: initMarker,
      FAKE_SHARED_INIT_DELAY_MS: "400",
    });

    const firstPromise = acquireSharedAcpProcess({
      options: { scope },
      command,
      initializeRequest: INIT_REQUEST,
    });
    const secondPromise = acquireSharedAcpProcess({
      options: { scope },
      command,
      initializeRequest: INIT_REQUEST,
    });
    scopes.add(scope);
    const [leaseA, leaseB] = await Promise.all([firstPromise, secondPromise]);
    const spyA = makeMember();
    const spyB = makeMember();
    leaseA.attach(spyA.member);
    leaseB.attach(spyB.member);

    // Release A while initialize is still in flight: the release must wait
    // for capabilities instead of reading the pending flag as "no close".
    await leaseA.release();

    await leaseB.initialized;
    const sessionB = await openNewSession(leaseB);
    await prompt(leaseB, sessionB, "still-alive");
    expect(updateTexts(spyB)).toContain(`echo:${sessionB}:still-alive`);
    expect(spyA.transportClosed).toHaveLength(0);
    expect(spyB.transportClosed).toHaveLength(0);

    // The process stayed alive for B and dies with its last release.
    await leaseB.release();
    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(1);
    const pid = (JSON.parse(inits[0]!) as { pid: number }).pid;
    expect(processAlive(pid)).toBe(false);
  }, 30_000);

  it("routes a request-scoped elicitation only to the prompting member", async () => {
    const scope = "share-elicit-request";
    const command = agentCommand({});

    const first = await acquireAttached(scope, command);
    const second = await acquireAttached(scope, command);
    const sessionA = await openNewSession(first.lease);
    const sessionB = await openNewSession(second.lease);

    first.spy.elicitResponse.value = {
      action: "accept",
      content: { answer: "answer-from-A" },
    };
    second.spy.elicitResponse.value = {
      action: "accept",
      content: { answer: "answer-from-B" },
    };

    // The fixture sends elicitation/create with requestId = the session/prompt
    // id and no sessionId: attribution comes from the in-flight request.
    await prompt(first.lease, sessionA, "elicit-by-request");
    expect(first.spy.elicitations).toHaveLength(1);
    expect(second.spy.elicitations).toHaveLength(0);
    expect(updateTexts(first.spy)).toContain("answer-from-A");
    expect(updateTexts(first.spy)).not.toContain("answer-from-B");

    // A session-scoped elicitation reaches only the owning member too.
    await prompt(second.lease, sessionB, "elicit-addressed");
    expect(second.spy.elicitations).toHaveLength(1);
    expect(first.spy.elicitations).toHaveLength(1);
    expect(updateTexts(second.spy)).toContain("answer-from-B");
    expect(updateTexts(second.spy)).not.toContain("answer-from-A");

    await first.lease.release();
    await second.lease.release();
  }, 30_000);

  it("routes a session/new-scoped elicitation to the member opening the session", async () => {
    const scope = "share-elicit-on-new";
    const command = agentCommand({ FAKE_ELICIT_ON_NEW: "1" });

    const first = await acquireAttached(scope, command);
    const second = await acquireAttached(scope, command);
    first.spy.elicitResponse.value = {
      action: "accept",
      content: { answer: "new-A" },
    };
    second.spy.elicitResponse.value = {
      action: "accept",
      content: { answer: "new-B" },
    };

    // Each session/new triggers its own request-scoped elicitation before
    // responding; the echoed answer proves which member was asked.
    await Promise.all([openNewSession(first.lease), openNewSession(second.lease)]);
    expect(first.spy.elicitations).toHaveLength(1);
    expect(second.spy.elicitations).toHaveLength(1);
    expect(updateTexts(first.spy)).toContain("new-A");
    expect(updateTexts(first.spy)).not.toContain("new-B");
    expect(updateTexts(second.spy)).toContain("new-B");
    expect(updateTexts(second.spy)).not.toContain("new-A");

    await first.lease.release();
    await second.lease.release();
  }, 30_000);

  it("rejects an unattributable elicitation and delivers completion to every member", async () => {
    const scope = "share-elicit-unattributed";
    const command = agentCommand({});

    const first = await acquireAttached(scope, command);
    const second = await acquireAttached(scope, command);
    const sessionA = await openNewSession(first.lease);
    await openNewSession(second.lease);

    // requestId "no-such-request" with no sessionId cannot be attributed:
    // the agent gets an invalid-params error and nobody's handler runs.
    await prompt(first.lease, sessionA, "elicit-unattributed");
    expect(first.spy.elicitations).toHaveLength(0);
    expect(second.spy.elicitations).toHaveLength(0);
    expect(updateTexts(first.spy)).toContain("cannot be attributed");

    // An elicitation/complete notification carries only an elicitationId:
    // every attached member sees it and matches the id it owns.
    await prompt(first.lease, sessionA, "elicit-complete");
    await vi.waitFor(() => {
      expect(first.spy.completes).toHaveLength(1);
      expect(second.spy.completes).toHaveLength(1);
    });
    expect(first.spy.completes[0]).toMatchObject({ elicitationId: "elicit-done" });
    expect(second.spy.completes[0]).toMatchObject({ elicitationId: "elicit-done" });
    expect(updateTexts(first.spy)).toContain("complete-sent");

    await first.lease.release();
    await second.lease.release();
  }, 30_000);

  it("refuses agent requests for a member whose release is in progress", async () => {
    const scope = "share-release-in-flight";
    const command = agentCommand({ FAKE_CLOSE_HANGS: "1" });

    const first = await acquireAttached(scope, command);
    const second = await acquireAttached(scope, command);
    const sessionA = await openNewSession(first.lease);
    const sessionB = await openNewSession(second.lease);

    // session/close never answers, so A's release stays inside its close
    // window: released is already set while A's session ids remain
    // registered until the quarantine tail runs.
    const releasePromise = first.lease.release();

    // B relays a permission request addressed to A's still-registered
    // session: the pool must answer it as closed instead of delivering it
    // to the member whose dispose already ran.
    await prompt(second.lease, sessionB, `relay:${sessionA}`);
    expect(updateTexts(second.spy)).toContain("cancelled");
    expect(first.spy.permissions).toHaveLength(0);

    // The release finishes on the quarantine path once the deadline lapses.
    await releasePromise;
    expect(first.spy.transportClosed).toHaveLength(0);

    // B keeps working on the surviving process.
    await prompt(second.lease, sessionB, "after-release");
    expect(updateTexts(second.spy)).toContain(`echo:${sessionB}:after-release`);

    await second.lease.release();
  }, 30_000);

  it("refuses a request-scoped elicitation tied to a released member's session/new", async () => {
    const scope = "share-elicit-released-new";
    const command = agentCommand({});

    const first = await acquireAttached(scope, command);
    const second = await acquireAttached(scope, command);
    const sessionA = await openNewSession(first.lease);
    const sessionB = await openNewSession(second.lease);

    // A fully releases: its session closes and unregisters, but its
    // session/new request id stays attributed to the released record for
    // the life of the entry.
    await first.lease.release();

    // The fixture sends elicitation/create with requestId = sessionA's
    // session/new id and no sessionId: attribution would resolve to the
    // released member, so the pool must refuse it like an unknown one.
    await prompt(second.lease, sessionB, `elicit-for-new:${sessionA}`);
    expect(first.spy.elicitations).toHaveLength(0);
    expect(second.spy.elicitations).toHaveLength(0);
    expect(updateTexts(second.spy)).toContain("cannot be attributed");

    await second.lease.release();
  }, 30_000);
});

describe("createSharedAcpStructuredSession", () => {
  it("runs two sessions on one process with isolated listeners", async () => {
    const scope = "share-session-it";
    scopes.add(scope);
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const promptMarker = join(dir, "prompts.jsonl");
    const command = agentCommand({
      FAKE_SHARED_INIT_MARKER: initMarker,
      FAKE_SHARED_PROMPT_MARKER: promptMarker,
    });
    const input = {
      threadId: "unused",
      projectLocation: projectLocation(),
      config: { model: "fake" },
      presentationMode: "gui" as const,
    };

    const sessionA = await createSharedAcpStructuredSession(
      command,
      { ...input, threadId: "thread-a" },
      { scope },
    );
    const sessionB = await createSharedAcpStructuredSession(
      command,
      { ...input, threadId: "thread-b" },
      { scope },
    );
    expect(sessionA).toBeDefined();
    expect(sessionB).toBeDefined();

    const eventsA: unknown[] = [];
    const eventsB: unknown[] = [];
    const errorsA: string[] = [];
    const errorsB: string[] = [];
    sessionA!.setListener({
      onUpdate: () => {},
      onRuntimeEvent: (event) => eventsA.push(event),
      onError: (message) => errorsA.push(message),
      onClose: () => {},
    });
    sessionB!.setListener({
      onUpdate: () => {},
      onRuntimeEvent: (event) => eventsB.push(event),
      onError: (message) => errorsB.push(message),
      onClose: () => {},
    });

    await Promise.all([sessionA!.activate(), sessionB!.activate()]);
    const [sessionIdA, sessionIdB] = await Promise.all([
      sessionA!.openThread({ model: "fake" }),
      sessionB!.openThread({ model: "fake" }),
    ]);
    expect(sessionIdA).not.toBe(sessionIdB);

    const turnA = sessionA!.startTurn("alpha", { model: "fake" });
    const turnB = sessionB!.startTurn("beta", { model: "fake" });
    await Promise.all([turnA, turnB]);

    const textA = JSON.stringify(eventsA);
    const textB = JSON.stringify(eventsB);
    expect(textA).toContain("alpha");
    expect(textA).not.toContain("beta");
    expect(textB).toContain("beta");
    expect(textB).not.toContain("alpha");
    expect(errorsA).toHaveLength(0);
    expect(errorsB).toHaveLength(0);

    // One process, one initialize for both structured sessions.
    expect(await readMarker(initMarker)).toHaveLength(1);

    // Dispose A mid-turn while B's turn is in flight; B completes normally.
    const hangingTurn = sessionA!.startTurn("hang", { model: "fake" });
    const workingTurn = sessionB!.startTurn("gamma", { model: "fake" });
    // Wait until both turns reached the agent before disposing A.
    await waitForPrompts(promptMarker, [
      [sessionIdA, "hang"],
      [sessionIdB, "gamma"],
    ]);
    await sessionA!.dispose();
    await workingTurn;
    await hangingTurn.catch(() => undefined);
    expect(JSON.stringify(eventsB)).toContain("gamma");
    expect(errorsB).toHaveLength(0);

    await sessionB!.dispose();
    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(1);
    const pid = (JSON.parse(inits[0]!) as { pid: number }).pid;
    expect(processAlive(pid)).toBe(false);
  }, 30_000);

  it("closes an idle member quietly when the shared process dies mid-turn for another", async () => {
    const scope = "share-quiet-close";
    scopes.add(scope);
    const command = agentCommand({ FAKE_SELF_DESTRUCT_MS: "60000" });
    const input = {
      threadId: "unused",
      projectLocation: projectLocation(),
      config: { model: "fake" },
      presentationMode: "gui" as const,
    };

    const sessionA = await createSharedAcpStructuredSession(
      command,
      { ...input, threadId: "thread-a" },
      { scope },
    );
    const sessionB = await createSharedAcpStructuredSession(
      command,
      { ...input, threadId: "thread-b" },
      { scope },
    );

    let closedA = 0;
    const errorsA: string[] = [];
    let closedB = 0;
    const errorsB: string[] = [];
    sessionA!.setListener({
      onUpdate: () => {},
      onRuntimeEvent: () => {},
      onError: (message) => errorsA.push(message),
      onClose: () => {
        closedA++;
      },
    });
    sessionB!.setListener({
      onUpdate: () => {},
      onRuntimeEvent: () => {},
      onError: (message) => errorsB.push(message),
      onClose: () => {
        closedB++;
      },
    });

    await Promise.all([sessionA!.activate(), sessionB!.activate()]);
    await Promise.all([
      sessionA!.openThread({ model: "fake" }),
      sessionB!.openThread({ model: "fake" }),
    ]);
    // A completes a turn so it is genuinely idle (no prompt, orphan turn, or
    // awaited subagents) when the process dies.
    await sessionA!.startTurn("alpha", { model: "fake" });

    // B is mid-turn when the agent crashes; A has no agent work in flight.
    const turnB = sessionB!.startTurn("crash", { model: "fake" });
    turnB.catch(() => undefined);
    await vi.waitFor(
      () => {
        expect(closedA).toBe(1);
        expect(closedB).toBe(1);
      },
      { timeout: 10_000 },
    );

    // The idle member closed without an error; the working member kept the
    // unexpected-exit report.
    expect(errorsA).toHaveLength(0);
    expect(errorsB.some((message) => message.includes("unexpected"))).toBe(true);

    await sessionA!.dispose();
    await sessionB!.dispose();
  }, 30_000);

  it("terminates the shared process when a released member's turn survives cancel", async () => {
    const scope = "share-terminate-unsettled";
    scopes.add(scope);
    const dir = await tempDir("acp-shared-test-");
    const initMarker = join(dir, "init.jsonl");
    const promptMarker = join(dir, "prompts.jsonl");
    const command = agentCommand({
      FAKE_SHARED_INIT_MARKER: initMarker,
      FAKE_SHARED_PROMPT_MARKER: promptMarker,
      // The agent ignores session/cancel (the prompt never settles) and
      // refuses session/close, so only killing the process stops the turn.
      FAKE_IGNORE_CANCEL: "1",
      FAKE_CLOSE_ALWAYS_FAILS: "1",
    });
    const input = {
      threadId: "unused",
      projectLocation: projectLocation(),
      config: { model: "fake" },
      presentationMode: "gui" as const,
    };

    const sessionA = await createSharedAcpStructuredSession(
      command,
      { ...input, threadId: "thread-a" },
      { scope },
    );
    const sessionB = await createSharedAcpStructuredSession(
      command,
      { ...input, threadId: "thread-b" },
      { scope },
    );

    let closedB = 0;
    const errorsB: string[] = [];
    sessionA!.setListener({
      onUpdate: () => {},
      onRuntimeEvent: () => {},
      onError: () => {},
      onClose: () => {},
    });
    sessionB!.setListener({
      onUpdate: () => {},
      onRuntimeEvent: () => {},
      onError: (message) => errorsB.push(message),
      onClose: () => {
        closedB++;
      },
    });

    await Promise.all([sessionA!.activate(), sessionB!.activate()]);
    const [sessionIdA] = await Promise.all([
      sessionA!.openThread({ model: "fake" }),
      sessionB!.openThread({ model: "fake" }),
    ]);
    // B completes a turn so it is genuinely idle when the process dies.
    await sessionB!.startTurn("beta", { model: "fake" });

    const turnA = sessionA!.startTurn("hang", { model: "fake" });
    turnA.catch(() => undefined);
    // Wait until the hang turn reached the agent before disposing.
    await waitForPrompts(promptMarker, [[sessionIdA, "hang"]]);

    // dispose() releases the lease: cancel is ignored, close keeps failing,
    // and the member still has agent work — the process must be terminated.
    await sessionA!.dispose();
    await vi.waitFor(() => expect(closedB).toBe(1), { timeout: 10_000 });
    // B was idle, so the transport outcome closed it without an error.
    expect(errorsB).toHaveLength(0);

    const inits = await readMarker(initMarker);
    expect(inits).toHaveLength(1);
    const pid = (JSON.parse(inits[0]!) as { pid: number }).pid;
    expect(processAlive(pid)).toBe(false);

    await sessionB!.dispose();
  }, 30_000);
});
