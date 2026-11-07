import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { agentCapabilitySchema } from "@/shared/contracts/agent";
import { normalizeSharedSettings } from "@/shared/settings";
import { STATUS_CACHE_VERSION } from "@/shared/agentStatusCache";
import { inspectProviderInventory } from "./hostProviderInventory";
import type { AdminSupervisorCall } from "./hostProviderAuth";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "poracode-inventory-"));
  roots.push(root);
  const statusCachePath = join(root, "status.json");
  const call = vi.fn<AdminSupervisorCall>(async () => {
    throw new Error("Unexpected provider discovery");
  });
  const readSettings = () =>
    normalizeSharedSettings({
      agentInstances: {
        fixture: {
          id: "fixture",
          driver: "acp-generic",
          displayName: "Configured fixture",
          enabled: false,
          environment: { FIXTURE_KEY: { value: "never-return-secret", sensitive: true } },
        },
      },
    });
  return { root, statusCachePath, call, readSettings };
}
const nativeEnv = process.platform === "win32" ? "windows" : "posix";
function status(kind: string, envKind = nativeEnv, envDistro?: string) {
  return {
    kind,
    label: kind,
    installed: true,
    authState: "authenticated",
    envKind,
    ...(envDistro ? { envDistro } : {}),
    capabilities: agentCapabilitySchema.parse({}),
    loginCommand: "private-command",
    authMethods: [
      { id: "key", name: "Key", type: "terminal", env: { TOKEN: "never-return-secret" } },
    ],
    providerMetadata: { authenticatedAs: "fixture@example.test" },
  };
}

it("reads shared saved observations without discovery and keeps configured profiles host scoped", async () => {
  const f = fixture();
  const bytes = JSON.stringify({
    version: STATUS_CACHE_VERSION,
    windows: [status("native"), status("other-os", nativeEnv === "windows" ? "posix" : "windows")],
    wsl: [status("ubuntu", "wsl", "Ubuntu"), status("debian", "wsl", "Debian")],
  });
  writeFileSync(f.statusCachePath, bytes);
  const native = await inspectProviderInventory(
    { action: "providers-inventory", refresh: false },
    f,
  );
  expect(native).toMatchObject({
    formatVersion: 1,
    environment: { kind: "native" },
    observation: { source: "saved-cache", state: "available", version: STATUS_CACHE_VERSION },
    configurationScope: "host",
  });
  expect(native.providers.map((p) => p.kind)).toEqual(["native"]);
  expect(native.profiles).toEqual([
    {
      id: "fixture",
      driver: "acp-generic",
      displayName: "Configured fixture",
      enabled: false,
      environmentNames: ["FIXTURE_KEY"],
    },
  ]);
  expect(JSON.stringify(native)).not.toMatch(
    /never-return-secret|private-command|authMethods|loginCommand/,
  );
  const wsl = await inspectProviderInventory(
    { action: "providers-inventory", refresh: false, wslDistro: "Ubuntu" },
    f,
  );
  expect(wsl.environment).toEqual({ kind: "wsl", distro: "Ubuntu" });
  expect(wsl.providers.map((p) => p.kind)).toEqual(["ubuntu"]);
  const wrongCase = await inspectProviderInventory(
    { action: "providers-inventory", refresh: false, wslDistro: "ubuntu" },
    f,
  );
  expect(wrongCase.providers).toEqual([]);
  expect(wsl.profiles).toEqual(native.profiles);
  expect(f.call).not.toHaveBeenCalled();
  expect(readFileSync(f.statusCachePath, "utf8")).toBe(bytes);
});

it.each(["missing", "invalid-json", "invalid-shape", "oversized", "directory"])(
  "reports %s without probing or claiming availability",
  async (reason) => {
    const f = fixture();
    if (reason === "invalid-json") writeFileSync(f.statusCachePath, "{");
    if (reason === "invalid-shape")
      writeFileSync(
        f.statusCachePath,
        JSON.stringify({ version: STATUS_CACHE_VERSION, windows: {} }),
      );
    if (reason === "oversized") writeFileSync(f.statusCachePath, " ".repeat(8 * 1024 * 1024 + 1));
    if (reason === "directory") mkdirSync(f.statusCachePath);
    const result = await inspectProviderInventory(
      { action: "providers-inventory", refresh: false },
      f,
    );
    expect(result.providers).toEqual([]);
    expect(result.profiles).toHaveLength(1);
    expect(result.observation).toMatchObject({
      source: "saved-cache",
      state:
        reason === "missing" ? "missing" : reason.startsWith("invalid") ? "invalid" : "unavailable",
    });
    expect(f.call).not.toHaveBeenCalled();
  },
);

it.each([66, STATUS_CACHE_VERSION + 1])(
  "does not interpret cache v%s or overwrite it on passive reads",
  async (version) => {
    const f = fixture();
    const bytes = JSON.stringify({ version, windows: [status("old-or-future")] });
    writeFileSync(f.statusCachePath, bytes);
    const result = await inspectProviderInventory(
      { action: "providers-inventory", refresh: false },
      f,
    );
    expect(result.observation).toEqual({ source: "saved-cache", state: "incompatible", version });
    expect(result.providers).toEqual([]);
    expect(f.call).not.toHaveBeenCalled();
    expect(readFileSync(f.statusCachePath, "utf8")).toBe(bytes);
  },
);

it.each([67, 68, 69])(
  "reuses compatible v%s saved observations without discovery or writes",
  async (version) => {
    const f = fixture();
    const bytes = JSON.stringify({ version, windows: [status("unchanged")] });
    writeFileSync(f.statusCachePath, bytes);
    const result = await inspectProviderInventory(
      { action: "providers-inventory", refresh: false },
      f,
    );
    expect(result.observation).toEqual({ source: "saved-cache", state: "available", version });
    expect(result.providers.map((provider) => provider.kind)).toEqual(["unchanged"]);
    expect(f.call).not.toHaveBeenCalled();
    expect(readFileSync(f.statusCachePath, "utf8")).toBe(bytes);
  },
);

it("refuses explicit refresh before discovery when the cache belongs to a newer host", async () => {
  const f = fixture();
  const bytes = JSON.stringify({ version: STATUS_CACHE_VERSION + 1, windows: [status("future")] });
  writeFileSync(f.statusCachePath, bytes);
  await expect(
    inspectProviderInventory({ action: "providers-inventory", refresh: true }, f),
  ).rejects.toThrow("No refresh was started");
  expect(f.call).not.toHaveBeenCalled();
  expect(readFileSync(f.statusCachePath, "utf8")).toBe(bytes);
});

it("refuses refresh when the saved version cannot be safely inspected", async () => {
  const f = fixture();
  const bytes = JSON.stringify({
    version: STATUS_CACHE_VERSION + 1,
    opaque: "x".repeat(8 * 1024 * 1024),
  });
  writeFileSync(f.statusCachePath, bytes);
  await expect(
    inspectProviderInventory({ action: "providers-inventory", refresh: true }, f),
  ).rejects.toThrow("could not be safely inspected");
  expect(f.call).not.toHaveBeenCalled();
  expect(readFileSync(f.statusCachePath, "utf8")).toBe(bytes);
});

it("explicitly refreshes only the selected environment using the existing supervisor path", async () => {
  const f = fixture();
  f.call.mockResolvedValue({
    windows: [status("native")],
    wsl: [status("ubuntu", "wsl", "Ubuntu"), status("debian", "wsl", "Debian")],
  } as never);
  const result = await inspectProviderInventory(
    { action: "providers-inventory", refresh: true, wslDistro: "Ubuntu" },
    f,
  );
  expect(f.call).toHaveBeenCalledExactlyOnceWith("refreshAgentStatuses", {
    wslDistros: ["Ubuntu"],
  });
  expect(result.observation).toEqual({ source: "refresh" });
  expect(result.providers.map((p) => p.kind)).toEqual(["ubuntu"]);
});
