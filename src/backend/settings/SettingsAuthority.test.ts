import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSharedSettings } from "@/shared/settings";
import { AGENT_PROFILE_DRIVERS } from "@/shared/contracts/agentProfiles";
import { sensitiveAgentSettingKeys } from "@/shared/agentSecrets";
import {
  SETTINGS_MISSING_REVISION,
  SETTINGS_TRANSACTION_VERSION,
  settingsEditSchema,
  settingsSubjectId,
  type SettingsEdit,
  type SettingsSnapshot,
  type SettingsSubject,
} from "@/shared/settingsTransactions";
import { SettingsAuthority, type SettingsAuthorityOptions } from "./SettingsAuthority";
import { SETTINGS_DOCUMENT_VERSION_KEY } from "./settingsDocument";

describe("SettingsAuthority", () => {
  let root: string;
  let settingsPath: string;
  let active: boolean;
  let generation: string;
  const authorities: SettingsAuthority[] = [];
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "settings-authority-"));
    settingsPath = join(root, "settings.json");
    active = true;
    generation = randomUUID();
  });
  afterEach(async () => {
    await Promise.all(authorities.splice(0).map((authority) => authority.close()));
    await rm(root, { recursive: true, force: true });
  });
  async function open(options: Partial<Omit<SettingsAuthorityOptions, "lease">> = {}) {
    const authority = await SettingsAuthority.open({
      lease: {
        paths: { dataRoot: root },
        generation,
        assertActive: (expected) => {
          if (!active || expected !== generation) throw new Error("Fixture lease is inactive");
        },
      },
      ...options,
    });
    authorities.push(authority);
    return authority;
  }
  const theme: SettingsSubject = { kind: "field", field: "themeMode" };
  const font: SettingsSubject = { kind: "field", field: "guiChatFontSize" };
  const allow = () => true;
  function set(snapshot: SettingsSnapshot, subject: SettingsSubject, value: unknown): SettingsEdit {
    return settingsEditSchema.parse({
      operation: "set",
      subject,
      value,
      expectedRevision: snapshot.revisions[settingsSubjectId(subject)] ?? SETTINGS_MISSING_REVISION,
    });
  }
  function request(snapshot: SettingsSnapshot, edits: SettingsEdit[]) {
    return { version: SETTINGS_TRANSACTION_VERSION, authorityId: snapshot.authorityId, edits };
  }
  const disk = async () =>
    JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;

  it("upgrades legacy0 on commit while preserving unknown fields and unaffected content revisions", async () => {
    const unknown = { futureToken: "retained-only-on-disk" };
    await writeFile(
      settingsPath,
      JSON.stringify({
        themeMode: "dark",
        futureSettings: unknown,
        browser: { allowEval: false, futureCapability: unknown },
        agentSettings: { fixture: { token: "lc-safe:unchanged-ciphertext" } },
      }),
    );
    const authority = await open();
    const before = authority.snapshot();
    expect(JSON.stringify(before)).not.toContain("retained-only-on-disk");
    expect((await disk())[SETTINGS_DOCUMENT_VERSION_KEY]).toBeUndefined();
    await expect(
      authority.mutate(request(before, [set(before, theme, "light")]), allow),
    ).resolves.toMatchObject({ status: "committed" });
    expect(await disk()).toMatchObject({
      [SETTINGS_DOCUMENT_VERSION_KEY]: 1,
      themeMode: "light",
      futureSettings: unknown,
      browser: { futureCapability: unknown },
      agentSettings: { fixture: { token: "lc-safe:unchanged-ciphertext" } },
    });
    expect(authority.snapshot().revisions[settingsSubjectId(font)]).toBe(
      before.revisions[settingsSubjectId(font)],
    );
  });

  it("keeps simultaneous disjoint edits and rejects a stale competing edit without writing", async () => {
    const authority = await open();
    const a = authority.snapshot(),
      b = authority.snapshot();
    const results = await Promise.all([
      authority.mutate(request(a, [set(a, theme, "light")]), allow),
      authority.mutate(request(b, [set(b, font, 18)]), allow),
    ]);
    expect(results.map((result) => result.status)).toEqual(["committed", "committed"]);
    expect(authority.readSettings()).toMatchObject({ themeMode: "light", guiChatFontSize: 18 });
    const bytes = await readFile(settingsPath, "utf8");
    const conflict = await authority.mutate(request(b, [set(b, theme, "dark")]), allow);
    expect(conflict).toMatchObject({
      status: "conflict",
      reason: "revision-changed",
      current: [{ value: "light" }],
    });
    expect(await readFile(settingsPath, "utf8")).toBe(bytes);
    if (conflict.status !== "conflict") throw new Error("Expected a conflict");
    await expect(
      authority.mutate(
        request(authority.snapshot(), [
          { ...set(b, theme, "dark"), expectedRevision: conflict.current[0]!.revision },
        ]),
        allow,
      ),
    ).resolves.toMatchObject({ status: "committed" });
    expect(authority.readSettings().themeMode).toBe("dark");
  });

  it("checks every subject before committing any part of a multi-subject change", async () => {
    const authority = await open();
    const old = authority.snapshot();
    await authority.mutate(request(old, [set(old, theme, "light")]), allow);
    const bytes = await readFile(settingsPath, "utf8");
    await expect(
      authority.mutate(request(old, [set(old, theme, "system"), set(old, font, 19)]), allow),
    ).resolves.toMatchObject({ status: "conflict" });
    expect(await readFile(settingsPath, "utf8")).toBe(bytes);
    expect(authority.readSettings().guiChatFontSize).toBe(defaultSharedSettings.guiChatFontSize);
  });

  it("keeps disjoint entries and agent settings while fencing a stale containing field", async () => {
    const authority = await open();
    const before = authority.snapshot();
    const subjects: SettingsSubject[] = [
      { kind: "entry", field: "hiddenModels", key: "first" },
      { kind: "entry", field: "hiddenModels", key: "second" },
      { kind: "agent-setting", agentKind: "fixture", key: "one" },
      { kind: "agent-setting", agentKind: "fixture", key: "two" },
    ];
    const values = [["one"], ["two"], true, "value"];
    const results = await Promise.all(
      subjects.map((subject, index) =>
        authority.mutate(request(before, [set(before, subject, values[index])]), allow),
      ),
    );
    expect(results.map((result) => result.status)).toEqual([
      "committed",
      "committed",
      "committed",
      "committed",
    ]);
    expect(authority.readSettings()).toMatchObject({
      hiddenModels: { first: ["one"], second: ["two"] },
      agentSettings: { fixture: { one: true, two: "value" } },
    });
    await expect(
      authority.mutate(
        request(before, [set(before, { kind: "field", field: "hiddenModels" }, {})]),
        allow,
      ),
    ).resolves.toMatchObject({ status: "conflict", reason: "revision-changed" });
  });

  it("compares missing entries for creates and represents deletion explicitly", async () => {
    const authority = await open();
    const subject: SettingsSubject = { kind: "entry", field: "hiddenModels", key: "fixture" };
    const old = authority.snapshot();
    await authority.mutate(request(old, [set(old, subject, ["small"])]), allow);
    await expect(
      authority.mutate(request(old, [set(old, subject, ["large"])]), allow),
    ).resolves.toMatchObject({ status: "conflict" });
    const current = authority.snapshot();
    await expect(
      authority.mutate(
        request(current, [
          {
            subject,
            operation: "delete",
            expectedRevision: current.revisions[settingsSubjectId(subject)]!,
          },
        ]),
        allow,
      ),
    ).resolves.toMatchObject({
      status: "committed",
      changes: [{ revision: SETTINGS_MISSING_REVISION }],
    });
    expect(authority.readSettings().hiddenModels.fixture).toBeUndefined();
  });

  it("updates one list entry without discarding its unknown fields or another entry", async () => {
    const server = {
      id: "one",
      name: "one",
      enabled: true,
      description: "",
      timeoutMs: 30_000,
      transport: { type: "stdio", command: "fixture", args: [], env: {}, futureTransport: "keep" },
      futureServer: "keep",
    };
    await writeFile(
      settingsPath,
      JSON.stringify({ mcpServers: [server, { ...server, id: "two", name: "two" }] }),
    );
    const authority = await open();
    const snapshot = authority.snapshot();
    const subject: SettingsSubject = { kind: "list-entry", field: "mcpServers", key: "one" };
    const value = { ...snapshot.settings.mcpServers[0]!, enabled: false };
    await authority.mutate(request(snapshot, [set(snapshot, subject, value)]), allow);
    expect((await disk()).mcpServers).toEqual([
      { ...server, enabled: false },
      { ...server, id: "two", name: "two" },
    ]);
  });

  it("requires persistent credential capability for newly sealed profile secrets", async () => {
    const driver = AGENT_PROFILE_DRIVERS.find((entry) => entry.credentialEnvVar)!;
    const subject: SettingsSubject = { kind: "entry", field: "agentInstances", key: "fixture" };
    const instance = {
      id: "fixture",
      driver: driver.driver,
      environment: { [driver.credentialEnvVar!]: { value: "lc-safe:v1:synthetic-ciphertext" } },
    };
    const authority = await open();
    const before = authority.snapshot();
    await expect(
      authority.mutate(request(before, [set(before, subject, instance)]), allow),
    ).rejects.toThrow("Persistent credential storage is unavailable");
    await expect(readFile(settingsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects unsealed sensitive values even when persistent credentials are available", async () => {
    const assertPersistentCredentials = vi.fn<() => void>();
    const authority = await open({ assertPersistentCredentials });
    const snapshot = authority.snapshot();
    const subject: SettingsSubject = { kind: "entry", field: "agentInstances", key: "fixture" };
    await expect(
      authority.mutate(
        request(snapshot, [
          set(snapshot, subject, {
            id: "fixture",
            driver: "fixture",
            environment: { TOKEN: { sensitive: true, value: "fixture-secret" } },
          }),
        ]),
        allow,
      ),
    ).rejects.toThrow("must be sealed");
    await expect(readFile(settingsPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(assertPersistentCredentials).toHaveBeenCalledOnce();
  });

  it("preserves or deletes unchanged ciphertext without a persistent key and gates changed secrets", async () => {
    const instance = {
      id: "fixture",
      driver: "fixture",
      displayName: "before",
      environment: { TOKEN: { sensitive: true, value: "lc-safe:v1:synthetic-before" } },
    };
    await writeFile(settingsPath, JSON.stringify({ agentInstances: { fixture: instance } }));
    const authority = await open();
    const subject: SettingsSubject = { kind: "entry", field: "agentInstances", key: "fixture" };
    const before = authority.snapshot();
    await authority.mutate(
      request(before, [set(before, subject, { ...instance, displayName: "after" })]),
      allow,
    );
    const current = authority.snapshot();
    const bytes = await readFile(settingsPath, "utf8");
    await expect(
      authority.mutate(
        request(current, [
          set(current, subject, {
            ...instance,
            environment: { TOKEN: { sensitive: true, value: "lc-safe:v1:synthetic-after" } },
          }),
        ]),
        allow,
      ),
    ).rejects.toThrow("Persistent credential storage is unavailable");
    expect(await readFile(settingsPath, "utf8")).toBe(bytes);
    await authority.mutate(
      request(current, [set(current, subject, { ...instance, environment: {} })]),
      allow,
    );
    expect(authority.readSettings().agentInstances.fixture?.environment).toEqual({});
    await authority.close();
    const assertPersistentCredentials = vi.fn<() => void>();
    const persistent = await open({ assertPersistentCredentials });
    const next = persistent.snapshot();
    await expect(
      persistent.mutate(request(next, [set(next, subject, instance)]), allow),
    ).resolves.toMatchObject({ status: "committed" });
    expect(assertPersistentCredentials).toHaveBeenCalledOnce();
  });

  it("enforces declared global secret keys and rejects new machine-scoped secret overrides", async () => {
    const profile = AGENT_PROFILE_DRIVERS.find(
      (entry) => sensitiveAgentSettingKeys(entry.driver).length > 0,
    )!;
    const key = sensitiveAgentSettingKeys(profile.driver)[0]!;
    const authority = await open();
    const before = authority.snapshot();
    await expect(
      authority.mutate(
        request(before, [
          set(
            before,
            { kind: "agent-setting", agentKind: profile.driver, key },
            "lc-safe:v1:fixture",
          ),
        ]),
        allow,
      ),
    ).rejects.toThrow("Persistent credential storage is unavailable");
    await expect(
      authority.mutate(
        request(before, [
          set(
            before,
            { kind: "entry", field: "machineSettings", key: "local" },
            {
              agentSettings: { [profile.driver]: { [key]: "fixture-secret" } },
            },
          ),
        ]),
        allow,
      ),
    ).rejects.toThrow("cannot be stored as machine overrides");
    await expect(readFile(settingsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["sensitive flag", "credential driver"])(
    "does not exempt unchanged plaintext when %s newly classifies it as a secret",
    async (classification) => {
      const credentialDriver = AGENT_PROFILE_DRIVERS.find((entry) => entry.credentialEnvVar)!;
      const name = credentialDriver.credentialEnvVar!;
      const instance = {
        id: "fixture",
        driver: "fixture",
        environment: { [name]: { value: "synthetic-value", sensitive: false } },
      };
      await writeFile(settingsPath, JSON.stringify({ agentInstances: { fixture: instance } }));
      const authority = await open();
      const before = authority.snapshot();
      const bytes = await readFile(settingsPath, "utf8");
      const subject: SettingsSubject = { kind: "entry", field: "agentInstances", key: "fixture" };
      const value =
        classification === "sensitive flag"
          ? { ...instance, environment: { [name]: { value: "synthetic-value", sensitive: true } } }
          : { ...instance, driver: credentialDriver.driver };
      await expect(
        authority.mutate(request(before, [set(before, subject, value)]), allow),
      ).rejects.toThrow("Persistent credential storage is unavailable");
      expect(await readFile(settingsPath, "utf8")).toBe(bytes);
      await authority.close();
      const persistent = await open({ assertPersistentCredentials: () => {} });
      const snapshot = persistent.snapshot();
      await expect(
        persistent.mutate(request(snapshot, [set(snapshot, subject, value)]), allow),
      ).rejects.toThrow("must be sealed");
      expect(await readFile(settingsPath, "utf8")).toBe(bytes);
    },
  );

  it("preserves explicit storage as plain text for a noncredential environment variable", async () => {
    const instance = {
      id: "fixture",
      driver: "fixture",
      environment: { TOKEN: { value: "lc-safe:v1:synthetic-ciphertext", sensitive: true } },
    };
    await writeFile(settingsPath, JSON.stringify({ agentInstances: { fixture: instance } }));
    const authority = await open();
    const before = authority.snapshot();
    const subject: SettingsSubject = { kind: "entry", field: "agentInstances", key: "fixture" };
    await expect(
      authority.mutate(
        request(before, [
          set(before, subject, {
            ...instance,
            environment: { TOKEN: { value: "explicit-plain-value", sensitive: false } },
          }),
        ]),
        allow,
      ),
    ).resolves.toMatchObject({ status: "committed" });
    expect(authority.readSettings().agentInstances.fixture?.environment?.TOKEN).toEqual({
      value: "explicit-plain-value",
      sensitive: false,
    });
  });

  it.each([
    ["malformed JSON", '{"themeMode":'],
    ["invalid existing field", '{"themeMode":17}'],
    ["future format", '{"$poracodeSettingsVersion":2,"themeMode":"dark"}'],
    ["malformed format", '{"$poracodeSettingsVersion":"1"}'],
    ["nonobject", "[]"],
  ])("refuses %s without changing exact bytes", async (_name, contents) => {
    await writeFile(settingsPath, contents!);
    await expect(open()).rejects.toThrow(/Shared settings/);
    expect(await readFile(settingsPath, "utf8")).toBe(contents);
  });

  it("rejects unauthorized/conflicting probes, unknown fields and overlapping subjects", async () => {
    const authority = await open();
    const snapshot = authority.snapshot();
    await expect(
      authority.mutate(
        { ...request(snapshot, [set(snapshot, theme, "light")]), authorityId: randomUUID() },
        () => false,
      ),
    ).rejects.toThrow("not authorized");
    await expect(
      authority.mutate(
        request(snapshot, [
          set(snapshot, { kind: "entry", field: "browser", key: "unknown" }, true),
        ]),
        allow,
      ),
    ).rejects.toThrow("Unknown settings value field");
    await expect(
      authority.mutate(
        request(snapshot, [set(snapshot, theme, "light"), set(snapshot, theme, "dark")]),
        allow,
      ),
    ).rejects.toThrow("Duplicate settings subject");
    await expect(
      authority.mutate(
        request(snapshot, [
          set(snapshot, { kind: "field", field: "browser" }, snapshot.settings.browser),
          set(snapshot, { kind: "entry", field: "browser", key: "allowEval" }, true),
        ]),
        allow,
      ),
    ).rejects.toThrow("Overlapping settings subjects");
    await expect(readFile(settingsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses committed copies, persists through reopen, and invalidates the previous authority", async () => {
    const authority = await open();
    const old = authority.snapshot();
    old.settings.themeMode = "light";
    expect(authority.readSettings().themeMode).toBe(defaultSharedSettings.themeMode);
    await authority.mutate(request(old, [set(old, font, 17)]), allow);
    await authority.close();
    const reopened = await open();
    expect(reopened.readSettings().guiChatFontSize).toBe(17);
    await expect(
      reopened.mutate(request(old, [set(old, theme, "light")]), allow),
    ).resolves.toMatchObject({ status: "conflict", reason: "authority-changed" });
  });

  it("keeps a committed result when notifications and reporting throw", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const authority = await open({
      onCommitted: () => {
        throw new Error("Fixture observer");
      },
      reportError: () => {
        throw new Error("Fixture reporting");
      },
    });
    try {
      const snapshot = authority.snapshot();
      await expect(
        authority.mutate(request(snapshot, [set(snapshot, theme, "light")]), allow),
      ).resolves.toMatchObject({ status: "committed" });
      expect(authority.readSettings().themeMode).toBe("light");
      expect((await disk()).themeMode).toBe("light");
      expect(warning).toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it("drains admitted writes before close and refuses access after lease loss", async () => {
    const authority = await open();
    const snapshot = authority.snapshot();
    const first = authority.mutate(request(snapshot, [set(snapshot, theme, "light")]), allow);
    const second = authority.mutate(request(snapshot, [set(snapshot, font, 18)]), allow);
    const closing = authority.close();
    await expect(
      authority.mutate(request(snapshot, [set(snapshot, font, 19)]), allow),
    ).rejects.toThrow("closing");
    await closing;
    expect((await Promise.all([first, second])).map((result) => result.status)).toEqual([
      "committed",
      "committed",
    ]);
    expect(await disk()).toMatchObject({ themeMode: "light", guiChatFontSize: 18 });
    const reopened = await open();
    active = false;
    expect(() => reopened.snapshot()).toThrow("lease is inactive");
    await expect(
      reopened.mutate(request(snapshot, [set(snapshot, font, 19)]), allow),
    ).rejects.toThrow("lease is inactive");
  });
});
