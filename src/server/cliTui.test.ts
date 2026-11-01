import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ChildProcess } from "node:child_process";
import { expect, it, vi } from "vitest";
import { SERVER_INSTALL_LAYOUT_VERSION, type ServerInstallLayout } from "./serverInstallLayout";
import {
  createTuiBootstrap,
  resolveTuiLaunch,
  resolveTuiLaunchForRun,
  runCliTui,
  TuiLaunchUnavailableError,
} from "./cliTui";
import { TUI_BOOTSTRAP_VERSION, tuiBootstrapSchema } from "@/shared/tuiBootstrap";
import { parseTuiSession } from "@/shared/tuiSession";
import { remoteAccessTokenResultSchema } from "@/shared/remote/protocol/core";
import {
  readTuiServers,
  saveTuiServer,
  tuiServerIdForEndpoint,
  tuiSessionDirectory,
  TUI_SWITCH_SERVER_EXIT_CODE,
  writeTuiServerSwitch,
} from "@/shared/tuiServers";
import type { HostDescription } from "@/shared/hostControlProtocol";
import type {
  HostStatusResponse,
  PairingControlResponse,
  RequestPairingOptions,
} from "./pairingControl";
import { ensureCliOwner } from "./cliOwner";
import type { TuiCliOptions } from "./cliParse";
import { expectOwned } from "./cliTestHelpers";
import { HostControlServer } from "@/backend/ownership/HostControlServer";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { prepareOwnedHostRoot } from "@/backend/ownership/hostRootManifest";

const directory = resolve("tmp/cli-tui-project");
const bootstrapInput = {
  appVersion: "1.2.3",
  home: resolve("tmp/cli-tui-home"),
  pairingUrl: "http://127.0.0.1:49152/#token=temporary",
  directory,
  args: { continue: true, sessionId: "session-1", prompt: "Hello", auto: true },
};

function layout(kind: ServerInstallLayout["kind"], root: string): ServerInstallLayout {
  return {
    layoutVersion: SERVER_INSTALL_LAYOUT_VERSION,
    kind,
    root,
    libDir: join(root, "lib"),
    resourcesDir: join(root, "resources"),
  };
}

it("builds the shared versioned TUI bootstrap shape", () => {
  expect(createTuiBootstrap(bootstrapInput)).toEqual({
    version: TUI_BOOTSTRAP_VERSION,
    auth: "pairing",
    ...bootstrapInput,
  });
  expect(tuiBootstrapSchema.parse(createTuiBootstrap(bootstrapInput))).toMatchObject({
    version: 3,
    auth: "pairing",
    args: { continue: true, sessionId: "session-1", prompt: "Hello", auto: true },
  });
  expect(
    createTuiBootstrap({ ...bootstrapInput, server: { id: "s-0123456789ab", name: "mac" } }),
  ).toMatchObject({ server: { id: "s-0123456789ab", name: "mac" } });
  expect(tuiBootstrapSchema.safeParse({ ...bootstrapInput, version: 4 }).success).toBe(false);
  // A v2 bootstrap from an older CLI refuses rather than running without `server`.
  expect(
    tuiBootstrapSchema.safeParse({ ...bootstrapInput, auth: "pairing", version: 2 }).success,
  ).toBe(false);
  // A v1 bootstrap has no auth discriminator — old payloads refuse, never degrade.
  expect(tuiBootstrapSchema.safeParse({ ...bootstrapInput, version: 1 }).success).toBe(false);
});

it("parses a pre-sessionId exchange result and skips exact-id cleanup", () => {
  // Old hosts never sent sessionId: the result parses and the TUI stores no
  // sessionId, so a later re-pair revokes nothing (never a guessed id).
  const result = remoteAccessTokenResultSchema.parse({
    accessToken: "a",
    tokenType: "Bearer",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    scopes: [],
    refreshToken: "r",
    refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  expect(result.sessionId).toBeUndefined();
  const session = parseTuiSession({
    version: 1,
    endpoint: "http://127.0.0.1:49152",
    accessToken: "a",
    refreshToken: "r",
    refreshExpiresAtMs: Date.now() + 86_400_000,
  });
  expect(session?.sessionId).toBeUndefined();
});

it("emits a session-mode bootstrap without a pairing URL", () => {
  const session = {
    version: 1 as const,
    endpoint: "http://127.0.0.1:49152",
    accessToken: "access",
    refreshToken: "refresh",
    refreshExpiresAtMs: Date.now() + 86_400_000,
  };
  const bootstrap = createTuiBootstrap({ ...bootstrapInput, session });
  expect(bootstrap).toMatchObject({ version: 3, auth: "session" });
  expect(bootstrap).not.toHaveProperty("pairingUrl");
});

it("resolves the checkout Bun entry and reports a prefix with no binary", () => {
  const root = resolve("tui-launch-fixture");
  const checkout = layout("checkout", root);
  const bun = join(
    root,
    "node_modules",
    "bun",
    "bin",
    process.platform === "win32" ? "bun.exe" : "bun",
  );
  const source = join(root, "tui", "src", "main.ts");
  const checkoutFiles = new Set([bun, source]);
  expect(
    resolveTuiLaunch(checkout, {
      directory,
      env: { PATH: "" },
      fileExists: (path) => checkoutFiles.has(path),
    }),
  ).toEqual({ command: bun, args: [source], cwd: join(root, "tui") });
  const pathBun = join(root, "path-bin", process.platform === "win32" ? "bun.exe" : "bun");
  expect(
    resolveTuiLaunch(checkout, {
      directory,
      env: { PATH: join(root, "path-bin") },
      pathValue: join(root, "path-bin"),
      fileExists: (path) => path === pathBun || path === source,
    }),
  ).toEqual({ command: pathBun, args: [source], cwd: join(root, "tui") });

  // A prefix install stages manifest.json only — no binary lives at
  // resources/tui/poracode.exe, so a launch resolves via download or fails.
  const prefix = layout("prefix", root);
  expect(() => resolveTuiLaunch(prefix, { directory, env: {}, fileExists: () => false })).toThrow(
    TuiLaunchUnavailableError,
  );
});

it("resolves the launch before touching the owner and fails clean when none exists", async () => {
  const profile = await mkdtemp(join(tmpdir(), "poracode-cli-tui-"));
  const order: string[] = [];
  const prefix = layout("prefix", resolve("tui-prefix-fixture"));
  const ensureOwner = vi.fn<typeof ensureCliOwner>(async () => {
    order.push("owner");
    return {
      requestId: "status-request",
      ownerGeneration: "owner-generation",
      description: {} as HostDescription,
    } as HostStatusResponse;
  });
  try {
    await expect(
      runCliTui(
        {} satisfies TuiCliOptions,
        { profileNamespace: profile, directory },
        {
          appVersion: "1.2.3",
          env: {},
          ensureOwner,
          fileExists: () => false,
          layout: prefix,
          resolveLaunch: async () => {
            order.push("launch");
            throw new TuiLaunchUnavailableError("no TUI binary");
          },
        },
      ),
    ).rejects.toBeInstanceOf(TuiLaunchUnavailableError);
    expect(order).toEqual(["launch"]);
    expect(ensureOwner).not.toHaveBeenCalled();
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});

it("prefers PORACODE_TUI_BIN and propagates the child exit code with a validated bootstrap", async () => {
  const profile = await mkdtemp(join(tmpdir(), "poracode-cli-tui-"));
  const prefix = layout("prefix", resolve("tui-prefix-fixture"));
  const child = new EventEmitter() as unknown as ChildProcess;
  const spawn = vi.fn<
    (
      command: string,
      args: string[],
      options: {
        cwd: string;
        env: NodeJS.ProcessEnv;
        stdio: "inherit";
        windowsHide: true;
      },
    ) => ChildProcess
  >(() => {
    process.nextTick(() => child.emit("exit", 19, null));
    return child;
  });
  const requestPairing = vi.fn<
    (profile: string, options: RequestPairingOptions) => Promise<PairingControlResponse>
  >(async () => ({
    requestId: "pairing-request",
    pairingUrl: "http://127.0.0.1:49152/#token=temporary",
  }));
  const ensureOwner = vi.fn<typeof ensureCliOwner>(
    async () =>
      ({
        requestId: "status-request",
        ownerGeneration: "owner-generation",
        description: {} as HostDescription,
      }) as HostStatusResponse,
  );
  const env = { PORACODE_TUI_BIN: "compiled-tui", PATH: "" };
  try {
    const exitCode = await runCliTui(
      {
        continue: true,
        sessionId: "session-1",
        prompt: "Hello",
        auto: true,
      } satisfies TuiCliOptions,
      { profileNamespace: profile, directory },
      {
        appVersion: "1.2.3",
        env,
        ensureOwner,
        fileExists: (path) => path === resolve("compiled-tui"),
        layout: prefix,
        requestPairing,
        spawn: spawn as never,
      },
    );
    expect(exitCode).toBe(19);
    expect(ensureOwner).toHaveBeenCalledOnce();
    expect(requestPairing).toHaveBeenCalledWith(profile, {
      preset: "operator",
      expectedGeneration: "owner-generation",
    });
    expect(spawn).toHaveBeenCalledOnce();
    const [command, args, spawnOptions] = spawn.mock.calls[0]!;
    expect(command).toBe(resolve("compiled-tui"));
    expect(args).toEqual([]);
    expect(spawnOptions).toMatchObject({
      cwd: directory,
      stdio: "inherit",
      windowsHide: true,
      env: {
        PORACODE_TUI_HOME: join(profile, "tui"),
      },
    });
    const bootstrap = tuiBootstrapSchema.parse(
      JSON.parse(String(spawnOptions.env.PORACODE_TUI_BOOTSTRAP)),
    );
    expect(bootstrap).toMatchObject({
      version: 3,
      auth: "pairing",
      appVersion: "1.2.3",
      home: join(profile, "tui"),
      directory,
      args: { continue: true, sessionId: "session-1", prompt: "Hello", auto: true },
    });
    // The TUI binds its project once connected; the launcher registers none.
    expect(bootstrap).not.toHaveProperty("projectId");
    expect(bootstrap).not.toHaveProperty("server");
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});

it("falls back to the checkout entry and fails a prefix without a binary", async () => {
  const root = resolve("tui-launch-fixture");
  const prefix = layout("prefix", root);
  await expect(
    resolveTuiLaunchForRun(prefix, {
      directory,
      env: {},
      appVersion: "1.2.3",
      fileExists: () => false,
      fetchImpl: (async () => new Response("not found", { status: 404 })) as typeof fetch,
    }),
  ).rejects.toBeInstanceOf(TuiLaunchUnavailableError);

  const checkout = layout("checkout", root);
  const bun = join(
    root,
    "node_modules",
    "bun",
    "bin",
    process.platform === "win32" ? "bun.exe" : "bun",
  );
  const source = join(root, "tui", "src", "main.ts");
  expect(
    await resolveTuiLaunchForRun(checkout, {
      directory,
      env: { PATH: "" },
      appVersion: "1.2.3",
      fileExists: (path) => path === bun || path === source,
    }),
  ).toEqual({ command: bun, args: [source], cwd: join(root, "tui") });
});

it.each([
  {
    owner: "a current desktop owner",
    // LAN access on: the advertised link is cleartext LAN, which the TUI refuses.
    grant: {
      pairingUrl: "http://192.168.1.20:49391/#token=desktop",
      localPairingUrl: "http://127.0.0.1:49391/#token=desktop",
    },
    redeemed: "http://127.0.0.1:49391/#token=desktop",
  },
  {
    owner: "a desktop owner that predates localPairingUrl",
    grant: { pairingUrl: "http://127.0.0.1:49391/#token=desktop" },
    redeemed: "http://127.0.0.1:49391/#token=desktop",
  },
])("attaches to $owner instead of starting another one", async ({ grant, redeemed }) => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-cli-tui-owner-")));
  const profile = join(root, "profile");
  const lease = HostOwnerLease.acquire(resolveHostRootPaths(profile), "desktop");
  prepareOwnedHostRoot(lease);
  const commands: string[] = [];
  // Mirrors the desktop composition: attach pairings are refused, while local
  // administration (projects, independent pairings) is served.
  const control = new HostControlServer({
    lease,
    describe: () => ({
      state: "ready",
      remoteProtocolVersion: 12,
      endpoint: null,
      capabilities: {
        ssh: true,
        browserPanel: true,
        chromeBridge: true,
        computerUse: true,
        nativeSecrets: true,
        portForward: true,
        autoUpdate: true,
        osNotifications: true,
      },
    }),
    issuePairing: () =>
      Promise.reject(new Error("The desktop owner does not mint attach pairings.")),
    administer: async (input) => {
      commands.push(input.command.action);
      const data =
        input.command.action === "projects-add"
          ? {
              formatVersion: 1,
              scope: "persisted-profile",
              project: {
                id: "project-1",
                name: "Fixture",
                location: { kind: "windows", path: directory },
                disabled: false,
                createdAt: "2026-10-31T00:00:00.000Z",
              },
              created: true,
            }
          : input.command.action === "pairings-create"
            ? {
                id: "pairing-1",
                ...grant,
                expiresAt: "2026-10-31T00:10:00.000Z",
                scopes: ["operator"],
              }
            : null;
      return data === null
        ? { adminVersion: input.adminVersion, outcome: { ok: false, error: "unexpected" } }
        : { adminVersion: input.adminVersion, outcome: { ok: true, data } };
    },
  });
  await control.start();
  const ownerSpawn = vi.fn<() => never>(() => {
    throw new Error("A second owner must never start.");
  });
  const child = new EventEmitter() as unknown as ChildProcess;
  const spawn = vi.fn<
    (
      command: string,
      args: string[],
      options: { env: NodeJS.ProcessEnv; stdio: unknown },
    ) => ChildProcess
  >(() => {
    process.nextTick(() => child.emit("exit", 0, null));
    return child;
  });
  try {
    const exitCode = await runCliTui(
      {} satisfies TuiCliOptions,
      { profileNamespace: profile, directory },
      {
        appVersion: "1.2.3",
        env: { PORACODE_TUI_BIN: "compiled-tui", PATH: "" },
        ensureOwner: (namespace, options) =>
          ensureCliOwner(namespace, { ...options, spawn: ownerSpawn as never }),
        fileExists: (path) => path === resolve("compiled-tui"),
        layout: layout("prefix", resolve("tui-prefix-fixture")),
        spawn: spawn as never,
        stdin: 7,
      },
    );
    expect(exitCode).toBe(0);
    expect(ownerSpawn).not.toHaveBeenCalled();
    expectOwned(profile);
    expect(commands).toEqual(["pairings-create"]);
    const [, , spawnOptions] = spawn.mock.calls[0]!;
    // The reopened console input reaches the TUI; output stays inherited.
    expect(spawnOptions.stdio).toEqual([7, "inherit", "inherit"]);
    expect(
      tuiBootstrapSchema.parse(JSON.parse(String(spawnOptions.env.PORACODE_TUI_BOOTSTRAP))),
    ).toMatchObject({
      auth: "pairing",
      pairingUrl: redeemed,
    });
  } finally {
    await control.dispose();
    lease.release();
    rmSync(root, { recursive: true, force: true });
  }
});

function remoteFixture() {
  const profile = mkdtempSync(join(tmpdir(), "poracode-cli-tui-remote-"));
  const home = join(profile, "tui");
  const exits: number[] = [];
  const launched: Record<string, unknown>[] = [];
  const beforeExit: (() => void)[] = [];
  const spawn = vi.fn<
    (command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => ChildProcess
  >((_command, _args, options) => {
    launched.push(JSON.parse(String(options.env.PORACODE_TUI_BOOTSTRAP)));
    const child = new EventEmitter() as unknown as ChildProcess;
    const code = exits.shift() ?? 0;
    process.nextTick(() => {
      beforeExit.shift()?.();
      child.emit("exit", code, null);
    });
    return child;
  });
  const ensureOwner = vi.fn<typeof ensureCliOwner>(
    async () =>
      ({
        requestId: "status-request",
        ownerGeneration: "owner-generation",
        description: {} as HostDescription,
      }) as HostStatusResponse,
  );
  const requestPairing = vi.fn<
    (profile: string, options: RequestPairingOptions) => Promise<PairingControlResponse>
  >(async () => ({
    requestId: "pairing-request",
    pairingUrl: "http://127.0.0.1:49152/#token=local",
  }));
  const logs: string[] = [];
  const run = (options: TuiCliOptions) =>
    runCliTui(
      options,
      { profileNamespace: profile, directory },
      {
        appVersion: "1.2.3",
        env: { PORACODE_TUI_BIN: "compiled-tui", PATH: "" },
        ensureOwner,
        fileExists: (path) => path === resolve("compiled-tui"),
        layout: layout("prefix", resolve("tui-prefix-fixture")),
        requestPairing,
        spawn: spawn as never,
        log: (line) => logs.push(line),
      },
    );
  const saveSession = (serverId: string) => {
    const dir = tuiSessionDirectory(home, serverId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "session.json"),
      JSON.stringify({
        version: 1,
        endpoint: "https://mac.local:49152",
        certFingerprint: "sha256:00",
        accessToken: "access",
        refreshToken: "refresh",
        refreshExpiresAtMs: Date.now() + 86_400_000,
      }),
    );
  };
  return {
    profile,
    home,
    exits,
    launched,
    beforeExit,
    spawn,
    ensureOwner,
    logs,
    run,
    saveSession,
    dispose: () => rmSync(profile, { recursive: true, force: true }),
  };
}

const mac = {
  id: tuiServerIdForEndpoint("https://mac.local:49152"),
  name: "mac",
  endpoint: "https://mac.local:49152",
  addedAt: "2026-11-01T00:00:00.000Z",
};

it("pairs a remote host from --pair without touching the local owner", async () => {
  const fixture = remoteFixture();
  try {
    const link = "https://mac.local:49152/#token=one-time&fp=sha256:00";
    expect(await fixture.run({ pairingUrl: link, serverName: "mac" })).toBe(0);
    expect(fixture.ensureOwner).not.toHaveBeenCalled();
    expect(readTuiServers(fixture.home)).toEqual([
      expect.objectContaining({ id: mac.id, name: "mac", endpoint: "https://mac.local:49152" }),
    ]);
    expect(fixture.launched[0]).toMatchObject({
      auth: "pairing",
      pairingUrl: link,
      server: { id: mac.id, name: "mac" },
    });
  } finally {
    fixture.dispose();
  }
});

it("reopens a saved server by name and explains an expired session", async () => {
  const fixture = remoteFixture();
  try {
    saveTuiServer(fixture.home, mac);
    // No saved session: nothing launches, and the hint names the host.
    expect(await fixture.run({ server: "MAC" })).toBe(77);
    expect(fixture.spawn).not.toHaveBeenCalled();
    expect(fixture.logs.join("\n")).toContain("poracode tui --pair");

    fixture.saveSession(mac.id);
    expect(await fixture.run({ server: "mac" })).toBe(0);
    expect(fixture.ensureOwner).not.toHaveBeenCalled();
    expect(fixture.launched[0]).toMatchObject({
      auth: "session",
      server: { id: mac.id, name: "mac" },
    });
    await expect(fixture.run({ server: "nas" })).rejects.toThrow("No saved server named nas");
  } finally {
    fixture.dispose();
  }
});

it("relaunches on the server the picker selected, without replaying one-shot args", async () => {
  const fixture = remoteFixture();
  try {
    saveTuiServer(fixture.home, mac);
    fixture.saveSession(mac.id);
    // Local first; the picker records the Mac and exits with the switch code.
    fixture.exits.push(TUI_SWITCH_SERVER_EXIT_CODE, TUI_SWITCH_SERVER_EXIT_CODE, 5);
    fixture.beforeExit.push(
      () => writeTuiServerSwitch(fixture.home, { kind: "server", id: mac.id }),
      () => writeTuiServerSwitch(fixture.home, { kind: "local" }),
    );
    expect(await fixture.run({ prompt: "Hello" })).toBe(5);
    expect(fixture.launched.map((value) => value.server ?? "local")).toEqual([
      "local",
      { id: mac.id, name: "mac" },
      "local",
    ]);
    expect(fixture.launched[0]).toMatchObject({ args: { prompt: "Hello" } });
    expect(fixture.launched[1]).toMatchObject({ args: {} });
    // The switch request is consumed, so a plain exit 78 later stops the loop.
    fixture.exits.push(TUI_SWITCH_SERVER_EXIT_CODE);
    expect(await fixture.run({})).toBe(TUI_SWITCH_SERVER_EXIT_CODE);
  } finally {
    fixture.dispose();
  }
});
