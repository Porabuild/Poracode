import { EventEmitter } from "node:events";
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
import { hostProjectAdditionSchema } from "@/shared/contracts/hostProjects";
import type { HostDescription } from "@/shared/hostControlProtocol";
import type {
  HostStatusResponse,
  PairingControlResponse,
  RequestPairingOptions,
} from "./pairingControl";
import { ensureCliOwner } from "./cliOwner";
import type { TuiCliOptions } from "./cliParse";

const directory = resolve("tmp/cli-tui-project");
const bootstrapInput = {
  appVersion: "1.2.3",
  home: resolve("tmp/cli-tui-home"),
  pairingUrl: "http://127.0.0.1:49152/#token=temporary",
  directory,
  projectId: "project-1",
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
    version: 2,
    auth: "pairing",
    args: { continue: true, sessionId: "session-1", prompt: "Hello", auto: true },
  });
  expect(tuiBootstrapSchema.safeParse({ ...bootstrapInput, version: 3 }).success).toBe(false);
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
  expect(bootstrap).toMatchObject({ version: 2, auth: "session" });
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
  const registerProject = vi.fn<
    (profile: string, generation: string, directory: string) => Promise<unknown>
  >(async () =>
    hostProjectAdditionSchema.parse({
      formatVersion: 1,
      scope: "persisted-profile",
      project: {
        id: "project-1",
        name: "Fixture",
        location: { kind: "windows", path: directory },
        disabled: false,
        createdAt: "2026-10-21T00:00:00.000Z",
      },
      created: true,
    }),
  );
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
        registerProject,
        requestPairing,
        spawn: spawn as never,
      },
    );
    expect(exitCode).toBe(19);
    expect(ensureOwner).toHaveBeenCalledOnce();
    expect(registerProject).toHaveBeenCalledWith(profile, "owner-generation", directory);
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
      version: 2,
      auth: "pairing",
      appVersion: "1.2.3",
      home: join(profile, "tui"),
      directory,
      projectId: "project-1",
      args: { continue: true, sessionId: "session-1", prompt: "Hello", auto: true },
    });
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
