import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveBetterSqliteNativeBindingOptions } from "@/host/db/connection";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";

const FIXTURE = resolve("src/host/remote/server/remoteCommandIdempotency.crashFixture.ts");
const COMMAND_ID = "crash-cmd-1";
const PRINCIPAL = "session-held";
const PAYLOAD = { text: "hello" };

interface ReceiptRow {
  state: string;
  response: string | null;
  principal_id: string | null;
  request_digest: string | null;
}

interface FixtureMessage {
  type: string;
  code?: string;
  status?: number;
  operationCalls?: number;
  replayed?: boolean;
  result?: unknown;
  effects?: number;
}

interface StartRunInput {
  commandId: string;
  principalId: string;
  requestPayload: unknown;
  faultPoint?: "before-effect" | "after-effect" | "after-receipt";
  reconcile?: boolean;
}

/**
 * Child-process crash evidence for the receipt protocol.
 *
 * The existing close/reopen tests model a crash by reopening the file-backed
 * database; these tests kill a real process with SIGKILL at protocol-controlled
 * points — before the external effect, after the effect but before the
 * completed receipt, and after the receipt — with the external effect recorded
 * in a separate fsynced file. A restarted process (which runs the real startup
 * reconciliation) must report the receipt's true state: a typed uncertain
 * outcome that is never silently re-executed, or a replayed frozen result.
 */
describe.skipIf(!sqliteAvailable)("remote command receipts across real process kills", () => {
  let dir: string;
  let dbPath: string;
  let effectPath: string;
  const children: ChildProcess[] = [];

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = await mkdtemp(join(tmpdir(), "poracode-command-crash-"));
    dbPath = join(dir, "state.sqlite");
    effectPath = join(dir, "effects.log");
  });

  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit");
      }
    }
    await rm(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function readReceipt(): ReceiptRow | undefined {
    const sqlite = new Database(dbPath, resolveBetterSqliteNativeBindingOptions());
    try {
      return sqlite
        .prepare(
          `SELECT state, response, principal_id, request_digest
           FROM remote_command_receipts WHERE command_id = ?`,
        )
        .get(COMMAND_ID) as ReceiptRow | undefined;
    } finally {
      sqlite.close();
    }
  }

  async function effectLines(): Promise<string[]> {
    try {
      return (await readFile(effectPath, "utf8")).split("\n").filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }

  interface Fixture {
    readonly child: ChildProcess;
    start(input: StartRunInput): void;
    next(type: string, timeoutMs?: number): Promise<FixtureMessage>;
    completion: Promise<unknown>;
  }

  function launch(): Fixture {
    const child = fork(FIXTURE, [dbPath, effectPath], {
      execArgv: [
        "--experimental-transform-types",
        "--disable-warning=ExperimentalWarning",
        "--import",
        resolve("scripts/remote-v3-ts-register.mjs"),
      ],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    children.push(child);
    const messages: FixtureMessage[] = [];
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("message", (message) => messages.push(message as FixtureMessage));
    const completion = once(child, "exit");

    function next(type: string, timeoutMs = 20_000): Promise<FixtureMessage> {
      const existing = messages.find((message) => message.type === type);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolveMessage, reject) => {
        const timer = setTimeout(
          () => finish(new Error(`Fixture ${type} timed out: ${stderr}`)),
          timeoutMs,
        );
        const onMessage = (message: FixtureMessage) => {
          if (message.type === type) finish(undefined, message);
        };
        const onExit = () => finish(new Error(`Fixture exited before ${type}: ${stderr}`));
        function finish(error?: Error, message?: FixtureMessage): void {
          clearTimeout(timer);
          child.off("message", onMessage);
          child.off("exit", onExit);
          if (error) reject(error);
          else resolveMessage(message!);
        }
        child.on("message", onMessage);
        child.once("exit", onExit);
      });
    }

    return {
      child,
      start: (input) => {
        child.send({ type: "start", ...input });
      },
      next,
      completion,
    };
  }

  async function kill(fixture: Fixture): Promise<void> {
    fixture.child.kill("SIGKILL");
    await fixture.completion;
  }

  async function startAndAwaitReady(): Promise<Fixture> {
    const fixture = launch();
    await fixture.next("ready");
    return fixture;
  }

  it("kills before the effect: restart reports a bound uncertain outcome and never executes", async () => {
    const first = await startAndAwaitReady();
    first.start({
      commandId: COMMAND_ID,
      principalId: PRINCIPAL,
      requestPayload: PAYLOAD,
      faultPoint: "before-effect",
    });
    await first.next("dispatched");
    await kill(first);

    expect(await effectLines()).toEqual([]);
    const crashed = readReceipt();
    expect(crashed).toMatchObject({ state: "in_progress", principal_id: PRINCIPAL });
    expect(crashed?.request_digest).toMatch(/^[0-9a-f]{64}$/);

    const restarted = await startAndAwaitReady();
    restarted.start({ commandId: COMMAND_ID, principalId: PRINCIPAL, requestPayload: PAYLOAD });
    await expect(restarted.next("error")).resolves.toMatchObject({
      code: "command_outcome_uncertain",
      status: 409,
      operationCalls: 0,
    });
    await restarted.next("done");
    await restarted.completion;

    expect(await effectLines()).toEqual([]);
    expect(readReceipt()).toMatchObject({
      state: "uncertain",
      principal_id: PRINCIPAL,
      request_digest: crashed?.request_digest,
    });
  });

  it("kills after the effect but before the receipt: restart is uncertain, and only a journal reconcile resumes without re-applying", async () => {
    const first = await startAndAwaitReady();
    first.start({
      commandId: COMMAND_ID,
      principalId: PRINCIPAL,
      requestPayload: PAYLOAD,
      faultPoint: "after-effect",
    });
    await first.next("effect-applied");
    await kill(first);

    expect(await effectLines()).toHaveLength(1);
    expect(readReceipt()?.state).toBe("in_progress");

    const restarted = await startAndAwaitReady();
    restarted.start({ commandId: COMMAND_ID, principalId: PRINCIPAL, requestPayload: PAYLOAD });
    await expect(restarted.next("error")).resolves.toMatchObject({
      code: "command_outcome_uncertain",
      status: 409,
      operationCalls: 0,
    });
    await restarted.next("done");
    await restarted.completion;
    expect(await effectLines()).toHaveLength(1);

    // The journal-backed route resumes the same command: the operation re-enters
    // its reconcile path, but the durable effect proves it must not apply again.
    const resumed = await startAndAwaitReady();
    resumed.start({
      commandId: COMMAND_ID,
      principalId: PRINCIPAL,
      requestPayload: PAYLOAD,
      reconcile: true,
    });
    await expect(resumed.next("receipt-completed")).resolves.toMatchObject({
      operationCalls: 1,
      replayed: false,
    });
    await resumed.next("done");
    await resumed.completion;

    expect(await effectLines()).toHaveLength(1);
    expect(readReceipt()).toMatchObject({ state: "completed", principal_id: PRINCIPAL });
  });

  it("kills after the receipt: restart replays the frozen result, while identity or body changes conflict", async () => {
    const first = await startAndAwaitReady();
    first.start({
      commandId: COMMAND_ID,
      principalId: PRINCIPAL,
      requestPayload: PAYLOAD,
      faultPoint: "after-receipt",
    });
    const recorded = await first.next("receipt-completed");
    await kill(first);

    expect(await effectLines()).toHaveLength(1);
    expect(readReceipt()?.state).toBe("completed");
    expect(recorded.replayed).toBe(false);

    const replay = await startAndAwaitReady();
    replay.start({ commandId: COMMAND_ID, principalId: PRINCIPAL, requestPayload: PAYLOAD });
    await expect(replay.next("receipt-completed")).resolves.toMatchObject({
      operationCalls: 0,
      replayed: true,
      result: { ok: true, effects: 1 },
    });
    await replay.next("done");
    await replay.completion;

    // A held principal (session id) may replay; another principal or a changed
    // validated body never sees the cached response.
    const impostor = await startAndAwaitReady();
    impostor.start({
      commandId: COMMAND_ID,
      principalId: "session-other",
      requestPayload: PAYLOAD,
    });
    await expect(impostor.next("error")).resolves.toMatchObject({
      code: "command_id_conflict",
      status: 409,
      operationCalls: 0,
    });
    await impostor.next("done");
    await impostor.completion;

    const changed = await startAndAwaitReady();
    changed.start({
      commandId: COMMAND_ID,
      principalId: PRINCIPAL,
      requestPayload: { text: "different" },
    });
    await expect(changed.next("error")).resolves.toMatchObject({
      code: "command_id_conflict",
      status: 409,
      operationCalls: 0,
    });
    await changed.next("done");
    await changed.completion;

    expect(await effectLines()).toHaveLength(1);
    expect(readReceipt()?.state).toBe("completed");
  });
});
