import { chmod, mkdir } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import { spawn as spawnProcess, type ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  HOST_ADMIN_PAIRING_DEFAULT_TTL_MS,
  hostAdminRequest,
  type HostAdminCommand,
} from "@/shared/hostAdminProtocol";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import {
  callHostControl,
  type HostControlCallOptions,
} from "@/backend/ownership/hostControlClient";
import {
  TUI_BOOTSTRAP_VERSION,
  TUI_HOME_DIRECTORY,
  tuiBootstrapSchema,
  type TuiBootstrap,
} from "@/shared/tuiBootstrap";
import type { HostBuildIdentity } from "@/shared/hostControlProtocol";
import type { PairingControlResponse, RequestPairingOptions } from "./pairingControl";
import { resolveServerInstallLayout, type ServerInstallLayout } from "./serverInstallLayout";
import { resolveServerVersion } from "./serverVersion";
import { ensureCliOwner } from "./cliOwner";
import { ensureTuiBinaryDownload } from "./cliTuiDownload";
import type { TuiCliOptions } from "./cliParse";
import { normalizePairingEndpoint, parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import {
  findTuiServer,
  readTuiServers,
  saveTuiServer,
  takeTuiServerSwitch,
  tuiServerIdForEndpoint,
  tuiSessionDirectory,
  TUI_SWITCH_SERVER_EXIT_CODE,
  type TuiServer,
  type TuiServerSwitchTarget,
} from "@/shared/tuiServers";
import {
  parseTuiSession,
  TUI_REPAIR_EXIT_CODE,
  TUI_SESSION_FILE_NAME,
  type TuiSession,
} from "@/shared/tuiSession";

export interface TuiLaunchPlan {
  readonly command: string;
  readonly args: string[];
  readonly cwd: string;
}

export interface ResolveTuiLaunchOptions {
  readonly directory: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
  readonly appVersion?: string;
  readonly pathValue?: string;
  readonly fileExists?: (path: string) => boolean;
  readonly fetchImpl?: typeof fetch;
  readonly log?: (line: string) => void;
}

export function createTuiBootstrap(
  input: {
    readonly appVersion: string;
    readonly home: string;
    readonly directory: string;
    readonly args: TuiBootstrap["args"];
    readonly server?: { readonly id: string; readonly name: string };
  } & ({ readonly pairingUrl: string } | { readonly session: TuiSession }),
): TuiBootstrap {
  const { appVersion, home, directory, args, server } = input;
  const auth =
    "session" in input
      ? { auth: "session" as const }
      : { auth: "pairing" as const, pairingUrl: input.pairingUrl };
  return tuiBootstrapSchema.parse({
    version: TUI_BOOTSTRAP_VERSION,
    appVersion,
    home,
    directory,
    args,
    ...(server ? { server: { id: server.id, name: server.name } } : {}),
    ...auth,
  });
}

function readSavedTuiSession(sessionDirectory: string): TuiSession | undefined {
  try {
    return parseTuiSession(
      JSON.parse(readFileSync(join(sessionDirectory, TUI_SESSION_FILE_NAME), "utf8")),
    );
  } catch {
    return undefined;
  }
}

export function resolveTuiLaunch(
  layout: ServerInstallLayout,
  options: ResolveTuiLaunchOptions,
): TuiLaunchPlan {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.fileExists ?? isFile;
  const directory = resolve(options.directory);
  const binary = resolveTuiBinary(layout, {
    env,
    platform,
    fileExists: exists,
  });
  if (binary) return { command: binary, args: [], cwd: directory };
  return resolveCheckoutLaunch(layout, { ...options, platform, env, exists, directory });
}

/**
 * Launch resolution for `poracode tui`: override and staged binaries first,
 * then the verified download cache (downloading on a miss when this install's
 * manifest declares an asset for the target), then the checkout Bun entry.
 */
export async function resolveTuiLaunchForRun(
  layout: ServerInstallLayout,
  options: ResolveTuiLaunchOptions,
): Promise<TuiLaunchPlan> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const exists = options.fileExists ?? isFile;
  const directory = resolve(options.directory);
  const binary =
    resolveTuiBinary(layout, { env, platform, fileExists: exists }) ??
    (options.appVersion !== undefined
      ? await ensureTuiBinaryDownload(layout, {
          env,
          platform,
          arch: options.arch ?? process.arch,
          appVersion: options.appVersion,
          ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
          ...(options.log !== undefined ? { log: options.log } : {}),
        })
      : undefined);
  if (binary) return { command: binary, args: [], cwd: directory };
  return resolveCheckoutLaunch(layout, { ...options, platform, env, exists, directory });
}

/** No TUI binary or checkout entrypoint exists for this install — a
 * configuration fact, not a crash: bare `poracode` falls back to serve+open. */
export class TuiLaunchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TuiLaunchUnavailableError";
  }
}

function resolveCheckoutLaunch(
  layout: ServerInstallLayout,
  options: ResolveTuiLaunchOptions & {
    readonly platform: NodeJS.Platform;
    readonly env: NodeJS.ProcessEnv;
    readonly exists: (path: string) => boolean;
    readonly directory: string;
  },
): TuiLaunchPlan {
  if (layout.kind === "prefix") {
    throw new TuiLaunchUnavailableError(
      `No TUI binary for ${options.platform}-${options.arch ?? process.arch} in this install; set PORACODE_TUI_BIN or use \`poracode serve --open\`.`,
    );
  }

  const entrypoint = join(layout.root, "tui", "src", "main.ts");
  if (!options.exists(entrypoint))
    throw new Error(`The TUI source entrypoint is missing: ${entrypoint}`);
  const bun = resolveCheckoutBun(
    layout.root,
    options.pathValue ?? options.env.PATH ?? "",
    options.platform,
    options.exists,
  );
  if (!bun) throw new Error("Bun is required to run the checkout TUI; run bun run tui:install.");
  return { command: bun, args: [entrypoint], cwd: join(layout.root, "tui") };
}

export function resolveTuiBinary(
  layout: ServerInstallLayout,
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly platform?: NodeJS.Platform;
    readonly fileExists?: (path: string) => boolean;
  } = {},
) {
  const override = options.env?.PORACODE_TUI_BIN?.trim();
  const exists = options.fileExists ?? isFile;
  if (override) {
    const binary = resolve(override);
    if (!exists(binary)) throw new Error(`PORACODE_TUI_BIN is not a file: ${binary}`);
    return binary;
  }
  return undefined;
}

export async function runCliTui(
  options: TuiCliOptions,
  input: {
    readonly profileNamespace: string;
    readonly baseDir?: string;
    readonly capturedBuild?: HostBuildIdentity;
    readonly directory?: string;
  },
  dependencies: {
    readonly ensureOwner?: typeof ensureCliOwner;
    readonly layout?: ServerInstallLayout;
    readonly appVersion?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly platform?: NodeJS.Platform;
    readonly arch?: string;
    readonly pathValue?: string;
    readonly spawn?: typeof spawnProcess;
    readonly fileExists?: (path: string) => boolean;
    readonly fetchImpl?: typeof fetch;
    readonly resolveLaunch?: typeof resolveTuiLaunchForRun;
    readonly cwd?: string;
    /** A reopened console-input descriptor when stdin itself is not the terminal. */
    readonly stdin?: number;
    readonly requestPairing?: (
      profileNamespace: string,
      options: RequestPairingOptions,
    ) => Promise<PairingControlResponse>;
    readonly log?: (line: string) => void;
    readonly revokeClientSession?: (
      profileNamespace: string,
      ownerGeneration: string,
      sessionId: string,
    ) => Promise<unknown>;
  } = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const directory = resolve(
    input.directory ?? options.directory ?? dependencies.cwd ?? process.cwd(),
  );
  // Resolve the launch before starting the owner:
  // an install with no TUI binary should fail without leaving state behind.
  const layout = dependencies.layout ?? resolveServerInstallLayout({ libDir: __dirname });
  const appVersion =
    dependencies.appVersion ??
    input.capturedBuild?.version ??
    resolveServerVersion({ layout }).version;
  const launch = await (dependencies.resolveLaunch ?? resolveTuiLaunchForRun)(layout, {
    directory,
    env,
    appVersion,
    ...(dependencies.platform !== undefined ? { platform: dependencies.platform } : {}),
    ...(dependencies.arch !== undefined ? { arch: dependencies.arch } : {}),
    ...(dependencies.pathValue !== undefined ? { pathValue: dependencies.pathValue } : {}),
    ...(dependencies.fileExists !== undefined ? { fileExists: dependencies.fileExists } : {}),
    ...(dependencies.fetchImpl !== undefined ? { fetchImpl: dependencies.fetchImpl } : {}),
  });
  const home = resolve(input.profileNamespace, TUI_HOME_DIRECTORY);
  await mkdir(home, { recursive: true, mode: 0o700 });
  if ((dependencies.platform ?? process.platform) !== "win32") await chmod(home, 0o700);
  const log = dependencies.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  const launchTui = (
    args: TuiBootstrap["args"],
    auth: { session: TuiSession } | { pairingUrl: string },
    server?: TuiServer,
  ) => {
    const bootstrap = createTuiBootstrap({
      appVersion,
      home,
      directory,
      args,
      ...(server ? { server } : {}),
      ...auth,
    });
    const child = (dependencies.spawn ?? spawnProcess)(launch.command, launch.args, {
      cwd: launch.cwd,
      env: {
        ...env,
        PORACODE_TUI_BOOTSTRAP: JSON.stringify(bootstrap),
        PORACODE_TUI_HOME: home,
      },
      stdio:
        dependencies.stdin === undefined ? "inherit" : [dependencies.stdin, "inherit", "inherit"],
      windowsHide: true,
    });
    return waitForTui(child);
  };

  // The local host: start or attach to this profile's owner. The TUI binds
  // its project itself once connected, so nothing is registered here.
  const runLocal = async (args: TuiBootstrap["args"]) => {
    const owner = await (dependencies.ensureOwner ?? ensureCliOwner)(input.profileNamespace, {
      ...(input.baseDir !== undefined ? { baseDir: input.baseDir } : {}),
      ...(input.capturedBuild !== undefined ? { capturedBuild: input.capturedBuild } : {}),
    });
    const requestPairing = dependencies.requestPairing ?? requestTuiPairing;
    // A saved session skips pairing entirely — one dedicated client entry per
    // profile. The TUI exits 77 when the host rejects it; pair once and relaunch.
    const savedSession = readSavedTuiSession(home);
    if (savedSession) {
      const exitCode = await launchTui(args, { session: savedSession });
      if (exitCode !== TUI_REPAIR_EXIT_CODE) return exitCode;
    }
    const pairing = await requestPairing(input.profileNamespace, {
      preset: "operator",
      expectedGeneration: owner.ownerGeneration,
    });
    // The rejected session is dead; revoke only its exact id — never other
    // clients, and never before the replacement pairing exists.
    if (savedSession?.sessionId)
      await (dependencies.revokeClientSession ?? revokeClientSession)(
        input.profileNamespace,
        owner.ownerGeneration,
        savedSession.sessionId,
      ).catch(() => undefined);
    return launchTui(args, { pairingUrl: pairing.pairingUrl });
  };

  // A paired remote host can only be re-paired from that host, so a rejected
  // or expired session ends the launch with instructions instead.
  const repairHint = (server: TuiServer) =>
    `The saved session for ${server.name} expired or was revoked. Create a pairing link on that host and run: poracode tui --pair <link>`;
  const runSaved = async (server: TuiServer, args: TuiBootstrap["args"]) => {
    const savedSession = readSavedTuiSession(tuiSessionDirectory(home, server.id));
    if (!savedSession) {
      log(repairHint(server));
      return TUI_REPAIR_EXIT_CODE;
    }
    const exitCode = await launchTui(args, { session: savedSession }, server);
    if (exitCode === TUI_REPAIR_EXIT_CODE) log(repairHint(server));
    return exitCode;
  };
  const runPaired = async (
    pairingUrl: string,
    name: string | undefined,
    args: TuiBootstrap["args"],
  ) => {
    if (!parsePairingUrlParts(pairingUrl))
      throw new Error(
        "That is not a Poracode pairing link. Copy a fresh link from the other host.",
      );
    const endpoint = normalizePairingEndpoint(pairingUrl);
    const server: TuiServer = {
      id: tuiServerIdForEndpoint(endpoint),
      name: name ?? new URL(endpoint).hostname,
      endpoint,
      addedAt: new Date().toISOString(),
    };
    saveTuiServer(home, server);
    const exitCode = await launchTui(args, { pairingUrl }, server);
    if (exitCode === TUI_REPAIR_EXIT_CODE) log(repairHint(server));
    return exitCode;
  };

  const bootstrapArgs = {
    ...(options.continue !== undefined ? { continue: options.continue } : {}),
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
    ...(options.auto !== undefined ? { auto: options.auto } : {}),
  };
  const named = options.server ? findTuiServer(readTuiServers(home), options.server) : undefined;
  if (options.server && !named)
    throw new Error(
      `No saved server named ${options.server}. Pair it first with poracode tui --pair <link>.`,
    );
  let target: TuiServerSwitchTarget = options.pairingUrl
    ? {
        kind: "pair",
        pairingUrl: options.pairingUrl,
        ...(options.serverName ? { name: options.serverName } : {}),
      }
    : named
      ? { kind: "server", id: named.id }
      : { kind: "local" };
  let args: TuiBootstrap["args"] = bootstrapArgs;
  // The in-TUI server picker exits with TUI_SWITCH_SERVER_EXIT_CODE after
  // recording its target; relaunch there without replaying one-shot args.
  for (;;) {
    let exitCode: number;
    if (target.kind === "local") exitCode = await runLocal(args);
    else if (target.kind === "pair")
      exitCode = await runPaired(target.pairingUrl, target.name, args);
    else {
      const id = target.id;
      const server = readTuiServers(home).find((value) => value.id === id);
      if (!server) throw new Error("The selected server is no longer saved.");
      exitCode = await runSaved(server, args);
    }
    if (exitCode !== TUI_SWITCH_SERVER_EXIT_CODE) return exitCode;
    const next = takeTuiServerSwitch(home);
    if (!next) return exitCode;
    target = next;
    args = {};
  }
}

const tuiPairingGrantSchema = z.object({
  pairingUrl: z.url(),
  localPairingUrl: z.url().optional(),
});

/**
 * Mints the TUI's one-time pairing through the owner's local administration.
 * Desktop and headless owners both serve `pairings-create`; the desktop owner
 * refuses the attach-only `issue-pairing` operation. The TUI runs beside the
 * owner, so it redeems the grant on the owner's own listener; an owner that
 * predates `localPairingUrl` still returns its advertised link.
 */
async function requestTuiPairing(
  profileNamespace: string,
  options: RequestPairingOptions,
): Promise<PairingControlResponse> {
  const { preset, ...callOptions } = options;
  const { requestId, data } = await administer(
    profileNamespace,
    {
      action: "pairings-create",
      label: "Terminal UI",
      ttlMs: HOST_ADMIN_PAIRING_DEFAULT_TTL_MS,
      ...(preset !== undefined ? { preset } : {}),
    },
    // Minting is immediate; keep the bound the attach-only issue-pairing had.
    { timeoutMs: 5_000, ...callOptions },
  );
  const grant = tuiPairingGrantSchema.parse(data);
  return { requestId, pairingUrl: grant.localPairingUrl ?? grant.pairingUrl };
}

async function revokeClientSession(
  profileNamespace: string,
  ownerGeneration: string,
  sessionId: string,
) {
  await administer(
    profileNamespace,
    { action: "clients-revoke", sessionId },
    { expectedGeneration: ownerGeneration },
  );
}

async function administer(
  profileNamespace: string,
  command: HostAdminCommand,
  options: HostControlCallOptions,
) {
  const response = await callHostControl(resolveHostRootPaths(profileNamespace), "admin", {
    ...options,
    payload: hostAdminRequest(command),
  });
  if (!response.result.outcome.ok) throw new Error(response.result.outcome.error);
  return { requestId: response.requestId, data: response.result.outcome.data };
}

function waitForTui(child: ChildProcess) {
  const ignore = () => undefined;
  process.on("SIGINT", ignore);
  process.on("SIGTERM", ignore);
  return new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  }).finally(() => {
    process.off("SIGINT", ignore);
    process.off("SIGTERM", ignore);
  });
}

function resolveCheckoutBun(
  root: string,
  pathValue: string,
  platform: NodeJS.Platform,
  exists: (path: string) => boolean,
) {
  const local = join(root, "node_modules", "bun", "bin", bunExecutableName(platform));
  if (exists(local)) return local;
  const extensions = platform === "win32" ? [".exe", ""] : [""];
  const separator = platform === "win32" ? ";" : ":";
  for (const directory of pathValue.split(separator)) {
    for (const extension of extensions) {
      const candidate = join(directory, `bun${extension}`);
      if (exists(candidate)) return candidate;
    }
  }
  return undefined;
}

function bunExecutableName(platform: NodeJS.Platform) {
  return platform === "win32" ? "bun.exe" : "bun";
}

function isFile(path: string) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
