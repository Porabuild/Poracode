import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { AcquiredOpenCode2Server } from "./client";
import type { CredentialEntry } from "./clientTypes";
import type { OpenCode2Database } from "./database";
import type { OpenCode2CredentialJournal } from "./credentialJournal";
import {
  clearOpenCode2CredentialCompatibility,
  revokeOpenCode2Credential,
  synchronizeOpenCode2Credentials,
} from "./credentialCompatibility";

const mocks = vi.hoisted(() => ({
  open: vi.fn<typeof import("./credentialJournal").openOpenCode2CredentialJournal>(),
}));
vi.mock("./credentialJournal", () => ({ openOpenCode2CredentialJournal: mocks.open }));

const location: ProjectLocation = { kind: "posix", path: "/fixture" };
function credential(id: string, active = true): CredentialEntry {
  return {
    id,
    integrationID: "fixture",
    label: "Fixture key",
    active,
    value: { type: "key", key: "synthetic-not-a-real-key" },
  };
}

function server(database: AcquiredOpenCode2Server["database"], initial: CredentialEntry[]) {
  const entries = new Map(initial.map((entry) => [entry.id, structuredClone(entry)]));
  const api = {
    list: vi.fn<() => Promise<CredentialEntry[]>>(async () =>
      [...entries.values()].map((entry) => structuredClone(entry)),
    ),
    create: vi.fn<
      (input: {
        id: string;
        integrationID: string;
        label: string;
        value: CredentialEntry["value"];
        activate: boolean;
      }) => Promise<CredentialEntry>
    >(
      async (input: {
        id: string;
        integrationID: string;
        label: string;
        value: CredentialEntry["value"];
        activate: boolean;
      }) => {
        if (entries.has(input.id)) throw new Error("Conflicting credential");
        if (input.activate)
          for (const entry of entries.values())
            if (entry.integrationID === input.integrationID) entry.active = false;
        const created = { ...input, active: input.activate };
        entries.set(input.id, created);
        return created;
      },
    ),
    remove: vi.fn<(input: { credentialID: string }) => Promise<void>>(
      async ({ credentialID }: { credentialID: string }) => {
        entries.delete(credentialID);
      },
    ),
    activate: vi.fn<(input: { credentialID: string }) => Promise<void>>(
      async ({ credentialID }: { credentialID: string }) => {
        const selected = entries.get(credentialID);
        if (!selected) throw new Error("Missing fixture credential");
        for (const entry of entries.values())
          if (entry.integrationID === selected.integrationID)
            entry.active = entry.id === credentialID;
      },
    ),
  };
  const acquired = {
    database,
    client: { credential: api },
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as AcquiredOpenCode2Server;
  return { entries, api, acquired };
}

describe("OpenCode credential compatibility", () => {
  let journal: OpenCode2CredentialJournal;
  let write: import("vitest").Mock<(value: OpenCode2CredentialJournal) => Promise<void>>;
  beforeEach(() => {
    clearOpenCode2CredentialCompatibility();
    journal = { version: 1, credentials: {} };
    write = vi.fn<(value: OpenCode2CredentialJournal) => Promise<void>>(
      async (value: OpenCode2CredentialJournal) => {
        journal = structuredClone(value);
      },
    );
    mocks.open.mockReset().mockResolvedValue({
      read: async () => structuredClone(journal),
      write,
      lock: async () => async () => {},
    });
  });

  it("imports pre-upgrade credentials while retaining native selection and legacy conversation storage", async () => {
    const native = server("native", [credential("native-selected")]);
    const legacy = server("legacy-isolated", [credential("old-key")]);
    const acquire = vi.fn<(database: OpenCode2Database) => Promise<AcquiredOpenCode2Server>>(
      async (database) => (database === "native" ? native.acquired : legacy.acquired),
    );
    await synchronizeOpenCode2Credentials(location, native.acquired, acquire);
    expect(native.entries.get("old-key")).toMatchObject({ id: "old-key", active: false });
    expect(native.entries.get("native-selected")?.active).toBe(true);
    expect(journal.credentials["old-key"]).toBe("imported");
    await synchronizeOpenCode2Credentials(location, legacy.acquired, acquire);
    expect(legacy.entries.get("old-key")?.active).toBe(false);
    expect(legacy.entries.get("native-selected")?.active).toBe(true);
    expect(legacy.acquired.database).toBe("legacy-isolated");
    expect(legacy.acquired.dispose).toHaveBeenCalled();
    expect(native.acquired.dispose).toHaveBeenCalled();
  });

  it("never resurrects a previously imported credential after native CLI removal", async () => {
    const native = server("native", []);
    const legacy = server("legacy-isolated", [credential("old-key")]);
    const acquire = async (database: string) =>
      database === "native" ? native.acquired : legacy.acquired;
    await synchronizeOpenCode2Credentials(location, native.acquired, acquire);
    native.entries.delete("old-key");
    clearOpenCode2CredentialCompatibility();
    await synchronizeOpenCode2Credentials(location, legacy.acquired, acquire);
    expect(native.entries.size).toBe(0);
    expect(legacy.entries.size).toBe(0);
    expect(native.api.create).toHaveBeenCalledTimes(1);
  });

  it("recovers a failed import from its pending journal after restart", async () => {
    const native = server("native", []);
    const legacy = server("legacy-isolated", [credential("old-key")]);
    const acquire = async () => legacy.acquired;
    native.api.create.mockRejectedValueOnce(new Error("fixture import failed"));
    await expect(
      synchronizeOpenCode2Credentials(location, native.acquired, acquire),
    ).rejects.toThrow("fixture import failed");
    expect(journal.credentials["old-key"]).toBe("pending-import");
    clearOpenCode2CredentialCompatibility();
    await synchronizeOpenCode2Credentials(location, native.acquired, acquire);
    expect(native.entries.has("old-key")).toBe(true);
    expect(journal.credentials["old-key"]).toBe("imported");
  });

  it("persists revocation before either delete and retries interruption without reimport", async () => {
    const native = server("native", [credential("old-key")]);
    const legacy = server("legacy-isolated", [credential("old-key")]);
    const acquire = async (database: string) =>
      database === "native" ? native.acquired : legacy.acquired;
    native.api.remove.mockImplementationOnce(async ({ credentialID }) => {
      expect(journal.credentials[credentialID]).toBe("pending-revoke");
      native.entries.delete(credentialID);
    });
    legacy.api.remove.mockRejectedValueOnce(new Error("fixture removal failed"));
    await expect(revokeOpenCode2Credential(location, "old-key", acquire)).rejects.toThrow(
      "fixture removal failed",
    );
    expect(native.entries.size).toBe(0);
    expect(legacy.entries.size).toBe(1);
    expect(journal.credentials["old-key"]).toBe("pending-revoke");
    clearOpenCode2CredentialCompatibility();
    await synchronizeOpenCode2Credentials(location, legacy.acquired, acquire);
    expect(native.entries.size).toBe(0);
    expect(legacy.entries.size).toBe(0);
    expect(journal.credentials["old-key"]).toBe("revoked");
    expect(native.api.create).not.toHaveBeenCalled();
  });

  it("serializes concurrent migration and logout against the same upstream runtime", async () => {
    const native = server("native", []);
    const legacy = server("legacy-isolated", [credential("old-key")]);
    const acquire = async (database: string) =>
      database === "native" ? native.acquired : legacy.acquired;
    await Promise.all([
      synchronizeOpenCode2Credentials(location, native.acquired, acquire),
      revokeOpenCode2Credential(location, "old-key", acquire),
    ]);
    expect(native.entries.size).toBe(0);
    expect(legacy.entries.size).toBe(0);
    expect(journal.credentials["old-key"]).toBe("revoked");
  });

  it("keeps OAuth grants independent even when IDs collide or legacy tokens are newer", async () => {
    const oauth = (expires: number): CredentialEntry => ({
      ...credential("oauth"),
      value: {
        type: "oauth",
        methodID: "fixture",
        access: `synthetic-access-${expires}`,
        refresh: `synthetic-refresh-${expires}`,
        expires,
      },
    });
    const native = server("native", [oauth(100)]);
    const legacy = server("legacy-isolated", [oauth(200)]);
    const acquire = async () => native.acquired;
    await synchronizeOpenCode2Credentials(location, legacy.acquired, acquire);
    expect(native.entries.get("oauth")?.value).toEqual(oauth(100).value);
    expect(legacy.entries.get("oauth")?.value).toEqual(oauth(200).value);
    expect(native.entries.get("oauth")?.active).toBe(true);
    expect(native.api.create).not.toHaveBeenCalled();
    expect(legacy.api.create).not.toHaveBeenCalled();
  });

  it("does not import legacy OAuth or mirror native OAuth and preserves legacy selection", async () => {
    const oauth = (id: string): CredentialEntry => ({
      ...credential(id),
      value: {
        type: "oauth",
        methodID: "fixture",
        access: "synthetic-access",
        refresh: "synthetic-refresh",
        expires: 200,
      },
    });
    const native = server("native", [credential("native-key"), oauth("native-oauth")]);
    const legacy = server("legacy-isolated", [oauth("legacy-oauth")]);
    const acquire = async () => native.acquired;
    await synchronizeOpenCode2Credentials(location, legacy.acquired, acquire);
    expect(native.entries.has("legacy-oauth")).toBe(false);
    expect(legacy.entries.has("native-oauth")).toBe(false);
    expect(legacy.entries.get("legacy-oauth")?.active).toBe(true);
    expect(legacy.entries.get("native-key")?.active).toBe(false);
    expect(legacy.api.activate).toHaveBeenCalledExactlyOnceWith(
      { credentialID: "legacy-oauth" },
      expect.any(Object),
    );
    expect(journal.credentials["legacy-oauth"]).toBeUndefined();
  });
});
