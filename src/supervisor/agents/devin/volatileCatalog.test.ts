import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const paths = vi.hoisted(() => ({
  defaultRoot: "",
  /** Configurable WSL distro-side read result for the volatile scope reader. */
  wslRead: undefined as
    | { ok: true; stdout: string }
    | { ok: false; stdout: string; stderr: string }
    | undefined,
  /** The distro read command captured by the last WSL-scope call. */
  wslScript: "" as string,
}));
const mocks = vi.hoisted(() => ({
  readContextCredential: vi.fn<() => Promise<{ token: string; baseUrl?: string } | undefined>>(
    async () => undefined,
  ),
}));

vi.mock("../base", () => ({
  readAgentCommandOutput: vi.fn<
    (
      ...args: unknown[]
    ) => Promise<{ ok: true; stdout: string } | { ok: false; stdout: string; stderr: string }>
  >((_location, _executable, argv) => {
    const commandArgs = argv as string[];
    paths.wslScript = String(commandArgs[1] ?? "");
    return Promise.resolve(paths.wslRead!);
  }),
  resolveWslHomeDirectory: vi.fn<() => Promise<string>>(async () => "/home/wsl"),
  quotePosixShellArg: (value: string) => `'${value.replaceAll("'", `'\\''`)}'`,
}));
vi.mock("./accountIdentity", () => ({
  readDevinContextCredential: mocks.readContextCredential,
  resetDevinAccountIdentityCaches: () => {},
  // Shape-compatible stand-in: orgSelection (a real import here) throws it.
  DevinAccountIdentityError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "DevinAccountIdentityError";
      this.code = code;
    }
  },
}));
vi.mock("./credentials", () => ({
  // The default-account volatile scope reads the config the native default
  // root resolves to; the test pins it to a temp dir so no host state leaks
  // into a digest.
  devinDefaultConfigRoot: () => paths.defaultRoot,
  devinDefaultDataRoot: () => join(paths.defaultRoot, "..", "default-data"),
}));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/bin/devin-stub" }));

import {
  DevinCatalogScopeUnavailableError,
  resolveDevinDefaultCatalogScope,
  resolveDevinVolatileCatalogScope,
} from "./volatileCatalog";
import {
  devinExecutionSettingsFromConfig,
  resolveDevinExecutionContext,
  type DevinExecutionContext,
} from "./profileContext";
import { parseDevinProfileConfig } from "./profileConfig";
import { devinSessionScopeIdentity } from "./sessionScope";

const location = { kind: "posix" as const, path: "/project" };
const wslLocation = {
  kind: "wsl" as const,
  distro: "test-distro",
  linuxPath: "/project",
  uncPath: "\\\\wsl$\\test-distro\\project",
};

const contextWithConfig = async (configPath: string): Promise<DevinExecutionContext> => {
  const resolution = await resolveDevinExecutionContext(
    {
      instanceId: "w",
      label: "Devin w",
      auth: { kind: "default" },
      runtimeTarget: "local",
      configGeneration: "gen",
      configPath,
    },
    location,
  );
  if (!resolution.ok) throw new Error(resolution.message);
  return resolution.context;
};

/** ONE frozen context instance reused across every read in a test. */
const nativeDefaultWslContext = async (): Promise<DevinExecutionContext> => {
  const profileConfig = parseDevinProfileConfig({
    auth: { kind: "native-default" },
    runtimeTarget: "local",
  });
  if (profileConfig.status !== "ok") throw new Error(profileConfig.reason);
  const resolution = await resolveDevinExecutionContext(
    devinExecutionSettingsFromConfig("w-wsl", "Devin wsl", profileConfig.config),
    wslLocation,
  );
  if (!resolution.ok) throw new Error(resolution.message);
  return resolution.context;
};

describe("Devin volatile catalog scope", () => {
  let workspace: string;
  let configFile: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), "devin-volatile-scope-"));
    paths.defaultRoot = join(workspace, "default-config-root");
    configFile = join(workspace, "user-config.json");
    mocks.readContextCredential.mockClear();
    mocks.readContextCredential.mockImplementation(async () => undefined);
    paths.wslRead = undefined;
    paths.wslScript = "";
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("rereads the config per request on the SAME context instance", async () => {
    // Immutable settings do NOT make external files immutable: one frozen
    // context must observe a same-path policy edit on its very next scope,
    // and identical content must still hash to one shared digest.
    const policyA = JSON.stringify({ version: 1, devin: { permission: "smart" } });
    const policyB = JSON.stringify({ version: 1, devin: { permission: "bypass" } });
    await writeFile(configFile, policyA);
    const context = await contextWithConfig(configFile);
    const scopeA = await resolveDevinVolatileCatalogScope(context);
    // Stable content, same instance: the identical digest (one warmed entry).
    expect(await resolveDevinVolatileCatalogScope(context)).toBe(scopeA);
    // Same path, changed policy content, SAME instance: a DIFFERENT scope.
    await writeFile(configFile, policyB);
    const scopeB = await resolveDevinVolatileCatalogScope(context);
    expect(scopeB).not.toBe(scopeA);
    // Restored content: the digest is stable again.
    await writeFile(configFile, policyA);
    expect(await resolveDevinVolatileCatalogScope(context)).toBe(scopeA);
    // Every scope is an opaque memory-only digest, never a raw value.
    for (const scope of [scopeA, scopeB]) expect(scope).toMatch(/^vol:[0-9a-f]{64}$/);
  });

  it("observes an effective org edit on the same instance and keeps settings-org precedence", async () => {
    await writeFile(configFile, JSON.stringify({ devin: { org_id: "org-a" } }));
    const context = await contextWithConfig(configFile);
    const scopeA = await resolveDevinVolatileCatalogScope(context);
    await writeFile(configFile, JSON.stringify({ devin: { org_id: "org-b" } }));
    expect(await resolveDevinVolatileCatalogScope(context)).not.toBe(scopeA);
    // The settings org wins without parsing, matching the resume-binding
    // precedence: an org-declared context resolves its (unseeded) config
    // view without ever parsing an org out of a file.
    const declared = await resolveDevinExecutionContext(
      {
        instanceId: "w",
        label: "Devin w",
        auth: { kind: "default" },
        runtimeTarget: "local",
        configGeneration: "gen",
        orgId: "org-s",
      },
      location,
    );
    if (!declared.ok) throw new Error(declared.message);
    const declaredScope = await resolveDevinVolatileCatalogScope(declared.context);
    expect(declaredScope).toMatch(/^vol:[0-9a-f]{64}$/);
    // A settings org differs from every inherited-org scope.
    await writeFile(configFile, JSON.stringify({ devin: { org_id: "org-a" } }));
    expect(await resolveDevinVolatileCatalogScope(context)).not.toBe(declaredScope);
  });

  it("observes a credential rotation and a logout on the same instance", async () => {
    await writeFile(configFile, JSON.stringify({ version: 1 }));
    const context = await contextWithConfig(configFile);
    mocks.readContextCredential.mockImplementation(async () => ({ token: "tok-a" }));
    const scopeA = await resolveDevinVolatileCatalogScope(context);
    // Rotated token, unchanged config, SAME frozen instance: a new scope.
    mocks.readContextCredential.mockImplementation(async () => ({ token: "tok-b" }));
    const scopeB = await resolveDevinVolatileCatalogScope(context);
    expect(scopeB).not.toBe(scopeA);
    // A logged-out state is its own dimension ("missing"), never one
    // credential's digest standing in for another state.
    mocks.readContextCredential.mockImplementation(async () => undefined);
    expect(await resolveDevinVolatileCatalogScope(context)).not.toBe(scopeB);
    // Back to the original token: the original scope again.
    mocks.readContextCredential.mockImplementation(async () => ({ token: "tok-a" }));
    expect(await resolveDevinVolatileCatalogScope(context)).toBe(scopeA);
  });

  it("retries the same instance after a failed read and after an abort", async () => {
    await writeFile(configFile, "{ not json");
    const context = await contextWithConfig(configFile);
    // A corrupt source fails typed and is never cached — the repair below
    // must be observable on the very same frozen context.
    await expect(resolveDevinVolatileCatalogScope(context)).rejects.toThrowError(/not valid JSON/);
    await writeFile(configFile, JSON.stringify({ version: 1, devin: { permission: "smart" } }));
    const repaired = await resolveDevinVolatileCatalogScope(context);
    expect(repaired).toMatch(/^vol:[0-9a-f]{64}$/);
    // An aborted request fails without poisoning anything: the next call on
    // the same instance with a live signal resolves normally.
    const controller = new AbortController();
    controller.abort();
    await expect(resolveDevinVolatileCatalogScope(context, controller.signal)).rejects.toThrowError(
      /abort/i,
    );
    expect(await resolveDevinVolatileCatalogScope(context)).toBe(repaired);
  });

  it("fails closed on unreadable, empty, or marker-less config reads", async () => {
    // An unreadable (non-ENOENT) source fails typed.
    await writeFile(configFile, JSON.stringify({ version: 1 }));
    await rm(configFile);
    await mkdir(configFile);
    await expect(
      resolveDevinVolatileCatalogScope(await contextWithConfig(configFile)),
    ).rejects.toBeInstanceOf(DevinCatalogScopeUnavailableError);
    // A PRESENT but empty file is truncation ambiguity, not absence.
    const context = await contextWithConfig(configFile);
    await rm(configFile, { recursive: true, force: true });
    await writeFile(configFile, "");
    await expect(resolveDevinVolatileCatalogScope(context)).rejects.toThrowError(/empty/);
    await expect(resolveDevinVolatileCatalogScope(context)).rejects.toBeInstanceOf(
      DevinCatalogScopeUnavailableError,
    );
  });

  it("treats an absent config as one stable digest on the host and inside WSL", async () => {
    const hostAbsent = await resolveDevinVolatileCatalogScope(await contextWithConfig(configFile));
    // A WSL org-view context resolves a Linux config view path (a literal);
    // the distro-side read reports absence for it.
    const profileConfig = parseDevinProfileConfig({
      auth: { kind: "native-default" },
      runtimeTarget: "local",
      orgId: "org-s",
    });
    if (profileConfig.status !== "ok") throw new Error(profileConfig.reason);
    const wslSettings = devinExecutionSettingsFromConfig(
      "w-wsl",
      "Devin wsl",
      profileConfig.config,
    );
    const wslContext = async (): Promise<DevinExecutionContext> => {
      const resolution = await resolveDevinExecutionContext(wslSettings, wslLocation);
      if (!resolution.ok) throw new Error(resolution.message);
      return resolution.context;
    };
    paths.wslRead = { ok: true, stdout: "absent\n" };
    const wslAbsent = await resolveDevinVolatileCatalogScope(await wslContext());
    expect(wslAbsent).toMatch(/^vol:[0-9a-f]{64}$/);
    // Present content inside the distro changes the scope.
    paths.wslRead = { ok: true, stdout: 'present\n{"version":2}\n' };
    expect(await resolveDevinVolatileCatalogScope(await wslContext())).not.toBe(wslAbsent);
    // A distro-side read failure is typed, never an empty view.
    paths.wslRead = { ok: false, stdout: "", stderr: "permission denied" };
    await expect(resolveDevinVolatileCatalogScope(await wslContext())).rejects.toBeInstanceOf(
      DevinCatalogScopeUnavailableError,
    );
    // The host-absent digest differs (org dimension) but is equally opaque.
    expect(hostAbsent).toMatch(/^vol:[0-9a-f]{64}$/);
  });

  it("resolves a WSL default account's config INSIDE the distro XDG root, never the host", async () => {
    // The native-default expression is interpolated RAW so the DISTRO's own
    // XDG_CONFIG_HOME/HOME expand; single-quoting it would search for a file
    // literally named with braces, and a host-resolved path would read the
    // wrong machine's config entirely.
    const context = await nativeDefaultWslContext();
    paths.wslRead = { ok: true, stdout: 'present\n{"devin":{"org_id":"distro-org"}}\n' };
    const scope = await resolveDevinVolatileCatalogScope(context);
    expect(scope).toMatch(/^vol:[0-9a-f]{64}$/);
    expect(paths.wslScript).toContain("f=${XDG_CONFIG_HOME:-$HOME/.config}/devin/config.json");
    // The trusted expression is never quoted as a literal…
    expect(paths.wslScript).not.toContain("'${XDG_CONFIG_HOME");
    // …and the HOST default root (pinned sentinel) is never consulted.
    expect(paths.wslScript).not.toContain(paths.defaultRoot);
    // Changed distro-side org content moves the scope on the same instance.
    paths.wslRead = { ok: true, stdout: 'present\n{"devin":{"org_id":"other-org"}}\n' };
    expect(await resolveDevinVolatileCatalogScope(context)).not.toBe(scope);
  });

  it("scopes the base/default account and keeps its entries shareable with detection", async () => {
    await mkdir(join(paths.defaultRoot, "devin"), { recursive: true });
    await writeFile(
      join(paths.defaultRoot, "devin", "config.json"),
      JSON.stringify({ version: 1 }),
    );
    const scope = await resolveDevinDefaultCatalogScope(location);
    // The static generation carries the shared default settings (account,
    // base config generation, local target, pinned binary identity).
    expect(scope.generation).toContain("|default|base|");
    expect(scope.generation).toContain("/bin/devin-stub");
    expect(scope.volatileGeneration).toMatch(/^vol:[0-9a-f]{64}$/);
    // Same content: an identical scope, so detection's warmed entry is the
    // entry launch lanes hit (fresh reads still agree).
    expect(await resolveDevinDefaultCatalogScope(location)).toEqual(scope);
    // A same-path change to the native default config refreshes the volatile
    // dimension while the static generation stays.
    await writeFile(
      join(paths.defaultRoot, "devin", "config.json"),
      JSON.stringify({ version: 1, devin: { org_id: "org-z" } }),
    );
    const changed = await resolveDevinDefaultCatalogScope(location);
    expect(changed.generation).toBe(scope.generation);
    expect(changed.volatileGeneration).not.toBe(scope.volatileGeneration);
  });

  it("never lets a volatile scope change move the resume identity", async () => {
    // The catalog's volatile dimensions (credential, config content, org) are
    // deliberately disjoint from the persisted resume binding: a policy edit
    // must not orphan resumable sessions, while an effective org change does
    // move the binding (session-scope semantics, unchanged here).
    const policyA = JSON.stringify({ version: 1, devin: { permission: "smart" } });
    const policyB = JSON.stringify({ version: 1, devin: { permission: "bypass" } });
    await writeFile(configFile, policyA);
    const contextA = await contextWithConfig(configFile);
    const scopeA = await resolveDevinVolatileCatalogScope(contextA);
    await writeFile(configFile, policyB);
    const contextB = await contextWithConfig(configFile);
    const scopeB = await resolveDevinVolatileCatalogScope(contextB);
    const identityInputs = (context: DevinExecutionContext) => ({
      location: context.location,
      account: context.account,
      orgId: context.orgId,
      runtimeTarget: context.runtimeTarget,
      roots: { dataRoot: context.roots.dataRoot },
      accountUserId: "user-proved",
    });
    expect(devinSessionScopeIdentity(identityInputs(contextA))).toBe(
      devinSessionScopeIdentity(identityInputs(contextB)),
    );
    // ...while the volatile catalog scope DID move with the policy content.
    expect(scopeB).not.toBe(scopeA);
  });
});
