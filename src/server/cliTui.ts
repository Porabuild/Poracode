import { chmod, mkdir } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import { spawn as spawnProcess, type ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { hostAdminRequest } from "@/shared/hostAdminProtocol";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import { hostProjectAdditionSchema } from "@/shared/contracts/hostProjects";
import {
  TUI_BOOTSTRAP_VERSION,
  TUI_HOME_DIRECTORY,
  tuiBootstrapSchema,
  type TuiBootstrap,
} from "@/shared/tuiBootstrap";
import type { HostBuildIdentity } from "@/shared/hostControlProtocol";
import {
  requestPairingFromRunningServer,
  type PairingControlResponse,
  type RequestPairingOptions,
} from "./pairingControl";
import { resolveServerInstallLayout, type ServerInstallLayout } from "./serverInstallLayout";
import { resolveServerVersion } from "./serverVersion";
import { ensureCliOwner } from "./cliOwner";
import { ensureTuiBinaryDownload } from "./cliTuiDownload";
import type { TuiCliOptions } from "./cliParse";
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
    readonly projectId: string;
    readonly args: TuiBootstrap["args"];
  } & ({ readonly pairingUrl: string } | { readonly session: TuiSession }),
): TuiBootstrap {
  const { appVersion, home, directory, projectId, args } = input;
  const auth =
    "session" in input
      ? { auth: "session" as const }
      : { auth: "pairing" as const, pairingUrl: input.pairingUrl };
  return tuiBootstrapSchema.parse({
    version: TUI_BOOTSTRAP_VERSION,
    appVersion,
    home,
    directory,
    projectId,
    args,
    ...auth,
  });
}

function readSavedTuiSession(home: string): TuiSession | undefined {
  try {
    return parseTuiSession(JSON.parse(readFileSync(join(home, TUI_SESSION_FILE_NAME), "utf8")));
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
    readonly requestPairing?: (
      profileNamespace: string,
      options: RequestPairingOptions,
    ) => Promise<PairingControlResponse>;
    readonly registerProject?: (
      profileNamespace: string,
      ownerGeneration: string,
      directory: string,
    ) => Promise<unknown>;
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
  // Resolve the launch before starting the owner or registering the project:
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
  const owner = await (dependencies.ensureOwner ?? ensureCliOwner)(input.profileNamespace, {
    ...(input.baseDir !== undefined ? { baseDir: input.baseDir } : {}),
    ...(input.capturedBuild !== undefined ? { capturedBuild: input.capturedBuild } : {}),
  });
  const home = resolve(input.profileNamespace, TUI_HOME_DIRECTORY);
  await mkdir(home, { recursive: true, mode: 0o700 });
  if ((dependencies.platform ?? process.platform) !== "win32") await chmod(home, 0o700);
  const project = hostProjectAdditionSchema.parse(
    await (dependencies.registerProject ?? addProject)(
      input.profileNamespace,
      owner.ownerGeneration,
      directory,
    ),
  );
  const requestPairing = dependencies.requestPairing ?? requestPairingFromRunningServer;
  // A saved session skips pairing entirely — one dedicated client entry per
  // profile. The TUI exits 77 when the host rejects it; pair once and relaunch.
  const savedSession = readSavedTuiSession(home);
  const bootstrapArgs = {
    ...(options.continue !== undefined ? { continue: options.continue } : {}),
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
    ...(options.auto !== undefined ? { auto: options.auto } : {}),
  };
  const run = async (auth: { session: TuiSession } | { pairingUrl: string }) => {
    const bootstrap = createTuiBootstrap({
      appVersion,
      home,
      directory,
      projectId: project.project.id,
      args: bootstrapArgs,
      ...auth,
    });
    const child = (dependencies.spawn ?? spawnProcess)(launch.command, launch.args, {
      cwd: launch.cwd,
      env: {
        ...env,
        PORACODE_TUI_BOOTSTRAP: JSON.stringify(bootstrap),
        PORACODE_TUI_HOME: home,
      },
      stdio: "inherit",
      windowsHide: true,
    });
    return waitForTui(child);
  };
  if (savedSession) {
    const exitCode = await run({ session: savedSession });
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
  return run({ pairingUrl: pairing.pairingUrl });
}

async function revokeClientSession(
  profileNamespace: string,
  ownerGeneration: string,
  sessionId: string,
) {
  const response = await callHostControl(resolveHostRootPaths(profileNamespace), "admin", {
    expectedGeneration: ownerGeneration,
    payload: hostAdminRequest({ action: "clients-revoke", sessionId }),
  });
  if (!response.result.outcome.ok) throw new Error(response.result.outcome.error);
}

async function addProject(profileNamespace: string, ownerGeneration: string, directory: string) {
  const response = await callHostControl(resolveHostRootPaths(profileNamespace), "admin", {
    expectedGeneration: ownerGeneration,
    payload: hostAdminRequest({ action: "projects-add", path: directory }),
  });
  if (!response.result.outcome.ok) throw new Error(response.result.outcome.error);
  return response.result.outcome.data;
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
