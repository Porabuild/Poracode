// Real process fault fixture for the crash-aware remote command receipt
// protocol. Never imported by a production entry point: the crash test forks
// this module, drives one `runRemoteCommand` over IPC, and SIGKILLs the process
// at a controlled point between the durable receipt writes. The external
// effect is recorded in a separate fsynced file so an effect that survived the
// kill is provably distinct from a receipt that did not.
import { closeSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { initDatabase } from "@/host/db";
import { runRemoteCommand } from "./remoteCommandIdempotency";

const FIXTURE_ROUTE = "/api/threads/t-crash/send";

type FaultPoint = "before-effect" | "after-effect" | "after-receipt";

interface StartRunMessage {
  type: "start";
  commandId: string;
  principalId: string;
  requestPayload: unknown;
  faultPoint?: FaultPoint;
  reconcile?: boolean;
}

function requiredArgument(index: number, name: string): string {
  const value = process.argv[index];
  if (!value) throw new Error(`Missing crash fixture ${name}.`);
  return value;
}

const dbPath = requiredArgument(2, "database path");
const effectPath = requiredArgument(3, "effect log path");
initDatabase(dbPath);

let continueRun: (() => void) | undefined;

function gate(): Promise<void> {
  const pending = Promise.withResolvers<void>();
  continueRun = pending.resolve;
  return pending.promise.finally(() => {
    continueRun = undefined;
  });
}

function effectCount(): number {
  try {
    return readFileSync(effectPath, "utf8")
      .split("\n")
      .filter((line) => line.length > 0).length;
  } catch {
    return 0;
  }
}

/**
 * The durable external effect, outside SQLite and fsynced before it is
 * observed (like a provider or journal record). A resume path that already has
 * journal proof of the effect must not apply it twice; this mirrors the
 * checkpoint journal's "never re-run a completed destructive phase" rule.
 */
function applyEffectOnce(label: string): number {
  const existing = effectCount();
  if (existing > 0) return existing;
  const descriptor = openSync(effectPath, "a");
  try {
    writeSync(descriptor, `${label}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  return effectCount();
}

async function run(message: StartRunMessage): Promise<void> {
  let operationCalls = 0;
  const operation = async (markDispatched: () => void) => {
    operationCalls += 1;
    markDispatched();
    process.send?.({ type: "dispatched" });
    if (message.faultPoint === "before-effect") await gate();
    const effects = applyEffectOnce(message.commandId);
    process.send?.({ type: "effect-applied", effects, operationCalls });
    if (message.faultPoint === "after-effect") await gate();
    return { ok: true, effects };
  };

  try {
    const result = await runRemoteCommand({
      commandId: message.commandId,
      route: FIXTURE_ROUTE,
      principalId: message.principalId,
      requestPayload: message.requestPayload,
      operation,
      ...(message.reconcile ? { reconcileUncertain: () => ({ kind: "resume" as const }) } : {}),
    });
    process.send?.({
      type: "receipt-completed",
      result,
      operationCalls,
      replayed: operationCalls === 0,
    });
    if (message.faultPoint === "after-receipt") await gate();
    process.send?.({ type: "done", result, operationCalls });
  } catch (error) {
    const typed = error as { code?: unknown; status?: unknown };
    process.send?.({
      type: "error",
      code: typeof typed.code === "string" ? typed.code : "unknown",
      status: typeof typed.status === "number" ? typed.status : 0,
      operationCalls,
    });
    process.send?.({ type: "done", operationCalls });
  }
  process.disconnect?.();
}

process.on("message", (message) => {
  if (typeof message !== "object" || message === null) return;
  if ((message as { type?: string }).type === "continue") {
    continueRun?.();
    return;
  }
  void run(message as StartRunMessage);
});

process.send?.({ type: "ready" });
