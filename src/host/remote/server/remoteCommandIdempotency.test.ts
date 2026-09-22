import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabase,
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  initDatabase,
} from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import {
  HOST_RESOURCE_BUSY_CODE,
  HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
  HostResourceAdmissionRefusalError,
  isHostResourceAdmissionRefusal,
} from "@/shared/hostResourceAdmission";
import { RemoteAuthStore, RemoteHttpError } from "../auth";
import {
  canonicalRemoteCommandJson,
  remoteCommandRequestDigest,
  REMOTE_COMMAND_UNCERTAIN_CODE,
  runRemoteCommand,
  type RunRemoteCommandOptions,
} from "./remoteCommandIdempotency";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";

const ROUTE = "/api/threads/t1/send";
const PRINCIPAL = "session-a";
const PAYLOAD = { text: "hello" };
const LEGACY_IDENTITY = { route: ROUTE, principalId: null, requestDigest: null } as const;

function receiptRow(commandId: string) {
  return getSqlite()
    .prepare(
      `SELECT state, response, principal_id, request_digest
       FROM remote_command_receipts WHERE command_id = ?`,
    )
    .get(commandId) as
    | {
        state: string;
        response: string | null;
        principal_id: string | null;
        request_digest: string | null;
      }
    | undefined;
}

describe("remote command request digest", () => {
  it("canonicalizes object key order but not array order", () => {
    expect(canonicalRemoteCommandJson({ b: 1, a: { d: 2, c: [3, 4] } })).toBe(
      canonicalRemoteCommandJson({ a: { c: [3, 4], d: 2 }, b: 1 }),
    );
    expect(canonicalRemoteCommandJson({ a: [1, 2] })).not.toBe(
      canonicalRemoteCommandJson({ a: [2, 1] }),
    );
  });

  it("ignores undefined object members and preserves JSON scalar semantics", () => {
    expect(canonicalRemoteCommandJson({ a: undefined, b: null })).toBe('{"b":null}');
    expect(canonicalRemoteCommandJson({ a: [undefined] })).toBe('{"a":[null]}');
    expect(remoteCommandRequestDigest({ text: "hello" })).toMatch(/^[0-9a-f]{64}$/);
    expect(remoteCommandRequestDigest({ text: "hello" })).not.toBe(
      remoteCommandRequestDigest({ text: "hello!" }),
    );
  });

  it("canonicalizes a parsed JSON object with an own __proto__ key without prototype writes", () => {
    const parsed = JSON.parse(
      '{"__proto__":{"polluted":true},"b":2,"__proto__text":"x"}',
    ) as Record<string, unknown>;
    expect(Object.keys(parsed)).toContain("__proto__");

    expect(canonicalRemoteCommandJson(parsed)).toBe(
      '{"__proto__":{"polluted":true},"__proto__text":"x","b":2}',
    );
    // The dangerous setter must never be reached: the key survives a round trip
    // and no prototype (canonical object or Object.prototype) was rewritten.
    const roundTripped = JSON.parse(canonicalRemoteCommandJson(parsed)) as Record<string, unknown>;
    expect(Object.keys(roundTripped)).toContain("__proto__");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    const withoutKey = { __proto__text: "x", b: 2 };
    expect(remoteCommandRequestDigest(parsed)).not.toBe(remoteCommandRequestDigest(withoutKey));
  });

  it("keeps a non-object __proto__ value that the setter would have swallowed", () => {
    const parsed = JSON.parse('{"__proto__":"literal","a":1}');
    expect(canonicalRemoteCommandJson(parsed)).toBe('{"__proto__":"literal","a":1}');
  });

  it("preserves nested __proto__ and constructor keys through arrays", () => {
    const parsed = JSON.parse(
      '{"a":{"__proto__":{"x":1},"constructor":{"prototype":{"y":2}},' +
        '"z":[{"__proto__":{"n":3},"constructor":"own"}]}}',
    );
    expect(canonicalRemoteCommandJson(parsed)).toBe(
      '{"a":{"__proto__":{"x":1},"constructor":{"prototype":{"y":2}},' +
        '"z":[{"__proto__":{"n":3},"constructor":"own"}]}}',
    );
    expect(Object.keys(Object.prototype)).not.toContain("polluted");
    expect(Object.getOwnPropertyNames(Object.prototype)).not.toContain("x");
    expect(Object.getOwnPropertyNames(Object.prototype)).not.toContain("n");
  });
});

describe.skipIf(!sqliteAvailable)("runRemoteCommand crash-aware receipts", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-idempotency-test-"));
    initDatabase(join(dir, "state.sqlite"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  const reopen = () => {
    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));
  };

  const run = <T>(
    operation: (markDispatched: () => void) => Promise<T>,
    overrides: Partial<RunRemoteCommandOptions<T>> = {},
  ) =>
    runRemoteCommand<T>({
      commandId: "cmd-1",
      route: ROUTE,
      principalId: PRINCIPAL,
      requestPayload: PAYLOAD,
      operation,
      ...overrides,
    });

  it("runs without a receipt when the client supplies no command id", async () => {
    const operation = vi.fn<() => Promise<string>>(async () => "result");
    await expect(run(operation, { commandId: null })).resolves.toBe("result");
    expect(operation).toHaveBeenCalledTimes(1);
    expect(receiptRow("cmd-1")).toBeUndefined();
  });

  it("replays a bound completed receipt for the same principal and body, and conflicts on any change", async () => {
    const operation = vi.fn<() => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    await expect(run(operation)).resolves.toEqual({ ok: true });
    await expect(run(operation)).resolves.toEqual({ ok: true });
    expect(operation).toHaveBeenCalledTimes(1);

    await expect(run(operation, { principalId: "session-b" })).rejects.toMatchObject({
      code: "command_id_conflict",
      status: 409,
    });
    await expect(run(operation, { requestPayload: { text: "changed" } })).rejects.toMatchObject({
      code: "command_id_conflict",
      status: 409,
    });
    expect(operation).toHaveBeenCalledTimes(1);

    // The cached response never leaked to the conflicting claims.
    const row = receiptRow("cmd-1");
    expect(row?.principal_id).toBe(PRINCIPAL);
    expect(row?.response).toBe(JSON.stringify({ ok: true }));
  });

  it("reports an interrupted command as typed uncertain and never re-executes it", async () => {
    // A process crash after the claim leaves this exact row on disk.
    expect(
      dbClaimRemoteCommand("cmd-1", {
        route: ROUTE,
        principalId: PRINCIPAL,
        requestDigest: remoteCommandRequestDigest(PAYLOAD),
      }),
    ).toEqual({ state: "claimed" });
    reopen();
    expect(receiptRow("cmd-1")?.state).toBe("uncertain");

    const retry = vi.fn<() => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    await expect(run(retry)).rejects.toMatchObject({
      code: REMOTE_COMMAND_UNCERTAIN_CODE,
      status: 409,
    });
    expect(retry).not.toHaveBeenCalled();
    expect(receiptRow("cmd-1")?.state).toBe("uncertain");
  });

  it("records a failure after the dispatch boundary as uncertain, not failed", async () => {
    const operation = vi.fn<(markDispatched: () => void) => Promise<never>>(
      async (markDispatched: () => void) => {
        markDispatched();
        throw new Error("response lost after dispatch");
      },
    );
    await expect(run(operation)).rejects.toThrow("response lost after dispatch");
    expect(receiptRow("cmd-1")).toMatchObject({ state: "uncertain", principal_id: PRINCIPAL });

    await expect(
      run(vi.fn<() => Promise<{ ok: boolean }>>(async () => ({ ok: true }))),
    ).rejects.toMatchObject({
      code: REMOTE_COMMAND_UNCERTAIN_CODE,
    });
  });

  it("records a pre-dispatch failure as a definite failure", async () => {
    const operation = vi.fn<() => Promise<never>>(async () => {
      throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
    });
    await expect(run(operation)).rejects.toMatchObject({ code: "thread_not_found" });
    expect(receiptRow("cmd-1")?.state).toBe("failed");
    await expect(
      run(vi.fn<() => Promise<{ ok: boolean }>>(async () => ({ ok: true }))),
    ).rejects.toMatchObject({
      code: "command_failed",
      status: 409,
    });
  });

  const busyRefusal = () =>
    new HostResourceAdmissionRefusalError(
      "Host agent-session capacity is full: limit 1 (active 1, pending 0). Retry after 1000ms.",
      { code: HOST_RESOURCE_BUSY_CODE, retryAfterMs: 1_000 },
    );

  it("answers a post-dispatch admission refusal with the typed uncertain 409 and never re-runs it", async () => {
    const operation = vi.fn<(markDispatched: () => void) => Promise<never>>(
      async (markDispatched: () => void) => {
        markDispatched();
        throw busyRefusal();
      },
    );
    const failure = await run(operation).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: REMOTE_COMMAND_UNCERTAIN_CODE, status: 409 });
    expect((failure as Error).message).toContain("capacity is full");
    expect((failure as Error).message).toContain("may have taken effect");
    expect(receiptRow("cmd-1")?.state).toBe("uncertain");
    expect(operation).toHaveBeenCalledTimes(1);

    // Same-id retry: the durable receipt still refuses, and the refusal is
    // never converted into a definite failure.
    await expect(run(operation)).rejects.toMatchObject({
      code: REMOTE_COMMAND_UNCERTAIN_CODE,
      status: 409,
    });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(receiptRow("cmd-1")?.state).toBe("uncertain");
  });

  it("treats a policy-unavailable refusal like a busy refusal when no proof exists", async () => {
    const operation = vi.fn<(markDispatched: () => void) => Promise<never>>(
      async (markDispatched: () => void) => {
        markDispatched();
        throw new HostResourceAdmissionRefusalError(
          "Host resource admission policy is unavailable; new counted starts are refused.",
          { code: HOST_RESOURCE_POLICY_UNAVAILABLE_CODE },
        );
      },
    );
    const failure = await run(operation).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: REMOTE_COMMAND_UNCERTAIN_CODE, status: 409 });
    expect((failure as { retryAfterMs?: number }).retryAfterMs).toBeUndefined();
    expect(receiptRow("cmd-1")?.state).toBe("uncertain");
  });

  it("records a proven pre-effect admission refusal as a definite failure", async () => {
    const operation = vi.fn<(markDispatched: () => void) => Promise<never>>(
      async (markDispatched: () => void) => {
        markDispatched();
        throw busyRefusal();
      },
    );
    const failure = await run(operation, {
      isPreEffectFailure: isHostResourceAdmissionRefusal,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HostResourceAdmissionRefusalError);
    expect(receiptRow("cmd-1")?.state).toBe("failed");
    expect(operation).toHaveBeenCalledTimes(1);

    await expect(
      run(operation, { isPreEffectFailure: isHostResourceAdmissionRefusal }),
    ).rejects.toMatchObject({ code: "command_failed", status: 409 });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("never downgrades a resumed uncertain receipt, even for a proven pre-effect refusal", async () => {
    const interrupted = vi.fn<(markDispatched: () => void) => Promise<never>>(
      async (markDispatched: () => void) => {
        markDispatched();
        throw new Error("dispatch interrupted");
      },
    );
    await expect(run(interrupted)).rejects.toThrow("dispatch interrupted");
    expect(receiptRow("cmd-1")?.state).toBe("uncertain");

    const resumed = vi.fn<(markDispatched: () => void) => Promise<never>>(
      async (markDispatched: () => void) => {
        markDispatched();
        throw busyRefusal();
      },
    );
    await expect(
      run(resumed, {
        reconcileUncertain: () => ({ kind: "resume" }),
        isPreEffectFailure: isHostResourceAdmissionRefusal,
      }),
    ).rejects.toMatchObject({ code: REMOTE_COMMAND_UNCERTAIN_CODE, status: 409 });
    expect(receiptRow("cmd-1")?.state).toBe("uncertain");
    expect(resumed).toHaveBeenCalledTimes(1);
  });

  it("answers an unkeyed compound admission refusal with the uncertain 409 and writes no receipt", async () => {
    const operation = vi.fn<(markDispatched: () => void) => Promise<never>>(
      async (markDispatched: () => void) => {
        markDispatched();
        throw busyRefusal();
      },
    );
    const failure = await run(operation, { commandId: null }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: REMOTE_COMMAND_UNCERTAIN_CODE, status: 409 });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(receiptRow("cmd-1")).toBeUndefined();
  });

  it("answers an unmarked unkeyed admission refusal without whole-operation proof as uncertain", async () => {
    const operation = vi.fn<() => Promise<never>>(async () => {
      throw busyRefusal();
    });
    const failure = await run(operation, { commandId: null }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: REMOTE_COMMAND_UNCERTAIN_CODE, status: 409 });
    expect(receiptRow("cmd-1")).toBeUndefined();
  });

  it("keeps an unkeyed post-mark non-admission failure raw and definite (admission-only classifier)", async () => {
    // H1 pin: the no-command-id branch classifies ONLY admission refusals.
    // A post-mark failure of any other kind keeps the historical raw error —
    // it must never be re-classified as `command_outcome_uncertain`.
    const operation = vi.fn<(markDispatched: () => void) => Promise<never>>(
      async (markDispatched: () => void) => {
        markDispatched();
        throw new Error("post-effect failure without a command id");
      },
    );
    const failure = await run(operation, { commandId: null }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as { code?: string }).code).toBeUndefined();
    expect((failure as Error).message).toBe("post-effect failure without a command id");
    expect(receiptRow("cmd-1")).toBeUndefined();
  });

  it("rethrows an unkeyed proven pre-effect admission refusal", async () => {
    const operation = vi.fn<(markDispatched: () => void) => Promise<never>>(
      async (markDispatched: () => void) => {
        markDispatched();
        throw busyRefusal();
      },
    );
    const failure = await run(operation, {
      commandId: null,
      isPreEffectFailure: isHostResourceAdmissionRefusal,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HostResourceAdmissionRefusalError);
    expect(receiptRow("cmd-1")).toBeUndefined();
  });

  it("consults the pre-effect predicate only for admission refusals", async () => {
    const isPreEffectFailure = vi.fn<(error: unknown) => boolean>(() => true);
    const operation = vi.fn<(markDispatched: () => void) => Promise<never>>(
      async (markDispatched: () => void) => {
        markDispatched();
        throw new Error("not an admission refusal");
      },
    );
    await expect(run(operation, { isPreEffectFailure })).rejects.toThrow(
      "not an admission refusal",
    );
    expect(isPreEffectFailure).not.toHaveBeenCalled();
    expect(receiptRow("cmd-1")?.state).toBe("uncertain");
  });

  it("resumes an uncertain bound command only through the route reconcile hook", async () => {
    const failing = vi.fn<(markDispatched: () => void) => Promise<never>>(
      async (markDispatched: () => void) => {
        markDispatched();
        throw new Error("dispatch interrupted");
      },
    );
    await expect(run(failing)).rejects.toThrow("dispatch interrupted");
    expect(receiptRow("cmd-1")?.state).toBe("uncertain");

    const reconciled = vi.fn<() => Promise<{ ok: boolean; replayed: boolean }>>(async () => ({
      ok: true,
      replayed: true,
    }));
    await expect(
      run(reconciled, { reconcileUncertain: () => ({ kind: "resume" }) }),
    ).resolves.toEqual({ ok: true, replayed: true });
    expect(reconciled).toHaveBeenCalledTimes(1);
    expect(receiptRow("cmd-1")?.state).toBe("completed");

    // The settled result now replays without re-running the operation.
    await expect(run(reconciled)).resolves.toEqual({ ok: true, replayed: true });
    expect(reconciled).toHaveBeenCalledTimes(1);
  });

  it("does not reconcile an unbound legacy interrupted receipt", async () => {
    expect(dbClaimRemoteCommand("legacy-cmd", LEGACY_IDENTITY)).toEqual({ state: "claimed" });
    reopen();

    const reconcile = vi.fn<() => { kind: "resume" }>(() => ({ kind: "resume" as const }));
    const operation = vi.fn<() => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    await expect(
      run(operation, {
        commandId: "legacy-cmd",
        reconcileUncertain: reconcile,
      }),
    ).rejects.toMatchObject({ code: REMOTE_COMMAND_UNCERTAIN_CODE });
    expect(reconcile).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });

  it("replays a legacy completed receipt only through a route validator, without attribution", async () => {
    expect(dbClaimRemoteCommand("legacy-completed", LEGACY_IDENTITY)).toEqual({ state: "claimed" });
    dbCompleteRemoteCommand("legacy-completed", { ok: true });

    const operation = vi.fn<() => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    await expect(run(operation, { commandId: "legacy-completed" })).rejects.toMatchObject({
      code: REMOTE_COMMAND_UNCERTAIN_CODE,
    });
    expect(operation).not.toHaveBeenCalled();

    await expect(
      run(operation, {
        commandId: "legacy-completed",
        isLegacyCompletedResponseReplayable: () => true,
      }),
    ).resolves.toEqual({ ok: true });
    expect(operation).not.toHaveBeenCalled();
    expect(receiptRow("legacy-completed")).toMatchObject({
      state: "completed",
      principal_id: null,
      request_digest: null,
    });
  });

  it("keeps the truthful result when the completion write fails", async () => {
    const circular: Record<string, unknown> = { ok: true };
    circular.self = circular;
    const failures: unknown[] = [];
    await expect(
      run(async () => circular, { onReceiptWriteError: (error) => failures.push(error) }),
    ).resolves.toBe(circular);
    expect(failures).toHaveLength(1);
    // Never a fabricated durable success: the unresolved row blocks the retry
    // until the startup reconciliation turns it uncertain.
    expect(receiptRow("cmd-1")?.state).toBe("in_progress");
    await expect(run(async () => ({ ok: true }))).rejects.toMatchObject({
      code: "command_in_progress",
      status: 409,
    });
  });

  it("validates a replayed completed response through the route mapper", async () => {
    await run(async () => ({ ok: true, target: "a" }));
    await expect(
      run(async () => ({ ok: true, target: "a" }), {
        mapCompletedResponse: () => {
          throw new RemoteHttpError("command_id_conflict", "stale target", 409);
        },
      }),
    ).rejects.toMatchObject({ code: "command_id_conflict" });
  });

  it("keys receipts to the auth session id, which survives access-token refresh", async () => {
    const store = new RemoteAuthStore();
    const pairing = store.issuePairingCredential({ scopes: ["session:operate"] });
    const before = store.exchangePairingCredential({ credential: pairing.credential });
    const beforeSession = store.authenticateBearerToken(before.accessToken, ["session:operate"]);

    const operation = vi.fn<() => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    await expect(
      run(operation, {
        commandId: "refresh-cmd",
        principalId: beforeSession.sessionId,
      }),
    ).resolves.toEqual({ ok: true });

    const refreshed = store.refreshAccessToken({ refreshToken: before.refreshToken! });
    const afterSession = store.authenticateBearerToken(refreshed.accessToken, ["session:operate"]);
    expect(afterSession.sessionId).toBe(beforeSession.sessionId);

    // The refreshed principal replays its own receipt instead of conflicting.
    await expect(
      run(operation, { commandId: "refresh-cmd", principalId: afterSession.sessionId }),
    ).resolves.toEqual({ ok: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
