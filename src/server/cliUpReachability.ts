import { resolve } from "node:path";
import { classifyBindHostExposure } from "@/host/remote/config";
import {
  defaultServerConfigPath,
  loadServerConfigFile,
  type ServerConfigFile,
} from "./serverConfig";
import { promptCli, terminalText } from "./cliPrompts";

/**
 * `poracode up` reachability: how other devices reach this machine. The saved
 * choice lives in the same server config `configure` writes; this module owns
 * the interactive picker, the settings planner (which `configure` fields would
 * change and whether the running service must restart for them), and the
 * user-facing reachability text. `cliUp.ts` orchestrates; nothing here touches
 * the filesystem beyond reading the saved config.
 */
export const UP_USAGE =
  "Usage: poracode up [--tailnet | --lan | --local-only] [--relay-url URL] [--prefix PATH] [--no-service] [--no-pair]";

export type UpReachability = "local" | "tailnet" | "lan";

export interface UpReachabilityPromptInput {
  readonly current?: UpReachability;
  readonly tailnetAddress?: string;
  readonly lanAddress?: string;
  readonly relayHost?: string;
  readonly customTls?: boolean;
}

export interface UpReachabilityPromptIO {
  readonly ask: (question: string) => Promise<string>;
  readonly write: (text: string) => void;
}

/**
 * The profile's self-signed LAN listener material (`init-tls` defaults).
 * Absolute, like the paths `configure` stores, so a relative profile does not
 * diff against them on every run.
 */
export function profileTlsPaths(profile: string): { certPath: string; keyPath: string } {
  return {
    certPath: resolve(profile, "tls", "server.crt"),
    keyPath: resolve(profile, "tls", "server.key"),
  };
}

/**
 * The saved config's TLS pair classified against the profile's own
 * self-signed paths: `savedPair` when both fields exist, `savedIsProfileTls`
 * when they are exactly the profile pair, `customTls` for a user's own pair —
 * which `up` must never overwrite or recreate.
 */
export interface SavedTlsPair {
  readonly savedPair: boolean;
  readonly savedIsProfileTls: boolean;
  readonly customTls: boolean;
}

export function savedTlsPair(saved: ServerConfigFile, profile: string): SavedTlsPair {
  if (saved.tlsCert === undefined || saved.tlsKey === undefined) {
    return { savedPair: false, savedIsProfileTls: false, customTls: false };
  }
  const tls = profileTlsPaths(profile);
  const isProfile = saved.tlsCert === tls.certPath && saved.tlsKey === tls.keyPath;
  return { savedPair: true, savedIsProfileTls: isProfile, customTls: !isProfile };
}

/** The saved server config `configure` would update, or {} when absent. */
export function loadSavedUpConfig(profile: string): ServerConfigFile {
  return loadServerConfigFile({ path: defaultServerConfigPath(profile) }) ?? {};
}

/** `new URL(relay).host` for display; never the full URL, which can carry credentials. */
export function relayHostOf(relayUrl: string): string | undefined {
  try {
    return new URL(relayUrl).host || undefined;
  } catch {
    return undefined;
  }
}

function savedBindChoice(saved: ServerConfigFile): UpReachability | undefined {
  if (saved.bindMode === "tailnet") return "tailnet";
  if (saved.bindMode === "lan") return "lan";
  if (saved.bindMode === "loopback") return "local";
  return undefined;
}

/**
 * Numbered reachability picker on stderr, mirroring cliAdmin's pickers. The
 * saved choice is marked and preselected; without one the default is Tailscale
 * when it is detected. One answer only: an empty line picks the default,
 * anything unrecognized is an error, not a re-ask.
 */
export async function promptReachability(
  input: UpReachabilityPromptInput,
  io: UpReachabilityPromptIO = {
    ask: (question) => promptCli(question),
    write: (text) => void process.stderr.write(text),
  },
): Promise<UpReachability> {
  const tailnet = input.tailnetAddress
    ? ` (${terminalText(input.tailnetAddress)})`
    : " (Tailscale is not running on this machine)";
  const lan = input.lanAddress ? ` (${terminalText(input.lanAddress)})` : "";
  const relay = input.relayHost
    ? `; the relay at ${terminalText(input.relayHost)} keeps working`
    : "";
  const lines = [
    "How should your other devices reach this machine?",
    `  1. Tailscale: only devices on your tailnet${tailnet}`,
    `  2. Local network: devices on the same network${lan}, over HTTPS with ${input.customTls === true ? "your configured certificate" : "a self-signed certificate"}`,
    `  3. This machine only: no other device can connect${relay}`,
  ];
  const currentNumber =
    input.current === "tailnet"
      ? 1
      : input.current === "lan"
        ? 2
        : input.current === "local"
          ? 3
          : undefined;
  if (currentNumber !== undefined) lines[currentNumber] += " (current)";
  for (const line of lines) io.write(`${line}\n`);
  const fallback = currentNumber ?? (input.tailnetAddress !== undefined ? 1 : undefined);
  const answer = (
    await io.ask(fallback === undefined ? "Choice: " : `Choice [${fallback}]: `)
  ).trim();
  if (answer === "") {
    if (fallback === 1) return "tailnet";
    if (fallback === 2) return "lan";
    if (fallback === 3) return "local";
    throw new Error("Choose 1, 2 or 3; nothing was changed.");
  }
  if (answer === "1") return "tailnet";
  if (answer === "2") return "lan";
  if (answer === "3") return "local";
  throw new Error("Choose 1, 2 or 3; nothing was changed.");
}

/**
 * The bind-mode choice for this run: an explicit route flag wins and asks
 * nothing (`--relay-url` alone keeps the saved bind mode); without flags an
 * interactive run asks, and a non-interactive run keeps saved settings or
 * fails naming the flags when nothing is saved yet.
 */
export async function resolveUpBindChoice(input: {
  readonly flagChoice: UpReachability | undefined;
  readonly relayFlagged: boolean;
  readonly interactive: boolean;
  readonly saved: ServerConfigFile;
  readonly tailnetAddress?: string;
  readonly lanAddress?: string;
  readonly customTls?: boolean;
  readonly choose?: (prompt: UpReachabilityPromptInput) => Promise<UpReachability>;
}): Promise<UpReachability | undefined> {
  if (input.flagChoice !== undefined || input.relayFlagged) return input.flagChoice;
  if (input.interactive) {
    const current = savedBindChoice(input.saved);
    const relayHost =
      input.saved.relayUrl !== undefined ? relayHostOf(input.saved.relayUrl) : undefined;
    return (input.choose ?? ((prompt) => promptReachability(prompt)))({
      ...(current !== undefined ? { current } : {}),
      ...(input.tailnetAddress !== undefined ? { tailnetAddress: input.tailnetAddress } : {}),
      ...(input.lanAddress !== undefined ? { lanAddress: input.lanAddress } : {}),
      ...(relayHost !== undefined ? { relayHost } : {}),
      ...(input.customTls === true ? { customTls: true } : {}),
    });
  }
  if (
    input.saved.bindMode === undefined &&
    input.saved.host === undefined &&
    input.saved.relayUrl === undefined
  ) {
    throw new Error(
      "Choose how your other devices reach this machine: --tailnet (Tailscale), --lan (the local network, over HTTPS) or --local-only (this machine only); --relay-url URL adds a relay. Nothing was changed. " +
        UP_USAGE,
    );
  }
  return undefined;
}

export interface UpSettingsPatch {
  readonly bindMode?: "loopback" | "tailnet" | "lan";
  readonly tlsCert?: string;
  readonly tlsKey?: string;
  readonly relayUrl?: string;
}

/**
 * What this run would write through `configure`, decided before anything is
 * written. `write` is true when any patch key literally differs from the saved
 * config — choosing local on a fresh profile still writes `loopback`, which
 * marks the choice as made for later non-interactive runs. `restartNeeded`
 * treats a missing saved bindMode as loopback (the server default).
 *
 * TLS: a LAN choice writes the profile's self-signed paths only when the
 * saved config has no pair at all — a saved pair (the profile's own or a
 * user's custom certificate) is kept as is, so re-picking LAN never rewrites
 * someone's certificate material. `createProfileTls` is true only when this
 * run chose LAN and the profile pair is (or will be) the one in use while
 * its files do not both exist yet; a kept saved LAN never creates TLS.
 */
export function planUpSettings(input: {
  readonly saved: ServerConfigFile;
  readonly choice: UpReachability | undefined;
  readonly relayUrl: string | undefined;
  readonly profile: string;
  readonly tlsFilesExist: boolean;
}): {
  readonly patch: UpSettingsPatch;
  readonly configureArgs: readonly string[];
  readonly write: boolean;
  readonly restartNeeded: boolean;
  readonly createProfileTls: boolean;
} {
  const saved = input.saved;
  const tlsPair = savedTlsPair(saved, input.profile);
  const patch: {
    bindMode?: "loopback" | "tailnet" | "lan";
    tlsCert?: string;
    tlsKey?: string;
    relayUrl?: string;
  } = {};
  if (input.choice === "local") patch.bindMode = "loopback";
  else if (input.choice === "tailnet") patch.bindMode = "tailnet";
  else if (input.choice === "lan") {
    // A LAN listener is always encrypted here; plaintext needs an explicit
    // acknowledgement that `up` never gives on the user's behalf.
    patch.bindMode = "lan";
    if (!tlsPair.savedPair) {
      const tls = profileTlsPaths(input.profile);
      patch.tlsCert = tls.certPath;
      patch.tlsKey = tls.keyPath;
    }
  }
  if (input.relayUrl !== undefined) patch.relayUrl = input.relayUrl;

  const keys = Object.keys(patch) as (keyof UpSettingsPatch)[];
  const write = keys.some((key) => patch[key] !== saved[key]);
  const createProfileTls =
    input.choice === "lan" &&
    (!tlsPair.savedPair || tlsPair.savedIsProfileTls) &&
    !input.tlsFilesExist;
  const restartNeeded =
    (patch.bindMode !== undefined && patch.bindMode !== (saved.bindMode ?? "loopback")) ||
    keys.some((key) => key !== "bindMode" && patch[key] !== saved[key]) ||
    createProfileTls;

  const configureArgs: string[] = [];
  if (patch.bindMode !== undefined) configureArgs.push("--bind-mode", patch.bindMode);
  if (patch.tlsCert !== undefined) configureArgs.push("--tls-cert", patch.tlsCert);
  if (patch.tlsKey !== undefined) configureArgs.push("--tls-key", patch.tlsKey);
  if (patch.relayUrl !== undefined) configureArgs.push("--relay-url", patch.relayUrl);
  return { patch, configureArgs, write, restartNeeded, createProfileTls };
}

export interface UpReachabilityView {
  readonly reachability: UpReachability | "custom";
  readonly reachable: boolean;
  readonly tailnetAddress?: string;
  readonly lanAddress?: string;
  readonly relayHost?: string;
  readonly savedHost?: string;
  readonly customTls?: boolean;
}

/**
 * The effective reachability after this run: an explicit saved `host` wins
 * over every bind mode ("custom"); otherwise the final bindMode decides, with
 * an absent mode meaning local. `reachable` is false only for local without a
 * relay, tailnet without a detected address, or a custom host that itself
 * stays on this machine without a relay.
 */
export function upReachabilityView(input: {
  readonly savedHost?: string;
  readonly bindMode?: "loopback" | "tailnet" | "lan";
  readonly relayUrl?: string;
  readonly tailnetAddress?: string;
  readonly lanAddress?: string;
  readonly customTls?: boolean;
}): UpReachabilityView {
  const relayHost = input.relayUrl !== undefined ? relayHostOf(input.relayUrl) : undefined;
  const relaySet = input.relayUrl !== undefined;
  const reachability: UpReachability | "custom" =
    input.savedHost !== undefined
      ? "custom"
      : input.bindMode === "tailnet"
        ? "tailnet"
        : input.bindMode === "lan"
          ? "lan"
          : "local";
  const reachable =
    input.savedHost !== undefined
      ? classifyBindHostExposure(input.savedHost) !== "loopback" || relaySet
      : relaySet ||
        input.bindMode === "lan" ||
        (input.bindMode === "tailnet" && input.tailnetAddress !== undefined);
  return {
    reachability,
    reachable,
    ...(input.tailnetAddress !== undefined ? { tailnetAddress: input.tailnetAddress } : {}),
    ...(input.lanAddress !== undefined ? { lanAddress: input.lanAddress } : {}),
    ...(relayHost !== undefined ? { relayHost } : {}),
    ...(input.savedHost !== undefined ? { savedHost: input.savedHost } : {}),
    ...(input.customTls === true ? { customTls: true } : {}),
  };
}

/** The one-line reachability summary printed by `poracode up`. */
export function describeUpReachability(view: UpReachabilityView): string {
  const relay = view.relayHost ? ` and through the relay at ${terminalText(view.relayHost)}` : "";
  switch (view.reachability) {
    case "tailnet":
      return view.tailnetAddress
        ? `Other devices reach this machine through Tailscale at ${terminalText(view.tailnetAddress)}${relay}.`
        : `Other devices will reach this machine through Tailscale once it runs here${relay}.`;
    case "lan":
      return `Devices on your local network reach this machine${view.lanAddress ? ` at ${terminalText(view.lanAddress)}` : ""} over HTTPS${view.customTls === true ? "" : " with a self-signed certificate"}${relay}.`;
    case "custom":
      return `The server listens on your saved host ${terminalText(view.savedHost ?? "")}${relay}.`;
    case "local":
      return view.relayHost
        ? `Other devices reach this machine only through the relay at ${terminalText(view.relayHost)}.`
        : "Only this machine can connect.";
  }
}

/** Note shown when Tailscale is selected/detected but not running here. */
export function tailnetUnavailableNote(input: {
  readonly hasService: boolean;
  readonly prefix?: string;
}): string {
  return input.hasService && input.prefix !== undefined
    ? `Tailscale is not running on this machine, so the server listens only on this machine for now. Start Tailscale, then run: poracode service restart --prefix ${input.prefix}`
    : "Tailscale is not running on this machine, so the server listens only on this machine until Tailscale runs and the server restarts.";
}

/** Note shown when a bind choice was applied while a saved host overrides it. */
export function savedHostOverrideNote(host: string): string {
  return `Your saved host ${terminalText(host)} overrides this choice; remove it with: poracode configure --unset host`;
}

/** Note shown when the saved host itself keeps the server on this machine. */
export function savedHostLocalNote(host: string): string {
  return `Your saved host ${terminalText(host)} keeps the server on this machine; remove it with: poracode configure --unset host`;
}
