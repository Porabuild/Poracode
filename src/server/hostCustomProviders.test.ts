import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { HostOwnerController } from "@/backend/ownership/HostOwnerController";
import { SettingsAuthority } from "@/backend/settings/SettingsAuthority";
import { SettingsCompatWriter } from "@/backend/settings/settingsCompatWrites";
import { configureSecretStorageKey, decryptSecret } from "@/shared/secretStorage";
import {
  acpGenericCommandForEnvironment,
  parseAcpGenericInstanceConfig,
} from "@/shared/contracts/agentInstance";
import { customAcpAgentResultSchema } from "@/shared/contracts/customAcpAgents";
import { HostCustomProviders } from "./hostCustomProviders";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});
async function fixture() {
  mkdirSync(resolve("tmp/cli-custom-acp-20261021"), { recursive: true });
  const root = mkdtempSync(resolve("tmp/cli-custom-acp-20261021/test-"));
  const owner = HostOwnerController.acquire(join(root, "profile"), "headless");
  const runtime = await owner.initialize({ mode: "headless" });
  configureSecretStorageKey(runtime.secretStorageKey);
  const authority = await SettingsAuthority.open({
    lease: runtime.lease,
    assertPreparedDatabaseForWrite() {},
    assertPersistentCredentials: () => runtime.credentialCapabilities.assertCanPersistSecrets(),
  });
  cleanup.push(async () => {
    await authority.close();
    await owner.close();
  });
  const writer = new SettingsCompatWriter(authority);
  const persist = vi.fn<() => void>(() => runtime.credentialCapabilities.assertCanPersistSecrets());
  const changed = vi.fn<(kind: string) => Promise<void>>(async () => undefined);
  const host = new HostCustomProviders({
    settings: writer,
    readSettings: () => authority.readSettings(),
    assertCanPersistSecrets: persist,
    onChanged: changed,
  });
  const context = {
    signal: new AbortController().signal,
    assertActive: () => runtime.lease.assertActive(),
  };
  const add = {
    version: 1 as const,
    action: "add" as const,
    id: "custom",
    displayName: "Custom",
    definition: {
      binary: process.execPath,
      args: ["private-command-argument"],
      cwd: "project" as const,
      authMode: "none" as const,
    },
  };
  const inspect = async () => {
    const result = await host.execute({ version: 1, action: "inspect", id: add.id }, context);
    if (!("agent" in result)) throw Error("Expected inspected agent");
    return result.agent;
  };
  return {
    host,
    authority,
    writer,
    persist,
    changed,
    add,
    inspect,
    context,
    raw: () =>
      existsSync(runtime.paths.settingsPath)
        ? readFileSync(runtime.paths.settingsPath, "utf8")
        : "",
  };
}

it("registers an explicitly native command without a WSL fallback, seals values and returns only public metadata", async () => {
  const f = await fixture();
  const result = await f.host.execute(
    { ...f.add, environment: { CUSTOM_TOKEN: "synthetic-private-token" } },
    f.context,
  );
  expect(result).toMatchObject({
    version: 1,
    action: "add",
    agent: {
      id: "custom",
      kind: "acp-generic:custom",
      command: { binary: process.execPath, argumentCount: 1 },
      environmentNames: ["CUSTOM_TOKEN"],
    },
  });
  expect(f.changed).toHaveBeenCalledExactlyOnceWith("acp-generic:custom");
  expect(JSON.stringify(result)).not.toContain("synthetic-private-token");
  expect(JSON.stringify(result)).not.toContain("private-command-argument");
  expect(f.raw()).not.toContain("synthetic-private-token");
  const instance = f.authority.readSettings().agentInstances.custom!;
  expect(decryptSecret("", instance.environment!.CUSTOM_TOKEN!.value)).toBe(
    "synthetic-private-token",
  );
  const config = parseAcpGenericInstanceConfig(instance.config);
  expect(acpGenericCommandForEnvironment(config, { kind: "native" })?.binary).toBe(
    process.execPath,
  );
  expect(acpGenericCommandForEnvironment(config, { kind: "wsl", distro: "Other" })).toBeUndefined();
  await expect(f.host.execute(f.add, f.context)).rejects.toThrow("already configured");
  expect(f.changed).toHaveBeenCalledOnce();
});

it("refuses future/widened definitions and unavailable secret custody before persistence", async () => {
  const f = await fixture();
  const before = f.raw();
  await expect(f.host.execute({ ...f.add, version: 2 } as never, f.context)).rejects.toThrow(
    "version",
  );
  await expect(
    f.host.execute(
      { ...f.add, definition: { ...f.add.definition, env: { TOKEN: "plaintext" } } } as never,
      f.context,
    ),
  ).rejects.toThrow("env");
  await expect(
    f.host.execute(
      { ...f.add, environment: { TOKEN: "lc-safe:v1:foreign:bytes:ciphertext" } },
      f.context,
    ),
  ).rejects.toThrow("ciphertext cannot be imported");
  await expect(
    f.host.execute(
      { ...f.add, definition: { ...f.add.definition, cwd: "fixed", fixedCwd: "relative" } },
      f.context,
    ),
  ).rejects.toThrow("absolute");
  f.persist.mockImplementation(() => {
    throw Error("Persistence unavailable");
  });
  await expect(
    f.host.execute({ ...f.add, environment: { TOKEN: "hidden" } }, f.context),
  ).rejects.toThrow("Persistence unavailable");
  expect(f.raw()).toBe(before);
});

it("awaits reconciliation after durable add, rename, disable and removal commits", async () => {
  const f = await fixture();
  const joined = Promise.withResolvers<void>();
  f.changed.mockImplementationOnce(async () => {
    expect(f.authority.readSettings().agentInstances.custom?.displayName).toBe("Custom");
    await joined.promise;
  });
  let completed = false;
  const adding = f.host.execute(f.add, f.context).then((value) => {
    completed = true;
    return value;
  });
  await vi.waitFor(() => expect(f.changed).toHaveBeenCalledOnce());
  expect(completed).toBe(false);
  joined.resolve();
  await adding;
  for (const change of [{ displayName: "Renamed" }, { enabled: false }]) {
    const agent = await f.inspect();
    await f.host.execute(
      {
        version: 1,
        action: "configure",
        id: "custom",
        expectedRevision: agent.revision,
        ...change,
      },
      f.context,
    );
  }
  const agent = await f.inspect();
  await f.host.execute(
    { version: 1, action: "remove", id: "custom", expectedRevision: agent.revision },
    f.context,
  );
  expect(f.authority.readSettings().agentInstances.custom).toBeUndefined();
  expect(f.changed.mock.calls).toEqual(Array.from({ length: 4 }, () => ["acp-generic:custom"]));
});

it("returns a committed revision that can be reused immediately after adding a sealed environment", async () => {
  const f = await fixture();
  const added = await f.host.execute({ ...f.add, environment: { TOKEN: "synthetic" } }, f.context);
  if (!("agent" in added)) throw Error("Missing created metadata");
  expect((await f.inspect()).revision).toBe(added.agent.revision);
  await expect(
    f.host.execute(
      {
        version: 1,
        action: "configure",
        id: "custom",
        expectedRevision: added.agent.revision,
        displayName: "Immediate update",
      },
      f.context,
    ),
  ).resolves.toMatchObject({ agent: { displayName: "Immediate update" } });
});

it("preserves sealed bytes on metadata edits and clears auth acknowledgements on explicit credential changes", async () => {
  const f = await fixture();
  await f.host.execute(
    { ...f.add, environment: { TOKEN: "original", OTHER: "unchanged" } },
    f.context,
  );
  await f.writer.editSettingsField("agentInstances", (current) => ({
    ...current.agentInstances,
    custom: { ...current.agentInstances.custom!, authAcknowledged: { native: true } },
  }));
  const before = f.authority.readSettings().agentInstances.custom!;
  let agent = await f.inspect();
  await f.host.execute(
    {
      version: 1,
      action: "configure",
      id: "custom",
      expectedRevision: agent.revision,
      displayName: "Renamed",
    },
    f.context,
  );
  expect(f.authority.readSettings().agentInstances.custom!.environment).toEqual(before.environment);
  expect(f.authority.readSettings().agentInstances.custom!.authAcknowledged).toEqual({
    native: true,
  });
  agent = await f.inspect();
  await f.host.execute(
    {
      version: 1,
      action: "configure",
      id: "custom",
      expectedRevision: agent.revision,
      environment: { TOKEN: "replacement", OTHER: "" },
    },
    f.context,
  );
  const updated = f.authority.readSettings().agentInstances.custom!;
  expect(updated.authAcknowledged).toBeUndefined();
  expect(updated.environment!.OTHER).toBeUndefined();
  expect(decryptSecret("", updated.environment!.TOKEN!.value)).toBe("replacement");
});

it("refuses a same-registration race from a fresh CAS retry without overwriting the competing edit", async () => {
  const f = await fixture();
  await f.host.execute(f.add, f.context);
  const agent = await f.inspect();
  const original = f.authority.mutate.bind(f.authority);
  vi.spyOn(f.authority, "mutate").mockImplementationOnce(async (...args) => {
    await f.writer.editSettingsField("agentInstances", (current) => ({
      ...current.agentInstances,
      custom: { ...current.agentInstances.custom!, displayName: "Concurrent" },
    }));
    return original(...args);
  });
  await expect(
    f.host.execute(
      {
        version: 1,
        action: "configure",
        id: "custom",
        expectedRevision: agent.revision,
        displayName: "Stale",
      },
      f.context,
    ),
  ).rejects.toThrow("changed");
  expect(f.authority.readSettings().agentInstances.custom!.displayName).toBe("Concurrent");
});

it("rebases a sibling edit while removing only the selected registration's configuration and preferences", async () => {
  const f = await fixture();
  await f.host.execute(f.add, f.context);
  const agent = await f.inspect();
  const original = f.authority.mutate.bind(f.authority);
  vi.spyOn(f.authority, "mutate").mockImplementationOnce(async (...args) => {
    await f.writer.editSettingsField("agentInstances", (current) => ({
      ...current.agentInstances,
      sibling: { id: "sibling", driver: "neutral" },
    }));
    return original(...args);
  });
  expect(
    await f.host.execute(
      { version: 1, action: "remove", id: "custom", expectedRevision: agent.revision },
      f.context,
    ),
  ).toMatchObject({ removed: true });
  expect(f.authority.readSettings().agentInstances.custom).toBeUndefined();
  expect(f.authority.readSettings().agentInstances.sibling).toEqual({
    id: "sibling",
    driver: "neutral",
  });
});

it("refuses registry installations, profiles, old unscoped registrations and revisions from another owner instance", async () => {
  const f = await fixture();
  await f.host.execute(f.add, f.context);
  const agent = await f.inspect();
  const second = new HostCustomProviders({
    settings: f.writer,
    readSettings: () => f.authority.readSettings(),
    assertCanPersistSecrets: f.persist,
  });
  await expect(
    second.execute(
      { version: 1, action: "remove", id: "custom", expectedRevision: agent.revision },
      f.context,
    ),
  ).rejects.toThrow("changed");
  await f.writer.editSettingsField("agentInstances", (current) => ({
    ...current.agentInstances,
    old: { id: "old", driver: "acp-generic", config: { binary: "agent" } },
    profile: { id: "profile", driver: "codex" },
  }));
  await expect(
    f.host.execute({ version: 1, action: "inspect", id: "old" }, f.context),
  ).rejects.toThrow("native-only");
  await expect(
    f.host.execute({ version: 1, action: "inspect", id: "profile" }, f.context),
  ).rejects.toThrow("managed separately");
  await f.writer.editSettingsField("acpRegistryInstalledAgents", (current) => ({
    ...current.acpRegistryInstalledAgents,
    custom: {
      id: "custom",
      name: "Custom",
      version: "1",
      installedAt: "now",
      adapterKind: "acp-generic:custom",
      installKind: "generic",
    },
  }));
  await expect(f.inspect()).rejects.toThrow("managed separately");
  const list = customAcpAgentResultSchema.parse(
    await f.host.execute({ version: 1, action: "list" }, f.context),
  );
  expect(list).toMatchObject({ agents: [] });
});
