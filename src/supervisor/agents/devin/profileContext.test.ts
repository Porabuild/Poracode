import { mkdtemp, readFile, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { resolveWslHomeDirectory } from "../base";

const mocks = vi.hoisted(() => ({
  readAgentCommandOutput: vi.fn<typeof import("../base").readAgentCommandOutput>(async () => ({
    ok: true,
    stdout: "",
    stderr: "",
  })),
}));

vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  resolveWslHomeDirectory: vi.fn<() => Promise<string>>(async () => "/home/wsluser"),
  readAgentCommandOutput: mocks.readAgentCommandOutput,
}));

import {
  devinAccountRootSegment,
  devinExecutionSettingsFromConfig,
  provisionDevinAccountRoot,
  resolveDevinExecutionContext,
  type DevinExecutionSettings,
} from "./profileContext";
import { devinProfileConfigGeneration } from "./profileConfig";
import { devinSessionScopeIdentity } from "./sessionScope";

const posix = (path: string) => ({ kind: "posix" as const, path });

it.each(["HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"])(
  "refuses %s redirects before verifying a different credential source",
  async (key) => {
    await expect(
      resolveDevinExecutionContext(
        settings({ environment: { [key]: "/another-login" } }),
        posix("/p"),
      ),
    ).resolves.toMatchObject({ ok: false, code: "reserved-env-conflict" });
  },
);

it.each(["home", "UserProfile", "windsurf_api_key", "AppData", "localappdata"])(
  "recognizes case-insensitive Windows credential-source overrides: %s",
  async (key) => {
    await expect(
      resolveDevinExecutionContext(settings({ environment: { [key]: "another-login" } }), {
        kind: "windows",
        path: "C:\\fixture",
      }),
    ).resolves.toMatchObject({ ok: false, code: "reserved-env-conflict" });
  },
);

function settings(overrides: Partial<DevinExecutionSettings> = {}): DevinExecutionSettings {
  return {
    instanceId: "work",
    label: "Devin work",
    auth: { kind: "default" },
    runtimeTarget: "local",
    configGeneration: "gen1",
    ...overrides,
  };
}

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "poracode-devin-ctx-"));
}

it("derives a filesystem-safe, collision-resistant segment per owner id", () => {
  // Ids that sanitize identically must not share a root directory.
  expect(devinAccountRootSegment("foo:bar")).not.toBe(devinAccountRootSegment("foo_bar"));
  expect(devinAccountRootSegment("foo:bar")).toMatch(/^foo_bar-[0-9a-f]{64}$/);
  expect(devinAccountRootSegment("foo:bar")).toBe(devinAccountRootSegment("foo:bar"));
  // Already-safe ids keep their bare segment (and any root provisioned under it).
  expect(devinAccountRootSegment("clean-owner_1")).toMatch(/^clean-owner_1-[0-9a-f]{64}$/);
  // Extremely long ids stay bounded deterministically.
  const long = "x".repeat(300);
  expect(devinAccountRootSegment(long)).toBe(devinAccountRootSegment(long));
  expect(devinAccountRootSegment(long).length).toBeLessThan(120);
  expect(devinAccountRootSegment("")).toMatch(/^_-[0-9a-f]{64}$/);
});

it("keeps the default account unredirected with native roots", async () => {
  const resolution = await resolveDevinExecutionContext(settings(), posix("/project"));
  expect(resolution.ok).toBe(true);
  if (!resolution.ok) return;
  expect(resolution.context.env).toBeUndefined();
  expect(resolution.context.prefixArgs).toEqual([]);
  expect(resolution.context.roots.manifestPath).toBe("");
  expect(resolution.context.requiresConfigSeed).toBe(false);
  expect(resolution.context.account).toEqual({ kind: "default" });
});

it("redirects isolated accounts to stable Poracode-managed roots and provisions a manifest", async () => {
  const base = await tempRoot();
  const original = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    const isolated = settings({ auth: { kind: "isolated", ownerId: "work" } });
    const resolution = await resolveDevinExecutionContext(isolated, posix("/project"), {
      provision: true,
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    const context = resolution.context;
    expect(context.env).toEqual({
      WINDSURF_API_KEY: "",
      XDG_CONFIG_HOME: join(
        base,
        "Poracode",
        "devin-accounts",
        devinAccountRootSegment("work"),
        "config",
      ),
      XDG_DATA_HOME: join(
        base,
        "Poracode",
        "devin-accounts",
        devinAccountRootSegment("work"),
        "data",
      ),
    });
    expect(context.roots.credentialsPath).toBe(
      join(
        base,
        "Poracode",
        "devin-accounts",
        devinAccountRootSegment("work"),
        "data",
        "devin",
        "credentials.toml",
      ),
    );
    expect((await stat(context.roots.configRoot)).isDirectory()).toBe(true);

    const manifest = JSON.parse(
      await readFile(
        join(
          base,
          "Poracode",
          "devin-accounts",
          devinAccountRootSegment("work"),
          "poracode-account.json",
        ),
        "utf8",
      ),
    );
    expect(manifest).toMatchObject({ format: 1, kind: "devin-account-root", ownerId: "work" });
    // Reprovisioning is idempotent and does not rewrite the manifest stamp.
    await provisionDevinAccountRoot(context.roots, "work");
    const manifest2 = JSON.parse(
      await readFile(
        join(
          base,
          "Poracode",
          "devin-accounts",
          devinAccountRootSegment("work"),
          "poracode-account.json",
        ),
        "utf8",
      ),
    );
    expect(manifest2.createdAt).toBe(manifest.createdAt);
  } finally {
    if (original === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = original;
  }
});

it("refuses account roots written by a future Poracode format", async () => {
  const base = await tempRoot();
  const original = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    const roots = {
      configRoot: join(base, "root", "config"),
      dataRoot: join(base, "root", "data"),
      credentialsPath: join(base, "root", "data", "devin", "credentials.toml"),
      nativeConfigPath: join(base, "root", "config", "devin", "config.json"),
      manifestPath: join(base, "root", "poracode-account.json"),
    };
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(base, "root"), { recursive: true });
    await writeFile(roots.manifestPath, JSON.stringify({ format: 99, kind: "devin-account-root" }));
    const result = await provisionDevinAccountRoot(roots, "someone");
    expect(result).toMatchObject({ ok: false, code: "unsupported-account-root" });
  } finally {
    if (original === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = original;
  }
});

it.each([
  ["corrupt", "{ not json !!!"],
  [
    "wrong-owner",
    JSON.stringify({ format: 1, kind: "devin-account-root", ownerId: "someone-else" }),
  ],
] as const)("refuses a %s manifest before any touch", async (_kind, content) => {
  const base = await tempRoot();
  const original = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    // The context derives its own roots from the owner id; the manifest must
    // sit at exactly that derived path.
    const manifestPath = join(
      base,
      "Poracode",
      "devin-accounts",
      devinAccountRootSegment("someone"),
      "poracode-account.json",
    );
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(manifestPath, ".."), { recursive: true });
    await writeFile(manifestPath, content);
    // Provisioning refuses without creating the root directories.
    const provisioned = await provisionDevinAccountRoot(
      {
        configRoot: join(base, "root", "config"),
        dataRoot: join(base, "root", "data"),
        credentialsPath: join(base, "root", "data", "devin", "credentials.toml"),
        nativeConfigPath: join(base, "root", "config", "devin", "config.json"),
        manifestPath,
      },
      "someone",
    );
    expect(provisioned).toMatchObject({ ok: false, code: "unsupported-account-root" });
    await expect(stat(join(base, "root", "config"))).rejects.toMatchObject({ code: "ENOENT" });
    // And a non-provisioning resolution (probes) rejects too instead of
    // handing the guarded root to spawn lanes.
    const resolution = await resolveDevinExecutionContext(
      settings({ auth: { kind: "isolated", ownerId: "someone" } }),
      posix("/project"),
    );
    expect(resolution).toMatchObject({ ok: false, code: "unsupported-account-root" });
  } finally {
    if (original === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = original;
  }
});

it("guards non-provisioning resolutions against future-format roots", async () => {
  const base = await tempRoot();
  const original = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    const manifestPath = join(
      base,
      "Poracode",
      "devin-accounts",
      devinAccountRootSegment("someone"),
      "poracode-account.json",
    );
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(manifestPath, ".."), { recursive: true });
    await writeFile(manifestPath, JSON.stringify({ format: 42, kind: "devin-account-root" }));
    const resolution = await resolveDevinExecutionContext(
      settings({ auth: { kind: "isolated", ownerId: "someone" } }),
      posix("/project"),
    );
    expect(resolution).toMatchObject({ ok: false, code: "unsupported-account-root" });
  } finally {
    if (original === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = original;
  }
});

it("resolves isolated contexts against an unprovisioned root without writing", async () => {
  const base = await tempRoot();
  const original = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    // Probes resolve contexts for roots that were never provisioned; the
    // read-only guard passes on an absent manifest and nothing is created.
    const resolution = await resolveDevinExecutionContext(
      settings({ auth: { kind: "isolated", ownerId: "fresh" } }),
      posix("/project"),
    );
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.context.env?.XDG_CONFIG_HOME).toContain("devin-accounts");
    await expect(stat(resolution.context.roots.configRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    if (original === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = original;
  }
});

it("rejects corrupt and wrong-owner WSL manifests in the distro shell before mkdir", async () => {
  // The guard probe returns a wrong-owner manifest: refusal must happen with
  // exactly ONE shell call (the read-only probe) and no create call.
  mocks.readAgentCommandOutput.mockResolvedValueOnce({
    ok: true,
    stdout: JSON.stringify({ format: 1, kind: "devin-account-root", ownerId: "not-me" }),
    stderr: "",
  });
  const wrongOwner = await resolveDevinExecutionContext(
    settings({ auth: { kind: "isolated", ownerId: "w4" } }),
    { kind: "wsl", distro: "Ubuntu", linuxPath: "/project", uncPath: "\\\\wsl$" },
    { provision: true },
  );
  expect(wrongOwner).toMatchObject({ ok: false, code: "unsupported-account-root" });
  expect(mocks.readAgentCommandOutput).toHaveBeenCalledTimes(1);
  expect(mocks.readAgentCommandOutput.mock.calls[0]![2]![1]!).toContain("cat");
  // A corrupt manifest answers the same way.
  mocks.readAgentCommandOutput.mockClear();
  mocks.readAgentCommandOutput.mockResolvedValueOnce({
    ok: true,
    stdout: "definitely not json",
    stderr: "",
  });
  const corrupt = await resolveDevinExecutionContext(
    settings({ auth: { kind: "isolated", ownerId: "w5" } }),
    { kind: "wsl", distro: "Ubuntu", linuxPath: "/project", uncPath: "\\\\wsl$" },
    { provision: false },
  );
  expect(corrupt).toMatchObject({ ok: false, code: "unsupported-account-root" });
  expect(mocks.readAgentCommandOutput).toHaveBeenCalledTimes(1);
  // A distro failure during the read-only guard is a typed refusal, never a
  // provisioned guess.
  mocks.readAgentCommandOutput.mockClear();
  mocks.readAgentCommandOutput.mockResolvedValueOnce({
    ok: false,
    stdout: "",
    stderr: "distro offline",
  });
  const unreadable = await resolveDevinExecutionContext(
    settings({ auth: { kind: "isolated", ownerId: "w6" } }),
    { kind: "wsl", distro: "Ubuntu", linuxPath: "/project", uncPath: "\\\\wsl$" },
    { provision: false },
  );
  expect(unreadable).toMatchObject({ ok: false, code: "unsupported-account-root" });
});

it("resolves a reference to the same roots as the owning isolated account", async () => {
  const base = await tempRoot();
  const original = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    const owner = await resolveDevinExecutionContext(
      settings({ instanceId: "owner", auth: { kind: "isolated", ownerId: "owner" } }),
      posix("/project"),
    );
    const reference = await resolveDevinExecutionContext(
      settings({ instanceId: "ref", auth: { kind: "reference", ownerId: "owner" } }),
      posix("/project"),
    );
    expect(owner.ok && reference.ok).toBe(true);
    if (!owner.ok || !reference.ok) return;
    expect(reference.context.roots.credentialsPath).toBe(owner.context.roots.credentialsPath);
    // Same account view → shared model-catalog identity, distinct instance id.
    expect(reference.context.generation).toBe(owner.context.generation);
    expect(reference.context.instanceId).toBe("ref");
  } finally {
    if (original === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = original;
  }
});

it("seeds a per-profile config view for org selection without touching the data root", async () => {
  const base = await tempRoot();
  const original = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    const resolution = await resolveDevinExecutionContext(
      settings({ orgId: "org-1" }),
      posix("/project"),
    );
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.context.env).toEqual({
      XDG_CONFIG_HOME: expect.stringContaining(
        join("Poracode", "devin-profiles", devinAccountRootSegment("work"), "config"),
      ),
    });
    expect(resolution.context.requiresConfigSeed).toBe(true);
    expect(resolution.context.roots.dataRoot).toBe(base);
  } finally {
    if (original === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = original;
  }
});

it("rejects org selection for shared-login profiles on native Windows", async () => {
  const resolution = await resolveDevinExecutionContext(settings({ orgId: "org-1" }), {
    kind: "windows",
    path: "C:\\Users\\u",
  });
  expect(resolution).toMatchObject({ ok: false, code: "windows-org-config-unsupported" });
});

it("redirects WSL accounts into the distro home", async () => {
  const resolution = await resolveDevinExecutionContext(
    settings({ auth: { kind: "isolated", ownerId: "w" } }),
    { kind: "wsl", distro: "Ubuntu", linuxPath: "/project", uncPath: "\\\\wsl$" },
  );
  expect(resolution.ok).toBe(true);
  if (!resolution.ok) return;
  expect(resolution.context.env).toEqual({
    WINDSURF_API_KEY: "",
    XDG_CONFIG_HOME: `/home/wsluser/.local/share/Poracode/devin-accounts/${devinAccountRootSegment("w")}/config`,
    XDG_DATA_HOME: `/home/wsluser/.local/share/Poracode/devin-accounts/${devinAccountRootSegment("w")}/data`,
  });
  expect(vi.mocked(resolveWslHomeDirectory)).toHaveBeenCalledWith("Ubuntu");
});

it("provisions WSL account roots inside the distro shell, never on the host fs", async () => {
  // Guard first (read-only manifest probe), create second: the distro shell
  // validates BEFORE any mkdir, so a guarded root is never touched.
  mocks.readAgentCommandOutput.mockResolvedValueOnce({ ok: true, stdout: "", stderr: "" });
  const resolution = await resolveDevinExecutionContext(
    settings({ auth: { kind: "isolated", ownerId: "w" } }),
    { kind: "wsl", distro: "Ubuntu", linuxPath: "/project", uncPath: "\\\\wsl$" },
    { provision: true },
  );
  expect(resolution.ok).toBe(true);
  expect(mocks.readAgentCommandOutput).toHaveBeenCalledTimes(2);
  const [guardLocation, guardExecutable, guardArgs] = mocks.readAgentCommandOutput.mock.calls[0]!;
  expect(guardLocation).toMatchObject({ kind: "wsl", distro: "Ubuntu" });
  expect(guardExecutable).toBe("sh");
  expect(guardArgs[1]!).toContain("cat");
  const [createLocation, , createArgs] = mocks.readAgentCommandOutput.mock.calls[1]!;
  expect(createLocation).toMatchObject({ kind: "wsl", distro: "Ubuntu" });
  const createScript = createArgs[1]!;
  // The create script runs in-distro: it creates both roots and stamps the
  // manifest; no host path is ever constructed from the Linux root.
  expect(createScript).toContain("mkdir -p");
  expect(createScript).toContain(
    `/home/wsluser/.local/share/Poracode/devin-accounts/${devinAccountRootSegment("w")}/poracode-account.json`,
  );
  // The distro command failing during creation is a typed provisioning
  // failure, not a host write.
  mocks.readAgentCommandOutput.mockResolvedValueOnce({ ok: true, stdout: "", stderr: "" });
  mocks.readAgentCommandOutput.mockResolvedValueOnce({
    ok: false,
    stdout: "",
    stderr: "distro offline",
  });
  const failed = await resolveDevinExecutionContext(
    settings({ auth: { kind: "isolated", ownerId: "w2" } }),
    { kind: "wsl", distro: "Ubuntu", linuxPath: "/project", uncPath: "\\\\wsl$" },
    { provision: true },
  );
  expect(failed).toMatchObject({ ok: false, code: "provision-failed" });
  // A future-format manifest found in-distro is refused BEFORE the create
  // call: exactly one shell round trip, no mkdir.
  mocks.readAgentCommandOutput.mockClear();
  mocks.readAgentCommandOutput.mockResolvedValueOnce({
    ok: true,
    stdout: JSON.stringify({ format: 9, kind: "devin-account-root" }),
    stderr: "",
  });
  const future = await resolveDevinExecutionContext(
    settings({ auth: { kind: "isolated", ownerId: "w3" } }),
    { kind: "wsl", distro: "Ubuntu", linuxPath: "/project", uncPath: "\\\\wsl$" },
    { provision: true },
  );
  expect(future).toMatchObject({ ok: false, code: "unsupported-account-root" });
  expect(mocks.readAgentCommandOutput).toHaveBeenCalledTimes(1);
  expect(mocks.readAgentCommandOutput.mock.calls[0]![2]![1]!).toContain("cat");
});

it("refuses reserved account-root variables on native-default profiles", async () => {
  const redirected = await resolveDevinExecutionContext(
    settings({ environment: { XDG_DATA_HOME: "/elsewhere", WINDSURF_API_KEY: "k" } }),
    posix("/project"),
  );
  expect(redirected).toMatchObject({ ok: false, code: "reserved-env-conflict" });
  const windows = await resolveDevinExecutionContext(
    settings({ environment: { APPDATA: "C:\\elsewhere" } }),
    { kind: "windows", path: "C:\\Users\\u" },
  );
  expect(windows).toMatchObject({ ok: false, code: "reserved-env-conflict" });
  // Unrelated environment entries stay allowed.
  const allowed = await resolveDevinExecutionContext(
    settings({ environment: { HTTPS_PROXY: "http://proxy:3128" } }),
    posix("/project"),
  );
  expect(allowed).toMatchObject({ ok: true });
});

it("refuses an org selection that an explicit config file would silently ignore", async () => {
  const conflict = await resolveDevinExecutionContext(
    settings({ orgId: "org-1", configPath: "~/own.json" }),
    posix("/project"),
  );
  expect(conflict).toMatchObject({ ok: false, code: "org-config-conflict" });
  // Isolated owners hit the same guard: the org would be seeded into the
  // account root but `--config` replaces it for the session.
  const isolated = await resolveDevinExecutionContext(
    settings({ auth: { kind: "isolated", ownerId: "i" }, orgId: "org-1", configPath: "~/o.json" }),
    posix("/project"),
  );
  expect(isolated).toMatchObject({ ok: false, code: "org-config-conflict" });
});

it("seeds each owner reference in its own private view over the shared data root", async () => {
  const base = await tempRoot();
  const original = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    const owner = await resolveDevinExecutionContext(
      settings({ instanceId: "owner", auth: { kind: "isolated", ownerId: "owner" } }),
      posix("/project"),
    );
    const refA = await resolveDevinExecutionContext(
      settings({
        instanceId: "ref-a",
        auth: { kind: "reference", ownerId: "owner" },
        orgId: "org-a",
      }),
      posix("/project"),
    );
    const refB = await resolveDevinExecutionContext(
      settings({
        instanceId: "ref-b",
        auth: { kind: "reference", ownerId: "owner" },
        orgId: "org-b",
      }),
      posix("/project"),
    );
    expect(owner.ok && refA.ok && refB.ok).toBe(true);
    if (!owner.ok || !refA.ok || !refB.ok) return;
    // Credentials stay at the owner's data root for every reference.
    expect(refA.context.roots.credentialsPath).toBe(owner.context.roots.credentialsPath);
    expect(refB.context.roots.credentialsPath).toBe(owner.context.roots.credentialsPath);
    // But the org view is private per reference and never the owner's root.
    expect(refA.context.roots.configRoot).toContain(join("Poracode", "devin-profiles", "ref-a"));
    expect(refB.context.roots.configRoot).toContain(join("Poracode", "devin-profiles", "ref-b"));
    expect(refA.context.roots.configRoot).not.toBe(owner.context.roots.configRoot);
    expect(refA.context.requiresConfigSeed).toBe(true);
    expect(refA.context.configViewSource).toBe(owner.context.roots.configRoot);
    expect(refA.context.env?.XDG_DATA_HOME).toBe(owner.context.roots.dataRoot);
    expect(refA.context.generation).not.toBe(refB.context.generation);
    expect(refB.context.roots.configRoot).not.toContain("devin-accounts");
  } finally {
    if (original === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = original;
  }
});

it("hashes environment names and values without leaking either value", async () => {
  const withProxy = await resolveDevinExecutionContext(
    settings({ environment: { HTTPS_PROXY: "http://secret-value:1" } }),
    posix("/p"),
  );
  const sameKeysOtherValue = await resolveDevinExecutionContext(
    settings({ environment: { HTTPS_PROXY: "http://different:2" } }),
    posix("/p"),
  );
  const otherKeys = await resolveDevinExecutionContext(
    settings({ environment: { NO_PROXY: "x" } }),
    posix("/p"),
  );
  const plain = await resolveDevinExecutionContext(settings(), posix("/p"));
  expect(withProxy.ok && sameKeysOtherValue.ok && otherKeys.ok && plain.ok).toBe(true);
  if (!withProxy.ok || !sameKeysOtherValue.ok || !otherKeys.ok || !plain.ok) return;
  // Changing a value invalidates the catalog without exposing it...
  expect(withProxy.context.generation).not.toBe(sameKeysOtherValue.context.generation);
  // ...different names differ as well, and raw values never enter keys.
  expect(otherKeys.context.generation).not.toBe(plain.context.generation);
  expect(withProxy.context.generation).not.toContain("secret-value");
  expect(plain.context.generation).not.toBe(withProxy.context.generation);
});

it("expands ~ in configPath and rejects relative paths", async () => {
  const ok = await resolveDevinExecutionContext(
    settings({ configPath: "~/devin-work.json" }),
    posix("/project"),
  );
  if (!ok.ok) throw new Error(`expected usable context, got ${ok.code}`);
  expect(ok.context.configPath).toBe(join(homedir(), "devin-work.json"));
  expect(ok.context.prefixArgs).toEqual(["--config", ok.context.configPath ?? ""]);
  const bad = await resolveDevinExecutionContext(
    settings({ configPath: "relative.json" }),
    posix("/p"),
  );
  expect(bad).toMatchObject({ ok: false, code: "invalid-config-path" });
});

it("merges instance environment beneath redirection variables", async () => {
  const base = await tempRoot();
  const original = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    const resolution = await resolveDevinExecutionContext(
      settings({
        auth: { kind: "isolated", ownerId: "envtest" },
        environment: { HTTPS_PROXY: "http://proxy.example", XDG_DATA_HOME: "/should-not-win" },
      }),
      posix("/project"),
      { provision: true },
    );
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.context.env?.HTTPS_PROXY).toBe("http://proxy.example");
    expect(resolution.context.env?.WINDSURF_API_KEY).toBe("");
    // Redirection always wins over the profile's own environment.
    expect(resolution.context.env?.XDG_DATA_HOME).toContain("devin-accounts");
  } finally {
    if (original === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = original;
  }
});

it("freezes the context and keys generation by account, org, target and config", async () => {
  const a = await resolveDevinExecutionContext(settings({ orgId: "org-a" }), posix("/p"));
  const b = await resolveDevinExecutionContext(
    settings({ orgId: "org-a", runtimeTarget: "cloud" }),
    posix("/p"),
  );
  const c = await resolveDevinExecutionContext(
    settings({ orgId: "org-a", configGeneration: "gen2" }),
    posix("/p"),
  );
  expect(a.ok && b.ok && c.ok).toBe(true);
  if (!a.ok || !b.ok || !c.ok) return;
  expect(Object.isFrozen(a.context)).toBe(true);
  expect(a.context.generation).not.toBe(b.context.generation);
  expect(a.context.generation).not.toBe(c.context.generation);
});

it("maps profile configs onto execution settings", () => {
  const config = {
    format: 1,
    auth: { kind: "owner-reference", ownerId: "owner" },
    orgId: "org-9",
    runtimeTarget: "cloud",
    agentType: "review",
    configPath: "~/cfg.json",
  } as const;
  const mapped = devinExecutionSettingsFromConfig("work", "Devin work", config, {
    WINDSURF_API_KEY: "k",
  });
  expect(mapped).toMatchObject({
    instanceId: "work",
    auth: { kind: "reference", ownerId: "owner" },
    orgId: "org-9",
    runtimeTarget: "cloud",
    agentType: "review",
    configPath: "~/cfg.json",
    environment: { WINDSURF_API_KEY: "k" },
  });
  // Config generation is the parsed config's content identity.
  expect(mapped.configGeneration).toBe(devinProfileConfigGeneration(config));
  const native = devinExecutionSettingsFromConfig("x", "X", {
    format: 1,
    auth: { kind: "native-default" },
  });
  expect(native.auth).toEqual({ kind: "default" });
  expect(native.runtimeTarget).toBe("local");
});

it("rejects key-only profile credentials that disagree with the declared login", async () => {
  for (const auth of [
    { kind: "default" as const },
    { kind: "isolated" as const, ownerId: "owner" },
  ]) {
    await expect(
      resolveDevinExecutionContext(
        settings({ auth, environment: { WINDSURF_API_KEY: "other-account" } }),
        posix("/p"),
      ),
    ).resolves.toMatchObject({ ok: false, code: "reserved-env-conflict" });
  }
});

it("keeps cloud setup detached across profile resolution without orphaning a pending resume", async () => {
  const config = {
    format: 2,
    auth: { kind: "native-default" as const },
    runtimeTarget: "cloud" as const,
    cloudDefaults: { repositories: ["acme/api"], persona: "reviewer", platform: "linux" as const },
  };
  const firstSettings = devinExecutionSettingsFromConfig("cloud", "Cloud", config);
  const first = await resolveDevinExecutionContext(firstSettings, posix("/project"));
  if (!first.ok) throw new Error(first.code);
  config.cloudDefaults.repositories.push("acme/web");
  config.cloudDefaults.persona = "";
  expect(firstSettings.cloudDefaults).toEqual({
    repositories: ["acme/api"],
    persona: "reviewer",
    platform: "linux",
  });
  firstSettings.cloudDefaults!.repositories!.push("acme/extra");
  expect(first.context.cloudDefaults).toEqual({
    repositories: ["acme/api"],
    persona: "reviewer",
    platform: "linux",
  });

  const changed = await resolveDevinExecutionContext(
    devinExecutionSettingsFromConfig("cloud", "Cloud", config),
    posix("/project"),
  );
  if (!changed.ok) throw new Error(changed.code);
  expect(changed.context.cloudDefaults).toEqual(config.cloudDefaults);
  expect(changed.context.generation).not.toBe(first.context.generation);
  // Editable launch choices refresh detection, but custody belongs to the
  // unchanged account/organization/runtime rather than those choices.
  expect(devinSessionScopeIdentity({ ...changed.context, accountUserId: "same-user" })).toBe(
    devinSessionScopeIdentity({ ...first.context, accountUserId: "same-user" }),
  );
});
