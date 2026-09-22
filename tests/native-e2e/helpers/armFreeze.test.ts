import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertBaselineArmReady,
  computeArmRecord,
  hashFile,
  readObserverAck,
  type ArmRecord,
  type ObserverAckRecord,
  type ObserverFileHash,
} from "./armFreeze.ts";

/**
 * Arm-freeze unit tests.
 *
 * The A0 baseline may only run on an arm whose complete observer source set
 * (format, adapters, installer and their tests) matches the coordinator's
 * acknowledgment. These tests cover the six-file hash verification, the dirty
 * `src/` scope gate that catches A1/A2 edits, and the acknowledgment parser.
 */

const REPO_ROOT = join(import.meta.dirname, "../../..");
const REAL_ARM_ROOT = join(REPO_ROOT, "tmp/v2-production/arms/a0-baseline");
const REAL_ACK_PATH = join(REPO_ROOT, "tmp/v2-production/a0-observer-ack.json");

const OBSERVER_FILES = [
  "src/renderer/diagnostics/rendererPerfDiagnostics.ts",
  "src/renderer/diagnostics/rendererPerfDiagnostics.test.ts",
  "src/renderer/diagnostics/performanceEntryAdapters.ts",
  "src/renderer/diagnostics/performanceEntryAdapters.test.ts",
  "src/renderer/diagnostics/performanceObserverInstall.ts",
  "src/renderer/diagnostics/performanceObserverInstall.test.ts",
] as const;

const PRIMARY_OBSERVER = OBSERVER_FILES[0];

const roots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "v2q-arm-freeze-"));
  roots.push(root);
  return root;
}

function writeSource(root: string, relative: string, content: string): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function seedObserverFiles(
  root: string,
  mutate?: (relative: string) => string,
): ObserverFileHash[] {
  return OBSERVER_FILES.map((relative, index) => {
    const content = mutate ? mutate(relative) : `// observer file ${String(index)}\n`;
    writeSource(root, relative, content);
    return { path: relative, sha256: sha256(content), bytes: Buffer.byteLength(content) };
  });
}

function makeAck(
  observerFiles: readonly ObserverFileHash[],
  overrides?: Partial<ObserverAckRecord>,
): ObserverAckRecord {
  const primary = observerFiles.find((file) => file.path === PRIMARY_OBSERVER);
  if (!primary) throw new Error("test ack is missing the primary observer file");
  return {
    observerSha256: primary.sha256,
    acknowledgedBy: "unit-test",
    acknowledgedAt: "2026-09-20T00:00:00.000Z",
    observerFiles,
    allowedSrcDirty: observerFiles.map((file) => file.path),
    ...overrides,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("readObserverAck", () => {
  function writeAck(payload: unknown): string {
    const root = makeTempRoot();
    const path = join(root, "ack.json");
    writeFileSync(path, JSON.stringify(payload));
    return path;
  }

  it("rejects an acknowledgment without a valid observer hash or acknowledger", () => {
    expect(() => readObserverAck(writeAck({ observerSha256: "nope" }))).toThrow(
      "has no valid observerSha256",
    );
    expect(() =>
      readObserverAck(writeAck({ observerSha256: "a".repeat(64), acknowledgedBy: "x" })),
    ).toThrow("is missing acknowledgedBy/acknowledgedAt");
  });

  it("rejects malformed observerFiles entries instead of silently ignoring them", () => {
    const base = { observerSha256: "a".repeat(64), acknowledgedBy: "x", acknowledgedAt: "y" };
    expect(() => readObserverAck(writeAck({ ...base, observerFiles: "six" }))).toThrow(
      "non-array observerFiles",
    );
    expect(() =>
      readObserverAck(writeAck({ ...base, observerFiles: [{ sha256: "b".repeat(64) }] })),
    ).toThrow("without a path");
    expect(() =>
      readObserverAck(
        writeAck({ ...base, observerFiles: [{ path: "a.ts", sha256: "bad", bytes: 1 }] }),
      ),
    ).toThrow("has no valid sha256");
    expect(() =>
      readObserverAck(
        writeAck({ ...base, observerFiles: [{ path: "a.ts", sha256: "b".repeat(64), bytes: -1 }] }),
      ),
    ).toThrow("has no valid byte count");
  });

  it("parses a complete six-file acknowledgment", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    const ack = readObserverAck(writeAck(makeAck(files, { armHead: "f".repeat(40) })));
    expect(ack.observerFiles).toHaveLength(6);
    expect(ack.observerFiles?.[0]?.path).toBe(PRIMARY_OBSERVER);
    expect(ack.armHead).toBe("f".repeat(40));
  });
});

describe("computeArmRecord", () => {
  it("hashes every acknowledged observer file and reports missing artifacts as absent", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    const ack = makeAck(files);
    const record = computeArmRecord(root, ack);
    expect(record.gitHead).toBeNull();
    expect(record.gitHeadSource).toBe("unknown");
    expect(record.observerSha256).toBe(files[0]?.sha256);
    expect(record.observerFiles.map((file) => file.path)).toEqual([...OBSERVER_FILES]);
    expect(record.observerFiles.every((file) => file.bytes > 0)).toBe(true);
    // No dist/ or lockfiles in the temp arm: nothing is invented.
    expect(record.artifacts).toEqual([]);
  });

  it("records the acknowledged head as the head source when the arm is not a git checkout", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    const ack = makeAck(files, { armHead: "e".repeat(40) });
    const record = computeArmRecord(root, ack);
    expect(record.gitHead).toBeNull();
    expect(record.gitHeadSource).toBe("ack");
  });

  it("drops only the missing file from the observer evidence list", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    rmSync(join(root, PRIMARY_OBSERVER));
    const record = computeArmRecord(root, makeAck(files));
    expect(record.observerSha256).toBeNull();
    expect(record.observerFiles.map((file) => file.path)).toEqual([...OBSERVER_FILES.slice(1)]);
    expect(hashFile(join(root, PRIMARY_OBSERVER))).toBeNull();
  });
});

describe("assertBaselineArmReady", () => {
  it("accepts an arm whose six observer files all match the acknowledgment", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    const ack = makeAck(files);
    const record = computeArmRecord(root, ack);
    expect(() => assertBaselineArmReady(record, ack)).not.toThrow();
  });

  it("rejects a mismatch in any of the six observer files, not only the primary", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    const ack = makeAck(files);
    const record = computeArmRecord(root, ack);
    // Edit a non-primary observer file after the acknowledgment was recorded.
    writeSource(root, OBSERVER_FILES[4], "// tampered installer\n");
    expect(() => assertBaselineArmReady(record, ack)).toThrow(
      /observer file hashes do not match the acknowledgment/u,
    );
    expect(() => assertBaselineArmReady(record, ack)).toThrow(OBSERVER_FILES[4]);
  });

  it("rejects an arm missing one of the acknowledged observer files", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    const ack = makeAck(files);
    rmSync(join(root, OBSERVER_FILES[5]));
    const record = computeArmRecord(root, ack);
    expect(() => assertBaselineArmReady(record, ack)).toThrow(
      /observer file hashes do not match the acknowledgment/u,
    );
    expect(() => assertBaselineArmReady(record, ack)).toThrow("missing in arm");
  });

  it("rejects an acknowledgment whose observerFiles omit the primary observer", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    const ack = makeAck(files);
    const record = computeArmRecord(root, ack);
    const withoutPrimary: ObserverAckRecord = {
      ...ack,
      observerFiles: ack.observerFiles?.filter((file) => file.path !== PRIMARY_OBSERVER) ?? [],
    };
    expect(() => assertBaselineArmReady(record, withoutPrimary)).toThrow(
      "lists observerFiles but not the primary",
    );
  });

  it("rejects a primary observer hash mismatch before looking at the file set", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    const ack = makeAck(files);
    const record = computeArmRecord(root, ack);
    const forged: ObserverAckRecord = { ...ack, observerSha256: "c".repeat(64) };
    expect(() => assertBaselineArmReady(record, forged)).toThrow(
      "observer source hash does not match the acknowledgment",
    );
  });

  it("rejects src/ edits outside the acknowledged observer scope (possible A1/A2)", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    const ack = makeAck(files);
    const record: ArmRecord = {
      ...computeArmRecord(root, ack),
      gitDirtySrc: [...OBSERVER_FILES, "src/host/remote/RemoteAccessServer.ts"],
    };
    expect(() => assertBaselineArmReady(record, ack)).toThrow(
      "src/ edits outside the acknowledged observer scope",
    );
    expect(() => assertBaselineArmReady(record, ack)).toThrow(
      "src/host/remote/RemoteAccessServer.ts",
    );
  });

  it("accepts dirty observer files when the acknowledgment has no explicit allowed set", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    const ack = makeAck(files);
    const { allowedSrcDirty: _allowedSrcDirty, ...withoutAllowed } = ack;
    const record: ArmRecord = {
      ...computeArmRecord(root, ack),
      gitDirtySrc: [...OBSERVER_FILES],
    };
    expect(() => assertBaselineArmReady(record, withoutAllowed)).not.toThrow();
  });

  it("rejects an arm head that disagrees with the acknowledged head", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    const ack = makeAck(files, { armHead: "a".repeat(40) });
    const record: ArmRecord = { ...computeArmRecord(root, ack), gitHead: "b".repeat(40) };
    expect(() => assertBaselineArmReady(record, ack)).toThrow(
      "does not match the acknowledged head",
    );
  });

  it("rejects an arm with no observer source at all", () => {
    const root = makeTempRoot();
    const files = seedObserverFiles(root);
    const ack = makeAck(files);
    const record: ArmRecord = {
      ...computeArmRecord(root, ack),
      observerSha256: null,
      observerFiles: [],
    };
    expect(() => assertBaselineArmReady(record, ack)).toThrow("has no src/renderer");
  });
});

const realArmPresent = existsSync(REAL_ARM_ROOT) && existsSync(REAL_ACK_PATH);

describe.skipIf(!realArmPresent)("frozen A0 baseline arm cross-check", () => {
  it("matches all six acknowledged observer hashes with no unacknowledged src edits", () => {
    const ack = readObserverAck(REAL_ACK_PATH);
    expect(ack.observerFiles?.map((file) => file.path)).toEqual([...OBSERVER_FILES]);
    const record = computeArmRecord(REAL_ARM_ROOT, ack);
    expect(record.gitHead).toBe(ack.armHead);
    expect(record.observerFiles).toHaveLength(OBSERVER_FILES.length);
    expect(() => assertBaselineArmReady(record, ack)).not.toThrow();
  });
});
