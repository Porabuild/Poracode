import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENVIRONMENT_STORE_FORMAT_VERSION,
  ENVIRONMENT_STORE_MAX_ENVIRONMENTS,
  ENVIRONMENT_STORE_MAX_FILE_BYTES,
  type EnvironmentRecord,
} from "@/shared/environments";
import {
  ENVIRONMENT_STORE_FILE_NAME,
  environmentsFilePath,
  parseEnvironmentStoreFile,
  readEnvironmentStoreFileText,
  serializeEnvironmentStoreFile,
} from "./environmentStoreFile";
import { EnvironmentStoreFormatError, EnvironmentStoreLimitError } from "./environmentStoreErrors";

const environmentIdA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const environmentIdB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const legacyIdA = "11111111-1111-4111-8111-111111111111";
const legacyIdB = "22222222-2222-4222-8222-222222222222";
const childDesktopId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const runtimeHash = "a".repeat(64);
const pin = `SHA256:${"A".repeat(43)}`;

function recordFixture(overrides: Partial<EnvironmentRecord> = {}): EnvironmentRecord {
  const base: EnvironmentRecord = {
    environmentId: environmentIdA,
    revision: 1,
    label: "Lab server",
    target: "dev@example.internal",
    trust: { state: "unknown" },
    runtime: { hash: runtimeHash },
    legacyConnectionIds: [],
    desired: "enabled",
    createdAt: 100,
    updatedAt: 100,
  };
  return { ...base, ...overrides };
}

function fileText(environments: readonly unknown[], formatVersion: unknown = 1): string {
  return `${JSON.stringify({ formatVersion, environments }, null, 2)}\n`;
}

/**
 * Returns the refusal reason for unreadable input, or a sentinel reason when
 * parsing unexpectedly succeeds or fails with a different error type.
 */
function refusal(text: string): { readonly reason?: string } {
  try {
    parseEnvironmentStoreFile(text);
    return { reason: "no-refusal" };
  } catch (error) {
    return error instanceof EnvironmentStoreFormatError ? error : { reason: "wrong-error" };
  }
}

describe("environmentStoreFile", () => {
  it("builds the store path from the leased host data root", () => {
    expect(environmentsFilePath("/host/data")).toBe(`/host/data/${ENVIRONMENT_STORE_FILE_NAME}`);
    expect(ENVIRONMENT_STORE_FILE_NAME).toBe("environments.json");
  });

  it("reads a missing file as undefined and refuses non-regular files as corrupt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "environment-store-file-"));
    try {
      expect(await readEnvironmentStoreFileText(join(dir, "absent.json"))).toBeUndefined();
      const directoryPath = join(dir, "directory.json");
      mkdirSync(directoryPath);
      await expect(readEnvironmentStoreFileText(directoryPath)).rejects.toBeInstanceOf(
        EnvironmentStoreFormatError,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("bounds the read and preserves an oversized file with a typed limit error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "environment-store-file-"));
    try {
      const path = join(dir, "environments.json");
      const oversized = `${JSON.stringify({ formatVersion: 1, environments: [] })}${" ".repeat(
        ENVIRONMENT_STORE_MAX_FILE_BYTES,
      )}`;
      writeFileSync(path, oversized);
      const error = await readEnvironmentStoreFileText(path).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(EnvironmentStoreLimitError);
      expect((error as EnvironmentStoreLimitError).reason).toBe("file-bytes");
      expect((error as EnvironmentStoreLimitError).limit).toBe(ENVIRONMENT_STORE_MAX_FILE_BYTES);
      expect(oversized.length).toBeGreaterThan(ENVIRONMENT_STORE_MAX_FILE_BYTES);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("round-trips format 1 records and serializes sorted with a trailing newline", () => {
    const recordA = recordFixture({
      trust: { state: "observed", observedFingerprint: pin },
      childIdentity: { desktopId: childDesktopId },
      legacyConnectionIds: [legacyIdA],
      port: 22_022,
      credentialRef: "agent:default",
    });
    const recordB = recordFixture({
      environmentId: environmentIdB,
      revision: 7,
      target: "ops@host",
    });
    const text = serializeEnvironmentStoreFile([recordB, recordA]);
    expect(text.endsWith("\n")).toBe(true);
    const parsed = parseEnvironmentStoreFile(text);
    expect(parsed.map((record) => record.environmentId)).toEqual([environmentIdA, environmentIdB]);
    expect(parsed[0]).toEqual(recordA);
    expect(parsed[1]).toEqual(recordB);
    expect(JSON.parse(text).formatVersion).toBe(ENVIRONMENT_STORE_FORMAT_VERSION);
  });

  it("refuses non-JSON content", () => {
    expect(refusal("not json")).toMatchObject({ reason: "corrupt" });
  });

  it("refuses an absent or unknown format marker (no legacy generation exists)", () => {
    expect(refusal(JSON.stringify({ environments: [] }))).toMatchObject({ reason: "corrupt" });
    expect(refusal(fileText([], 0))).toMatchObject({ reason: "corrupt" });
    expect(refusal(fileText([], "1"))).toMatchObject({ reason: "corrupt" });
  });

  it("refuses a newer format with a distinct future-format reason", () => {
    expect(refusal(fileText([], 2))).toMatchObject({ reason: "future-format" });
    expect(refusal(fileText([], 3))).toMatchObject({ reason: "future-format" });
  });

  it("refuses unknown record fields so no token or state can be smuggled in", () => {
    expect(refusal(fileText([{ ...recordFixture(), token: "secret-token" }]))).toMatchObject({
      reason: "corrupt",
    });
    expect(refusal(fileText([{ ...recordFixture(), state: "connected" }]))).toMatchObject({
      reason: "corrupt",
    });
    expect(refusal(fileText([{ ...recordFixture(), lastError: "boom" }]))).toMatchObject({
      reason: "corrupt",
    });
    expect(
      refusal(fileText([{ ...recordFixture(), identityFile: "/home/me/.ssh/id" }])),
    ).toMatchObject({ reason: "corrupt" });
  });

  it("refuses duplicate environment ids", () => {
    expect(refusal(fileText([recordFixture(), recordFixture({ label: "other" })]))).toMatchObject({
      reason: "corrupt",
    });
  });

  it("refuses one legacy connection id adopted by two environments", () => {
    expect(
      refusal(
        fileText([
          recordFixture({ legacyConnectionIds: [legacyIdA] }),
          recordFixture({
            environmentId: environmentIdB,
            legacyConnectionIds: [legacyIdA],
          }),
        ]),
      ),
    ).toMatchObject({ reason: "corrupt" });
    expect(
      refusal(fileText([recordFixture({ legacyConnectionIds: [legacyIdA, legacyIdB] })])),
    ).toMatchObject({ reason: "corrupt" });
  });

  it("refuses malformed trust pins", () => {
    expect(
      refusal(fileText([recordFixture({ trust: { state: "pinned" } as never })])),
    ).toMatchObject({ reason: "corrupt" });
    expect(
      refusal(fileText([recordFixture({ trust: { state: "observed" } as never })])),
    ).toMatchObject({ reason: "corrupt" });
    expect(
      refusal(
        fileText([
          recordFixture({
            trust: { state: "pinned", hostKeyFingerprint: "SHA256:too-short" } as never,
          }),
        ]),
      ),
    ).toMatchObject({ reason: "corrupt" });
    expect(
      refusal(
        fileText([
          recordFixture({
            trust: { state: "unknown", observedFingerprint: pin } as never,
          }),
        ]),
      ),
    ).toMatchObject({ reason: "corrupt" });
  });

  it("refuses a registry over the environment-count limit with a typed limit error", () => {
    const records = Array.from({ length: ENVIRONMENT_STORE_MAX_ENVIRONMENTS + 1 }, () =>
      recordFixture({ environmentId: randomUUID() }),
    );
    let error: unknown;
    try {
      parseEnvironmentStoreFile(fileText(records));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EnvironmentStoreLimitError);
    expect((error as EnvironmentStoreLimitError).reason).toBe("environment-count");
    expect((error as EnvironmentStoreLimitError).limit).toBe(ENVIRONMENT_STORE_MAX_ENVIRONMENTS);
  });

  it("refuses malformed target, port, credential reference, and legacy identifiers", () => {
    expect(refusal(fileText([recordFixture({ target: "-oProxyCommand=bad" })]))).toMatchObject({
      reason: "corrupt",
    });
    expect(refusal(fileText([recordFixture({ target: "host/with/slash" })]))).toMatchObject({
      reason: "corrupt",
    });
    expect(refusal(fileText([recordFixture({ port: 0 })]))).toMatchObject({ reason: "corrupt" });
    expect(refusal(fileText([recordFixture({ port: 65_536 })]))).toMatchObject({
      reason: "corrupt",
    });
    expect(refusal(fileText([recordFixture({ credentialRef: "/home/me/.ssh/id" })]))).toMatchObject(
      { reason: "corrupt" },
    );
    expect(refusal(fileText([recordFixture({ credentialRef: "../keys/id" })]))).toMatchObject({
      reason: "corrupt",
    });
    expect(refusal(fileText([recordFixture({ credentialRef: "a..b" })]))).toMatchObject({
      reason: "corrupt",
    });
    expect(refusal(fileText([recordFixture({ legacyConnectionIds: ["legacy-1"] })]))).toMatchObject(
      { reason: "corrupt" },
    );
  });
});
