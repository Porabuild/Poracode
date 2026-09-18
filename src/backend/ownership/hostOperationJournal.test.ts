import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostOwnerLease } from "./hostOwnerLease";
import {
  beginHostOperation,
  HOST_OPERATION_JOURNAL_FILE,
  HOST_OPERATION_JOURNAL_VERSION,
  markHostOperationPhase,
  readHostOperationJournal,
  readRunningHostOperation,
  type HostOperationRecord,
} from "./hostOperationJournal";
import { resolveHostRootPaths } from "./hostRootPaths";

const roots: string[] = [];
const leases: HostOwnerLease[] = [];

function owner() {
  const root = mkdtempSync(join(tmpdir(), "poracode-operation-journal-"));
  roots.push(root);
  const paths = resolveHostRootPaths(join(realpathSync.native(root), "profile"));
  mkdirSync(paths.dataRoot, { recursive: true, mode: 0o700 });
  const lease = HostOwnerLease.acquire(paths, "headless");
  leases.push(lease);
  return lease;
}

afterEach(() => {
  for (const lease of leases.splice(0)) lease.release();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function plan() {
  return {
    credentialOutcome: "adopted-existing-key" as const,
    archivedKeyFiles: [] as readonly string[],
    keyFingerprint: "a".repeat(64),
  };
}

function journalPath(lease: ReturnType<typeof owner>): string {
  return join(lease.paths.dataRoot, HOST_OPERATION_JOURNAL_FILE);
}

describe("host operation journal (Gates 2-3 Batch 3)", () => {
  it("claims a mutation window before side effects and completes it", () => {
    const lease = owner();
    beginHostOperation(lease, { operation: "activation", operationId: "staged-at", plan: plan() });
    const running = readRunningHostOperation(lease.paths, "activation");
    expect(running?.phase).toBe("running");
    expect(running?.operationId).toBe("staged-at");
    expect(running?.ownerGeneration).toBe(lease.generation);
    expect(running?.plan?.keyFingerprint).toBe("a".repeat(64));

    markHostOperationPhase(lease, {
      operation: "activation",
      operationId: "staged-at",
      phase: "completed",
    });
    expect(readRunningHostOperation(lease.paths, "activation")).toBeUndefined();
    const journal = readHostOperationJournal(lease.paths);
    expect(journal?.operations).toHaveLength(1);
    expect(journal?.operations[0]?.phase).toBe("completed");
  });

  it("refuses to claim while another operation of the kind is still running", () => {
    const lease = owner();
    beginHostOperation(lease, { operation: "activation", operationId: "first" });
    expect(() =>
      beginHostOperation(lease, { operation: "activation", operationId: "second", plan: plan() }),
    ).toThrow(/already claimed|still recorded/u);
    // A different kind would be independent; only same-kind windows collide.
    expect(readRunningHostOperation(lease.paths, "activation")?.operationId).toBe("first");
  });

  it("refuses a begin whose operation ID matches a retained completion", () => {
    const lease = owner();
    beginHostOperation(lease, { operation: "activation", operationId: "staged-at", plan: plan() });
    markHostOperationPhase(lease, {
      operation: "activation",
      operationId: "staged-at",
      phase: "completed",
    });
    expect(() =>
      beginHostOperation(lease, {
        operation: "activation",
        operationId: "staged-at",
        plan: plan(),
      }),
    ).toThrow(/retained completion/u);
  });

  it.each(["completed", "failed"] as const)(
    "refuses to rewrite a retained %s operation",
    (phase) => {
      const lease = owner();
      beginHostOperation(lease, { operation: "activation", operationId: "op-1", plan: plan() });
      markHostOperationPhase(lease, {
        operation: "activation",
        operationId: "op-1",
        phase,
      });
      const before = readFileSync(journalPath(lease), "utf8");
      expect(() =>
        markHostOperationPhase(lease, {
          operation: "activation",
          operationId: "op-1",
          phase: phase === "completed" ? "failed" : "completed",
        }),
      ).toThrow(/not running/u);
      expect(readFileSync(journalPath(lease), "utf8")).toBe(before);
    },
  );

  it("replaces a retained failed same-ID claim in place", () => {
    const lease = owner();
    beginHostOperation(lease, { operation: "activation", operationId: "op-1", plan: plan() });
    markHostOperationPhase(lease, {
      operation: "activation",
      operationId: "op-1",
      phase: "failed",
    });
    beginHostOperation(lease, { operation: "activation", operationId: "op-1", plan: plan() });
    const journal = readHostOperationJournal(lease.paths);
    expect(journal?.operations).toHaveLength(1);
    expect(journal?.operations[0]?.operationId).toBe("op-1");
    expect(journal?.operations[0]?.phase).toBe("running");
  });

  it("refuses at capacity instead of evicting retained records", () => {
    const lease = owner();
    const records: HostOperationRecord[] = [];
    for (let index = 0; index < 32; index++) {
      records.push({
        formatVersion: HOST_OPERATION_JOURNAL_VERSION,
        operation: "activation",
        operationId: `old-${index}`,
        phase: "failed",
        ownerGeneration: lease.generation,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    writeFileSync(
      journalPath(lease),
      `${JSON.stringify(
        {
          formatVersion: HOST_OPERATION_JOURNAL_VERSION,
          profileNamespace: lease.paths.profileNamespace,
          dataRoot: lease.paths.dataRoot,
          operations: records,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    // Every retained record is still inside the expiry window, so a fresh
    // mutation window is refused rather than evicting one of them.
    expect(() =>
      beginHostOperation(lease, { operation: "activation", operationId: "fresh", plan: plan() }),
    ).toThrow(/capacity/u);
    expect(readHostOperationJournal(lease.paths)?.operations).toHaveLength(32);
  });

  it("prunes expired terminal records at the next write and never a running one", () => {
    const lease = owner();
    const stale = new Date(Date.now() - 120_000).toISOString();
    writeFileSync(
      journalPath(lease),
      `${JSON.stringify(
        {
          formatVersion: HOST_OPERATION_JOURNAL_VERSION,
          profileNamespace: lease.paths.profileNamespace,
          dataRoot: lease.paths.dataRoot,
          operations: [
            {
              formatVersion: HOST_OPERATION_JOURNAL_VERSION,
              operation: "activation",
              operationId: "expired-failure",
              phase: "failed",
              ownerGeneration: lease.generation,
              startedAt: stale,
              updatedAt: stale,
            },
          ],
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    beginHostOperation(lease, { operation: "activation", operationId: "fresh", plan: plan() });
    const ids = readHostOperationJournal(lease.paths)?.operations.map(
      (record) => record.operationId,
    );
    expect(ids).toEqual(["fresh"]);
  });

  it("keeps a running record blocking even when it looks expired", () => {
    const lease = owner();
    const stale = new Date(Date.now() - 120_000).toISOString();
    writeFileSync(
      journalPath(lease),
      `${JSON.stringify(
        {
          formatVersion: HOST_OPERATION_JOURNAL_VERSION,
          profileNamespace: lease.paths.profileNamespace,
          dataRoot: lease.paths.dataRoot,
          operations: [
            {
              formatVersion: HOST_OPERATION_JOURNAL_VERSION,
              operation: "activation",
              operationId: "interrupted-long-ago",
              phase: "running",
              ownerGeneration: lease.generation,
              startedAt: stale,
              updatedAt: stale,
            },
          ],
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    // A running record is never aged out: an interrupted mutation window stays
    // claimed until a consumer resolves it (resume or supersession).
    expect(() =>
      beginHostOperation(lease, { operation: "activation", operationId: "fresh", plan: plan() }),
    ).toThrow(/still recorded as running/u);
    expect(readRunningHostOperation(lease.paths, "activation")?.operationId).toBe(
      "interrupted-long-ago",
    );
  });

  it("refuses all writers once the owner generation is released", () => {
    const lease = owner();
    lease.release();
    expect(() =>
      beginHostOperation(lease, { operation: "activation", operationId: "after-release" }),
    ).toThrow(/no longer active/u);
    expect(existsSync(journalPath(lease))).toBe(false);
  });

  it("treats a missing journal as nothing recorded and never rewrites it from a reader", () => {
    const lease = owner();
    expect(readHostOperationJournal(lease.paths)).toBeUndefined();
    expect(readRunningHostOperation(lease.paths, "activation")).toBeUndefined();
    expect(existsSync(journalPath(lease))).toBe(false);
  });

  it.each([
    { formatVersion: 2 },
    { profileNamespace: "/some-other-profile" },
    { operations: "not-an-array" },
  ])("refuses a foreign or future journal loudly without rewriting it (%j)", (change) => {
    const lease = owner();
    const path = journalPath(lease);
    const serialized = `${JSON.stringify({
      formatVersion: HOST_OPERATION_JOURNAL_VERSION,
      profileNamespace: lease.paths.profileNamespace,
      dataRoot: lease.paths.dataRoot,
      operations: [],
      ...change,
    })}\n`;
    writeFileSync(path, serialized, { encoding: "utf8", mode: 0o600 });
    expect(() => readHostOperationJournal(lease.paths)).toThrow(/journal/u);
    expect(readFileSync(path, "utf8")).toBe(serialized);
  });

  it("refuses a record whose plan evidence is malformed", () => {
    const lease = owner();
    writeFileSync(
      journalPath(lease),
      `${JSON.stringify({
        formatVersion: HOST_OPERATION_JOURNAL_VERSION,
        profileNamespace: lease.paths.profileNamespace,
        dataRoot: lease.paths.dataRoot,
        operations: [
          {
            formatVersion: HOST_OPERATION_JOURNAL_VERSION,
            operation: "activation",
            operationId: "staged-at",
            phase: "running",
            ownerGeneration: lease.generation,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            plan: { credentialOutcome: "adopted-existing-key", keyFingerprint: "nothex" },
          },
        ],
      })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    expect(() => readRunningHostOperation(lease.paths, "activation")).toThrow(/plan evidence/u);
  });

  it("keeps key material out of the journal: only fingerprints and notes are recorded", () => {
    const lease = owner();
    const keyMaterial = Buffer.alloc(32, 9).toString("base64");
    beginHostOperation(lease, {
      operation: "activation",
      operationId: "staged-at",
      plan: {
        credentialOutcome: "fresh-key-sign-in-again",
        archivedKeyFiles: ["secret-key.safe"],
        keyFingerprint: "b".repeat(64),
      },
    });
    markHostOperationPhase(lease, {
      operation: "activation",
      operationId: "staged-at",
      phase: "failed",
      note: "synthetic failure detail",
    });
    const serialized = readFileSync(journalPath(lease), "utf8");
    expect(serialized).toContain("b".repeat(64));
    expect(serialized).not.toContain(keyMaterial);
  });
});
