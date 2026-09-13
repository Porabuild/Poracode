import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  settingsSubjectId,
  type SettingsSnapshot,
  type SettingsSubject,
} from "@/shared/settingsTransactions";
import { SettingsAuthority, type SettingsAuthorityOptions } from "./SettingsAuthority";
import * as persistence from "./persistSettingsDocument";

describe("settings authority admission and publication", () => {
  let root: string;
  const authorities: SettingsAuthority[] = [];
  const releases: Array<() => void> = [];
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "settings-admission-"));
  });
  afterEach(async () => {
    releases.splice(0).forEach((release) => release());
    await Promise.all(authorities.splice(0).map((authority) => authority.close()));
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });
  async function open(options: Partial<Omit<SettingsAuthorityOptions, "lease">> = {}) {
    const authority = await SettingsAuthority.open({
      lease: { paths: { dataRoot: root }, generation: randomUUID(), assertActive: () => {} },
      ...options,
    });
    authorities.push(authority);
    return authority;
  }
  function request(
    snapshot: SettingsSnapshot,
    field: "themeMode" | "guiChatFontSize" | "crossagentRoutingGuide",
    value: string | number,
  ) {
    const subject = { kind: "field", field } as const;
    return {
      version: 1,
      authorityId: snapshot.authorityId,
      edits: [
        {
          subject,
          expectedRevision: snapshot.revisions[settingsSubjectId(subject)],
          operation: "set",
          value,
        },
      ],
    };
  }
  function holdFirstWrite() {
    const ready = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    releases.push(release.resolve);
    const actual = persistence.persistSettingsDocument;
    vi.spyOn(persistence, "persistSettingsDocument").mockImplementationOnce(async (...args) => {
      ready.resolve();
      await release.promise;
      await actual(...args);
    });
    return { ready: ready.promise, release: release.resolve };
  }
  async function immediate<T>(result: Promise<T>): Promise<T | "still queued"> {
    return Promise.race([
      result,
      new Promise<"still queued">((resolve) => setTimeout(() => resolve("still queued"), 50)),
    ]);
  }

  it("bounds in-flight plus queued count and releases capacity after commit", async () => {
    const authority = await open({ admissionLimits: { maxPendingTransactions: 2 } });
    const snapshot = authority.snapshot();
    const hold = holdFirstWrite();
    const first = authority.mutate(request(snapshot, "themeMode", "light"), () => true);
    await hold.ready;
    const queued = authority.mutate(request(snapshot, "guiChatFontSize", 18), () => true);
    await expect(
      immediate(
        authority.mutate(request(snapshot, "crossagentRoutingGuide", "fixture"), () => true),
      ),
    ).resolves.toMatchObject({ status: "overloaded", reason: "queue-full", sequence: 0 });
    await expect(readFile(join(root, "settings.json"))).rejects.toMatchObject({ code: "ENOENT" });
    hold.release();
    await expect(first).resolves.toMatchObject({ status: "committed", sequence: 1 });
    await expect(queued).resolves.toMatchObject({ status: "committed", sequence: 2 });
    await expect(
      authority.mutate(request(snapshot, "crossagentRoutingGuide", "fixture"), () => true),
    ).resolves.toMatchObject({ status: "committed", sequence: 3 });
    expect(authority.readSettings()).toMatchObject({ themeMode: "light", guiChatFontSize: 18 });
  });

  it("bounds queued UTF-8 bytes, not only character counts", async () => {
    const authority = await open({
      admissionLimits: { maxPendingBytes: 1536, maxTransactionBytes: 2048 },
    });
    const snapshot = authority.snapshot();
    const input = request(snapshot, "crossagentRoutingGuide", "é".repeat(400));
    expect(JSON.stringify(input).length * 2).toBeLessThan(1536);
    expect(Buffer.byteLength(JSON.stringify(input), "utf8") * 2).toBeGreaterThan(1536);
    const hold = holdFirstWrite();
    const first = authority.mutate(input, () => true);
    await hold.ready;
    await expect(immediate(authority.mutate(input, () => true))).resolves.toMatchObject({
      status: "overloaded",
      reason: "queue-full",
    });
    hold.release();
    await first;
  });

  it("rejects oversized requests before admission and does not retain failed-parse capacity", async () => {
    const authority = await open({
      admissionLimits: { maxPendingTransactions: 1, maxTransactionBytes: 300 },
    });
    const snapshot = authority.snapshot();
    await expect(
      authority.mutate(
        request(snapshot, "crossagentRoutingGuide", "large".repeat(1000)),
        () => true,
      ),
    ).resolves.toMatchObject({ status: "overloaded", reason: "request-too-large" });
    await expect(authority.mutate({}, () => true)).rejects.toThrow("Invalid input");
    await expect(
      authority.mutate(request(snapshot, "themeMode", "light"), () => true),
    ).resolves.toMatchObject({ status: "committed", sequence: 1 });
  });

  it("releases all rejected transaction paths without advancing the commit sequence", async () => {
    const authority = await open({ admissionLimits: { maxPendingTransactions: 1 } });
    const snapshot = authority.snapshot();
    await expect(
      authority.mutate(request(snapshot, "themeMode", "light"), () => false),
    ).rejects.toThrow("not authorized");
    vi.spyOn(persistence, "persistSettingsDocument").mockRejectedValueOnce(
      new Error("Fixture persistence refused"),
    );
    await expect(
      authority.mutate(request(snapshot, "themeMode", "light"), () => true),
    ).rejects.toThrow("Fixture persistence refused");
    expect(authority.snapshot().sequence).toBe(0);
    await expect(
      authority.mutate(request(snapshot, "themeMode", "light"), () => true),
    ).resolves.toMatchObject({ status: "committed", sequence: 1 });
    await expect(
      authority.mutate(request(snapshot, "themeMode", "dark"), () => true),
    ).resolves.toMatchObject({ status: "conflict", sequence: 1 });
    await expect(
      authority.mutate(request(snapshot, "guiChatFontSize", 18), () => true),
    ).resolves.toMatchObject({ status: "committed", sequence: 2 });
  });

  it("returns ancestor revisions without sending ancestor values and resets sequence for a new authority", async () => {
    const authority = await open();
    const snapshot = authority.snapshot();
    const subject: SettingsSubject = { kind: "entry", field: "hiddenModels", key: "fixture" };
    const field: SettingsSubject = { kind: "field", field: "hiddenModels" };
    const result = await authority.mutate(
      {
        version: 1,
        authorityId: snapshot.authorityId,
        edits: [{ operation: "set", subject, expectedRevision: "missing", value: ["model"] }],
      },
      () => true,
    );
    if (result.status !== "committed") throw new Error("Expected a commit");
    const current = authority.snapshot();
    expect(result.sequence).toBe(current.sequence);
    expect(result.revisions).toEqual({
      [settingsSubjectId(subject)]: current.revisions[settingsSubjectId(subject)],
      [settingsSubjectId(field)]: current.revisions[settingsSubjectId(field)],
    });
    expect(result.revisions[settingsSubjectId(field)]).not.toBe(
      snapshot.revisions[settingsSubjectId(field)],
    );
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.subject).toEqual(subject);
    await authority.close();
    const next = await open();
    expect(next.snapshot()).toMatchObject({
      sequence: 0,
      settings: { hiddenModels: { fixture: ["model"] } },
    });
    expect(next.authorityId).not.toBe(snapshot.authorityId);
  });

  it("updates descendant revisions when a containing field replaces or deletes entries", async () => {
    const authority = await open();
    const first = authority.snapshot();
    const field: SettingsSubject = { kind: "field", field: "hiddenModels" };
    const entry: SettingsSubject = { kind: "entry", field: "hiddenModels", key: "fixture" };
    const commit = (snapshot: SettingsSnapshot, value: unknown) =>
      authority.mutate(
        {
          version: 1,
          authorityId: snapshot.authorityId,
          edits: [
            {
              operation: "set",
              subject: field,
              value,
              expectedRevision: snapshot.revisions[settingsSubjectId(field)],
            },
          ],
        },
        () => true,
      );
    const created = await commit(first, { fixture: ["model"] });
    if (created.status !== "committed") throw new Error("Expected a commit");
    expect(created.revisions[settingsSubjectId(entry)]).toBe(
      authority.snapshot().revisions[settingsSubjectId(entry)],
    );
    const deleted = await commit(authority.snapshot(), {});
    if (deleted.status !== "committed") throw new Error("Expected a commit");
    expect(deleted.revisions[settingsSubjectId(entry)]).toBe("missing");
    expect(deleted.changes).toHaveLength(1);
    expect(deleted.changes[0]?.subject).toEqual(field);
  });
});
