import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { detectLanIpv4Address, detectTailnetIpv4Address } from "@/host/remote/config";
import {
  defaultTlsSubjectNames,
  generateSelfSignedTlsMaterial,
} from "@/host/remote/server/tlsMaterial";
import { runAdminCli } from "./cliAdmin";
import { promptCli } from "./cliPrompts";
import {
  describeUpReachability,
  loadSavedUpConfig,
  planUpSettings,
  profileTlsPaths,
  resolveUpBindChoice,
  savedHostLocalNote,
  savedHostOverrideNote,
  savedTlsPair,
  tailnetUnavailableNote,
  UP_USAGE,
  upReachabilityView,
  type UpReachability,
  type UpReachabilityPromptInput,
} from "./cliUpReachability";
import { defaultInstallerPrefix, resolveInstallerPrefix, SelfUpdateError } from "./installerPrefix";
import { readStandaloneRuntimeMarker } from "../../scripts/server-release-install.mjs";
import { runConfigure } from "./cliConfigure";
import { writeInitTlsMaterial } from "./initTlsWrite";
import { runServerService, type ServiceCliOptions } from "./serverService";
import { SERVER_SERVICE_REGISTRATION_FILE } from "./serverServiceRegistration";
import { probeRunningOwner } from "./serverUpgradeIdentity";

export type { UpReachability } from "./cliUpReachability";

/**
 * `poracode up`: one command that makes an installed CLI reachable from other
 * devices. It composes existing, separately documented operations: saved
 * configuration (`configure`), self-signed TLS for a LAN listener (`init-tls`),
 * the managed user service (`service install|start|restart`), and a pairing
 * grant (`pairings create --qr`). Nothing here bypasses their refusals: a
 * plaintext LAN bind is never configured, lingering and elevation are only
 * explained, and a pairing code is only shown in an interactive terminal.
 */
export interface UpCliOptions {
  readonly reachability?: UpReachability;
  readonly relayUrl?: string;
  readonly prefix?: string;
  readonly service: boolean;
  readonly pair: boolean;
}

export function parseUpCliOptions(args: readonly string[]): UpCliOptions {
  let reachability: UpReachability | undefined;
  let relayUrl: string | undefined;
  let prefix: string | undefined;
  let service = true;
  let pair = true;
  const choose = (value: UpReachability) => {
    if (reachability !== undefined && reachability !== value)
      throw new Error(`Choose one of --tailnet, --lan or --local-only. ${UP_USAGE}`);
    reachability = value;
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--tailnet") choose("tailnet");
    else if (argument === "--lan") choose("lan");
    else if (argument === "--local-only") choose("local");
    else if (argument === "--no-service") service = false;
    else if (argument === "--no-pair") pair = false;
    else if (argument === "--relay-url" || argument === "--prefix") {
      const value = args[++index];
      if (!value?.trim() || value.startsWith("--"))
        throw new Error(`${argument} needs a value. ${UP_USAGE}`);
      if (argument === "--relay-url") {
        let url: URL;
        try {
          url = new URL(value);
        } catch {
          throw new Error("--relay-url must be a wss:// or https:// URL.");
        }
        if (url.protocol !== "wss:" && url.protocol !== "https:")
          throw new Error("--relay-url must be a wss:// or https:// URL.");
        relayUrl = value;
      } else prefix = value;
    } else throw new Error(`Unknown up argument ${argument}. ${UP_USAGE}`);
  }
  return {
    ...(reachability !== undefined ? { reachability } : {}),
    ...(relayUrl !== undefined ? { relayUrl } : {}),
    ...(prefix !== undefined ? { prefix } : {}),
    service,
    pair,
  };
}

/** Poll the profile's owner until it answers its authenticated control probe. */
async function waitForRunningOwner(profile: string, timeoutMs: number): Promise<boolean> {
  const paths = resolveHostRootPaths(profile);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if ((await probeRunningOwner(paths)) !== null) return true;
    } catch {
      // Still starting: the record may exist before control answers.
    }
    if (Date.now() >= deadline) return false;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
}

/**
 * Once the service answers, create a pairing grant and print its QR code
 * exactly as `pairings create --qr` does. False when it never answered.
 */
export async function pairWhenReady(input: {
  readonly profile: string;
  readonly timeoutMs?: number;
  readonly waitForOwner?: (profile: string, timeoutMs: number) => Promise<boolean>;
  readonly pair?: (profile: string) => Promise<unknown>;
}): Promise<boolean> {
  const ready = await (input.waitForOwner ?? waitForRunningOwner)(
    input.profile,
    input.timeoutMs ?? 30_000,
  );
  if (!ready) return false;
  await (input.pair ?? ((profile: string) => runAdminCli(profile, ["pairings", "create", "--qr"])))(
    input.profile,
  );
  return true;
}

/** Reuse the profile's TLS material, creating it once like `init-tls`. */
export function ensureProfileTls(profile: string): {
  certPath: string;
  keyPath: string;
  created: boolean;
} {
  const { certPath, keyPath } = profileTlsPaths(profile);
  if (existsSync(certPath) && existsSync(keyPath)) return { certPath, keyPath, created: false };
  if (existsSync(certPath) || existsSync(keyPath))
    throw new Error(`Only one of ${certPath} and ${keyPath} exists; restore or remove it first.`);
  const material = generateSelfSignedTlsMaterial(defaultTlsSubjectNames());
  writeInitTlsMaterial({
    certPath,
    keyPath,
    cert: material.cert,
    key: material.key,
    restrictKeyDirectory: true,
  });
  return { certPath, keyPath, created: true };
}

/** `true`/`false` from logind, `null` when unknown (not systemd, no loginctl). */
export function linuxLingerEnabled(): boolean | null {
  try {
    const value = execFileSync(
      "loginctl",
      ["show-user", userInfo().username, "--property=Linger", "--value"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5_000 },
    ).trim();
    return value === "yes" ? true : value === "no" ? false : null;
  } catch {
    return null;
  }
}

export interface UpResult {
  readonly prefix?: string;
  readonly configured: readonly string[];
  readonly tlsCreated: boolean;
  readonly service: "installed-started" | "restarted" | "running" | "skipped" | "unavailable";
  readonly reachability: UpReachability | "custom";
  readonly reachable: boolean;
  readonly tailnetAddress?: string;
  readonly lanAddress?: string;
  readonly relayHost?: string;
  readonly savedHost?: string;
  readonly customTls?: boolean;
  readonly notes: readonly string[];
}

/**
 * The prefix the managed service needs: an explicit --prefix, or this
 * install's own installer prefix. npm and package-manager installs have
 * neither; they may still borrow a one-line install's prefix when one exists
 * at the installer's default location on this machine.
 */
function resolveUpServicePrefix(
  options: UpCliOptions,
  deps: {
    readonly releaseRoot: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly home?: string;
    readonly platform?: NodeJS.Platform;
  },
): { readonly prefix: string; readonly fallback: boolean } | undefined {
  if (options.prefix !== undefined) {
    const install = resolveInstallerPrefix({
      explicitPrefix: options.prefix,
      releaseRoot: deps.releaseRoot,
    });
    return { prefix: install.prefix, fallback: false };
  }
  try {
    const install = resolveInstallerPrefix({ releaseRoot: deps.releaseRoot });
    return { prefix: install.prefix, fallback: false };
  } catch (error) {
    if (!(error instanceof SelfUpdateError)) throw error;
  }
  const fallbackPrefix = defaultInstallerPrefix({
    ...(deps.env !== undefined ? { env: deps.env } : {}),
    ...(deps.home !== undefined ? { home: deps.home } : {}),
    ...(deps.platform !== undefined ? { platform: deps.platform } : {}),
  });
  if (!existsSync(join(fallbackPrefix, "current"))) return undefined;
  const install = resolveInstallerPrefix({
    explicitPrefix: fallbackPrefix,
    releaseRoot: deps.releaseRoot,
  });
  return { prefix: install.prefix, fallback: true };
}

/** `true` when the profile already has a running owner; probe failures count as running. */
async function defaultOwnerRunning(profile: string): Promise<boolean> {
  try {
    return (await probeRunningOwner(resolveHostRootPaths(profile))) !== null;
  } catch {
    return true;
  }
}

/** Yes/no confirmation before restarting a service with running agent turns. */
async function confirmServiceRestart(): Promise<boolean> {
  const answer = (
    await promptCli(
      "Restart the background service to apply this? Running agent turns stop. [Y/n]: ",
    )
  )
    .trim()
    .toLowerCase();
  if (answer === "" || answer === "y" || answer === "yes") return true;
  if (answer === "n" || answer === "no") return false;
  throw new Error("Answer yes or no; nothing was changed.");
}

export async function runUp(
  options: UpCliOptions,
  deps: {
    readonly profile: string;
    readonly releaseRoot: string;
    readonly configure?: (profile: string, args: readonly string[]) => Promise<unknown>;
    readonly ensureTls?: (profile: string) => {
      certPath: string;
      keyPath: string;
      created: boolean;
    };
    readonly service?: (profile: string, options: ServiceCliOptions) => Promise<unknown>;
    readonly lingerEnabled?: () => boolean | null;
    readonly platform?: NodeJS.Platform;
    readonly env?: NodeJS.ProcessEnv;
    readonly home?: string;
    readonly version?: string;
    readonly interactive?: boolean;
    readonly chooseReachability?: (input: UpReachabilityPromptInput) => Promise<UpReachability>;
    readonly confirmRestart?: () => Promise<boolean>;
    readonly ownerRunning?: (profile: string) => Promise<boolean>;
    readonly tailnetAddress?: () => string | undefined;
    readonly lanAddress?: () => string | undefined;
  },
): Promise<UpResult> {
  const serviceTarget = resolveUpServicePrefix(options, {
    releaseRoot: deps.releaseRoot,
    ...(deps.env !== undefined ? { env: deps.env } : {}),
    ...(deps.home !== undefined ? { home: deps.home } : {}),
    ...(deps.platform !== undefined ? { platform: deps.platform } : {}),
  });
  const saved = loadSavedUpConfig(deps.profile);
  const interactive =
    deps.interactive ?? (process.stdin.isTTY === true && process.stderr.isTTY === true);
  const tailnetAddress = (deps.tailnetAddress ?? detectTailnetIpv4Address)();
  const lanAddress = (deps.lanAddress ?? detectLanIpv4Address)();
  const tlsPair = savedTlsPair(saved, deps.profile);
  // The choice and its plan are settled before anything is written; a refused
  // or cancelled choice leaves no config, TLS material, or service change.
  const choice = await resolveUpBindChoice({
    flagChoice: options.reachability,
    relayFlagged: options.relayUrl !== undefined,
    interactive,
    saved,
    ...(tailnetAddress !== undefined ? { tailnetAddress } : {}),
    ...(lanAddress !== undefined ? { lanAddress } : {}),
    ...(tlsPair.customTls ? { customTls: true } : {}),
    ...(deps.chooseReachability !== undefined ? { choose: deps.chooseReachability } : {}),
  });
  const tlsPaths = profileTlsPaths(deps.profile);
  const tlsFilesExist = existsSync(tlsPaths.certPath) && existsSync(tlsPaths.keyPath);
  const plan = planUpSettings({
    saved,
    choice,
    relayUrl: options.relayUrl,
    profile: deps.profile,
    tlsFilesExist,
  });
  const effectiveRelayUrl = plan.patch.relayUrl ?? saved.relayUrl;
  const effectiveBindMode = plan.patch.bindMode ?? saved.bindMode;
  const view = upReachabilityView({
    ...(effectiveBindMode !== undefined ? { bindMode: effectiveBindMode } : {}),
    ...(saved.host !== undefined ? { savedHost: saved.host } : {}),
    ...(effectiveRelayUrl !== undefined ? { relayUrl: effectiveRelayUrl } : {}),
    ...(tailnetAddress !== undefined ? { tailnetAddress } : {}),
    ...(lanAddress !== undefined ? { lanAddress } : {}),
    ...(tlsPair.customTls ? { customTls: true } : {}),
  });

  const notes: string[] = [];
  let service: UpResult["service"] = "skipped";
  let tlsCreated = false;
  const configure =
    deps.configure ??
    ((profile: string, args: readonly string[]) => runConfigure(profile, args, { quiet: true }));
  // TLS material and the configure write happen together, after any restart
  // confirmation, so a declined restart leaves nothing behind.
  const applyPlan = async (): Promise<void> => {
    if (plan.createProfileTls) {
      const tls = (deps.ensureTls ?? ensureProfileTls)(deps.profile);
      tlsCreated ||= tls.created;
    }
    if (plan.write) await configure(deps.profile, plan.configureArgs);
  };

  if (options.service) {
    const platform = deps.platform ?? process.platform;
    if (serviceTarget === undefined) {
      service = "unavailable";
      // The running train decides which installer one-liner can help: a nightly
      // build needs PORACODE_CHANNEL=nightly because stable has no archives yet.
      const version =
        deps.version ??
        (() => {
          try {
            return readStandaloneRuntimeMarker(deps.releaseRoot)?.version;
          } catch {
            return undefined;
          }
        })();
      const nightly = version !== undefined && /-nightly\./u.test(version);
      const installCommand = nightly
        ? platform === "win32"
          ? "$env:PORACODE_CHANNEL = 'nightly'; irm https://poracode.com/install.ps1 | iex"
          : "curl -fsSL https://poracode.com/install.sh | PORACODE_CHANNEL=nightly sh"
        : platform === "win32"
          ? "irm https://poracode.com/install.ps1 | iex"
          : "curl -fsSL https://poracode.com/install.sh | sh";
      notes.push(
        "This poracode came from npm or a package manager, whose layout cannot host the " +
          "managed background service. Install the CLI with the one-line installer, then " +
          `run poracode up again: ${installCommand}`,
      );
      await applyPlan();
      if (plan.write) notes.push("Saved settings apply the next time the server starts.");
    } else {
      if (serviceTarget.fallback) {
        notes.push(
          `Using the one-line installer's prefix ${serviceTarget.prefix} for the background service.`,
        );
      }
      const base = { prefix: serviceTarget.prefix, recover: false, json: false } as const;
      const runService = deps.service ?? runServerService;
      if (existsSync(join(serviceTarget.prefix, SERVER_SERVICE_REGISTRATION_FILE))) {
        if (plan.restartNeeded) {
          const ownerRunning = await (deps.ownerRunning ?? defaultOwnerRunning)(deps.profile);
          if (ownerRunning && interactive) {
            const confirmed = await (deps.confirmRestart ?? confirmServiceRestart)();
            if (!confirmed)
              throw new Error(
                "Nothing was changed; the background service keeps its current settings.",
              );
          }
          await applyPlan();
          await runService(deps.profile, { ...base, action: "restart" });
          service = "restarted";
          if (ownerRunning && !interactive)
            notes.push("The restart stopped any running agent turns.");
        } else {
          // Nothing changed: qualify and return a running owner, or start a
          // stopped service. Never restart when nothing changed.
          await applyPlan();
          await runService(deps.profile, { ...base, action: "start" });
          service = "running";
        }
      } else {
        await applyPlan();
        await runService(deps.profile, { ...base, action: "install" });
        await runService(deps.profile, { ...base, action: "start" });
        service = "installed-started";
      }
      if (platform === "linux" && (deps.lingerEnabled ?? linuxLingerEnabled)() === false) {
        notes.push(
          'The service stops when you log out. To keep it running, enable lingering once: sudo loginctl enable-linger "$(id -un)"',
        );
      }
      if (platform === "darwin") notes.push("macOS runs the service while you are logged in.");
      if (platform === "win32") notes.push("Windows starts the service when you sign in.");
    }
  } else {
    await applyPlan();
    if (plan.write) notes.push("Saved settings apply the next time the server starts.");
  }

  if (view.reachability === "tailnet" && tailnetAddress === undefined) {
    notes.push(
      tailnetUnavailableNote({
        hasService: options.service && serviceTarget !== undefined,
        ...(serviceTarget !== undefined ? { prefix: serviceTarget.prefix } : {}),
      }),
    );
  }
  if (plan.patch.bindMode !== undefined && saved.host !== undefined) {
    notes.push(savedHostOverrideNote(saved.host));
  } else if (view.reachability === "custom" && !view.reachable && saved.host !== undefined) {
    notes.push(savedHostLocalNote(saved.host));
  }

  return {
    ...(serviceTarget !== undefined ? { prefix: serviceTarget.prefix } : {}),
    configured: plan.write ? plan.configureArgs : [],
    tlsCreated,
    service,
    reachability: view.reachability,
    reachable: view.reachable,
    ...(view.tailnetAddress !== undefined ? { tailnetAddress: view.tailnetAddress } : {}),
    ...(view.lanAddress !== undefined ? { lanAddress: view.lanAddress } : {}),
    ...(view.relayHost !== undefined ? { relayHost: view.relayHost } : {}),
    ...(view.savedHost !== undefined ? { savedHost: view.savedHost } : {}),
    ...(view.customTls === true ? { customTls: true } : {}),
    notes,
  };
}

export async function runUpCli(
  options: UpCliOptions,
  profile: string,
  releaseRoot: string,
): Promise<void> {
  const result = await runUp(options, { profile, releaseRoot });
  if (result.configured.length > 0) {
    process.stdout.write(
      `Saved remote access settings: ${result.configured.filter((arg) => arg.startsWith("--")).join(" ")}\n`,
    );
  }
  process.stdout.write(`${describeUpReachability(result)}\n`);
  if (result.tlsCreated)
    process.stdout.write("Created self-signed TLS material for the LAN listener.\n");
  process.stdout.write(
    result.service === "installed-started"
      ? `Installed and started the background service for ${result.prefix}.\n`
      : result.service === "restarted"
        ? "Restarted the background service with the new settings.\n"
        : result.service === "running"
          ? "The background service is running.\n"
          : result.service === "unavailable"
            ? "No background service was set up for this install.\n"
            : "No background service was changed (--no-service).\n",
  );
  for (const note of result.notes) process.stdout.write(`${note}\n`);
  const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;
  let paired = false;
  if (
    (result.service === "installed-started" ||
      result.service === "restarted" ||
      result.service === "running") &&
    options.pair &&
    interactive &&
    result.reachable
  ) {
    process.stdout.write("Waiting for the service to answer...\n");
    paired = await pairWhenReady({ profile });
    process.stdout.write(
      paired
        ? "Scan the code with the Poracode app, or open the link on your other device.\n"
        : "The service has not answered yet.\n",
    );
  }
  if (!paired) {
    if (result.reachable) {
      process.stdout.write("Pair a phone or browser: poracode pairings create --qr\n");
    } else if (result.reachability === "local") {
      process.stdout.write(
        "To let your other devices connect, run poracode up again and choose Tailscale or the local network.\n",
      );
    }
  }
  process.stdout.write(
    `Check it with: poracode status${result.prefix === undefined ? "" : ` (and poracode service status --prefix ${result.prefix})`}\n`,
  );
}
