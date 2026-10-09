import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";
import type { ProjectLocation } from "@/shared/contracts";
import { resolveWslHomeDirectory } from "../base";
import {
  devinCredentialEnvironmentConflicts,
  devinDefaultRootEnvironmentConflicts,
} from "./profileEnvironment";
import {
  devinAccountRootSegment,
  devinAccountRootsFor,
  devinAccountsBaseDir,
  devinDefaultRoots,
  devinPosixJoin,
  devinProfileConfigViewDir,
  provisionDevinAccountRoot,
  validateDevinAccountRoot,
  type DevinAccountRoots,
} from "./accountRoots";
import {
  devinProfileConfigGeneration,
  type DevinProfileAgentType,
  type DevinProfileConfig,
  type DevinProfileRuntimeTarget,
} from "./profileConfig";

/**
 * Immutable, per-profile execution context (plan §4 "One launch context and
 * every spawn lane").
 *
 * Every Devin spawn lane — install/version/auth detection, model catalog,
 * Terminal PTY, ACP session/auth/logout, one-shot utilities, worker launches
 * and session discovery — resolves one of these for its target location and
 * consumes only the context. The context is frozen after resolution and never
 * mutates `process.env` or native global config; environment redirection is
 * returned as a spawn-env overlay the caller merges into the child process.
 *
 * Root derivation, provisioning and the account-root ownership guard live in
 * `accountRoots.ts`; this module composes them into the launch context.
 * Account roots are derived deterministically from the opaque owner id — never
 * from labels or stored paths — so owner and reference profiles resolve the
 * same root without sharing a registry lookup. Credentials are never copied,
 * linked, or injected key-only: isolated roots get their own login through the
 * same redirection.
 */

export type DevinAccountBinding =
  | { kind: "default" }
  | { kind: "isolated"; ownerId: string }
  | { kind: "reference"; ownerId: string };

export interface DevinExecutionSettings {
  instanceId: string;
  label: string;
  auth: DevinAccountBinding;
  /** Raw `configPath` from the profile config (`~/` allowed); resolved per location. */
  configPath?: string | undefined;
  orgId?: string | undefined;
  runtimeTarget: DevinProfileRuntimeTarget;
  agentType?: DevinProfileAgentType | undefined;
  cloudDefaults?: DevinProfileConfig["cloudDefaults"] | undefined;
  configGeneration: string;
  /**
   * Sealed instance environment (already decrypted by the supervisor), merged
   * beneath the context's own redirection variables so an isolated root can
   * never be silently overridden by a profile env entry.
   */
  environment?: Record<string, string> | undefined;
}

export type { DevinAccountRoots };
export {
  devinAccountRootSegment,
  devinAccountsBaseDir,
  devinProfileConfigViewDir,
  devinDefaultRoots,
  provisionDevinAccountRoot,
  validateDevinAccountRoot,
} from "./accountRoots";

/**
 * The base adapter's ACTUAL default execution settings (no profile): the
 * native default roots resolved from the real host environment. One shared
 * literal so every default-account lane derives the identical generation —
 * the base-adapter context (`adapterContext.ts`) and the default volatile
 * catalog scope (`volatileCatalog.ts`) must key the same view.
 */
export const devinDefaultExecutionSettings: DevinExecutionSettings = {
  instanceId: "devin",
  label: "Devin",
  auth: { kind: "default" },
  runtimeTarget: "local",
  configGeneration: "base",
};

export interface DevinExecutionContext {
  readonly instanceId: string;
  readonly label: string;
  readonly account: DevinAccountBinding;
  readonly location: ProjectLocation;
  /** Executable path when known, else the bare command — the cache/binary identity. */
  readonly binaryIdentity: string;
  readonly configPath?: string | undefined;
  readonly orgId?: string | undefined;
  readonly runtimeTarget: DevinProfileRuntimeTarget;
  readonly agentType?: DevinProfileAgentType | undefined;
  readonly cloudDefaults?: DevinProfileConfig["cloudDefaults"] | undefined;
  readonly configGeneration: string;
  readonly roots: DevinAccountRoots;
  /**
   * True when the active config view is a Poracode-managed directory that must
   * be seeded (org selection) before launch. Explicit `--config` files are the
   * user's own and are never rewritten.
   */
  readonly requiresConfigSeed: boolean;
  /**
   * Config root a seeded view snapshots from: the native default root for
   * shared-login profiles, the owner's account root for references. Shell
   * expansion templates are allowed for WSL default roots. `undefined` when
   * no view applies.
   */
  readonly configViewSource?: string | undefined;
  /** Spawn-env overlay for this context; `undefined` when no redirection applies. */
  readonly env?: Record<string, string> | undefined;
  /** Global flags that must precede the CLI subcommand (`--config <path>`). */
  readonly prefixArgs: readonly string[];
  /**
   * Composite cache identity: location, account, config generation, org,
   * runtime target, environment digest (raw values never enter keys — they can
   * carry secrets), and binary identity.
   */
  readonly generation: string;
}

export type DevinContextUnavailable = {
  ok: false;
  code:
    | "unsupported-account-root"
    | "provision-failed"
    | "windows-org-config-unsupported"
    | "invalid-config-path"
    | "reserved-env-conflict"
    | "org-config-conflict";
  message: string;
};

export type DevinContextResolution =
  | { ok: true; context: DevinExecutionContext }
  | DevinContextUnavailable;

async function resolveTildePath(rawPath: string, location: ProjectLocation): Promise<string> {
  const trimmed = rawPath.trim();
  if (trimmed !== "~" && !trimmed.startsWith("~/")) return trimmed;
  const suffix = trimmed === "~" ? "" : trimmed.slice(2);
  if (location.kind === "wsl") {
    // Linux path inside the distro: POSIX-joined even when the host is
    // Windows (whose platform join would backslash it).
    const home = await resolveWslHomeDirectory(location.distro);
    return home ? devinPosixJoin(home, suffix) : trimmed;
  }
  return join(homedir(), suffix);
}

/**
 * Resolve the immutable execution context for one profile in one environment.
 * Launch lanes pass `provision: true` so a missing isolated root is created;
 * probes omit it so detection never writes account roots as a side effect.
 *
 * The account-root ownership guard runs on EVERY resolution of an isolated or
 * reference account — provisioning or not. A root whose manifest is corrupt,
 * was written by a future Poracode format, or names a different owner is
 * rejected before this context can reach any spawn lane that would touch it.
 */
export async function resolveDevinExecutionContext(
  settings: DevinExecutionSettings,
  location: ProjectLocation,
  options?: {
    executablePath?: string | undefined;
    provision?: boolean | undefined;
    signal?: AbortSignal | undefined;
  },
): Promise<DevinContextResolution> {
  options?.signal?.throwIfAborted();
  const linuxHome =
    location.kind === "wsl" ? await resolveWslHomeDirectory(location.distro) : undefined;

  let resolvedConfigPath: string | undefined;
  if (settings.configPath !== undefined) {
    if (!settings.configPath.trim()) {
      return {
        ok: false,
        code: "invalid-config-path",
        message: "Devin profile configPath is empty.",
      };
    }
    resolvedConfigPath = await resolveTildePath(settings.configPath, location);
    if (!isAbsolute(resolvedConfigPath)) {
      return {
        ok: false,
        code: "invalid-config-path",
        message: `Devin profile configPath must be absolute after ~ expansion: ${settings.configPath}`,
      };
    }
  }

  if (devinCredentialEnvironmentConflicts(settings.environment, location).length > 0) {
    return {
      ok: false,
      code: "reserved-env-conflict",
      message:
        "The profile credential override conflicts with its declared login source. Use the native login or an isolated account login.",
    };
  }
  const env: Record<string, string> = { ...(settings.environment ?? {}) };
  let roots: DevinAccountRoots;
  let requiresConfigSeed = false;
  let configViewSource: string | undefined;

  if (settings.auth.kind === "default") {
    // One auth source per profile: the native default login resolves its
    // roots from the execution environment itself. A profile env entry that
    // sets the account-root variables would redirect the child's login (or
    // config root) while this context keeps reporting the default roots —
    // auth status and session discovery would disagree with the spawned CLI.
    // Such a profile must be an isolated owner instead; refuse rather than
    // silently normalize the user's explicit environment.
    const conflicts = devinDefaultRootEnvironmentConflicts(settings.environment, location);
    if (conflicts.length > 0) {
      return {
        ok: false,
        code: "reserved-env-conflict",
        message: `The native-default Devin profile sets the account-root variable(s) ${conflicts.join(", ")} in its environment, which would redirect the login away from the default credentials this profile declares. Remove ${conflicts.join(", ")} from the profile environment, or switch the profile to an isolated account owner.`,
      };
    }
    roots = devinDefaultRoots(location);
  } else {
    // Verified 3000.11.3: an empty key uses the scoped native credential file
    // (a missing scoped file reports logged out). Clear inherited host keys.
    env.WINDSURF_API_KEY = "";
    roots = devinAccountRootsFor(location, settings.auth.ownerId, linuxHome);
    if (options?.provision) {
      // Provisioning validates the manifest before any touch (guard failures
      // reject with `unsupported-account-root`).
      const provisioned = await provisionDevinAccountRoot(roots, settings.auth.ownerId, location);
      if (!provisioned.ok) {
        return { ok: false, code: provisioned.code, message: provisioned.message };
      }
    } else {
      // Fail closed on a root Poracode does not own in its current form —
      // even when this lane will not provision, the context is about to hand
      // the account view to spawn lanes that write credentials and config
      // there.
      try {
        await validateDevinAccountRoot(roots, settings.auth.ownerId, location);
      } catch (error) {
        return {
          ok: false,
          code: "unsupported-account-root",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
    if (location.kind === "windows") {
      env.APPDATA = roots.configRoot;
    } else {
      env.XDG_CONFIG_HOME = roots.configRoot;
      env.XDG_DATA_HOME = roots.dataRoot;
    }
  }

  // Note: redirection assignments above deliberately overwrite the same keys
  // from `settings.environment`, so an isolated account can never be silently
  // pointed back at the default roots by a profile env entry.

  if (settings.orgId !== undefined) {
    if (resolvedConfigPath !== undefined) {
      // An explicit `--config` file replaces the profile's config view for
      // the session, so an org seeded into the view would be ignored. The
      // user's own file is never rewritten: refuse instead of selecting
      // nothing (plan §4 — no silently ignored selections).
      return {
        ok: false,
        code: "org-config-conflict",
        message: `The Devin profile selects both an organization (${settings.orgId}) and an explicit config file (${settings.configPath}). The config file owns org selection — set "devin.org_id" inside it, or clear one of the two fields.`,
      };
    }
    if (location.kind === "windows" && settings.auth.kind !== "isolated") {
      // APPDATA couples both native roots on Windows; a config-only overlay
      // with a shared login is an unresolved design gate there (plan §4). An
      // isolated account owns both sides of its own root, so org selection
      // stays supported for it.
      return {
        ok: false,
        code: "windows-org-config-unsupported",
        message:
          "Selecting a Devin organization for a shared-login profile is not yet supported on native Windows. Use an isolated account profile or select the org natively.",
      };
    }
    if (settings.auth.kind === "isolated") {
      // The isolated config root is Poracode-managed, so org selection is
      // seeded there directly (unlike the shared default roots).
      requiresConfigSeed = true;
    } else {
      // Default-login and owner-reference profiles select the org in their
      // OWN private config view: two references of one owner can target
      // different orgs, and neither ever rewrites the shared owner config
      // root or the user's native default config. The view snapshots the
      // account's own config root — the native default for shared-login
      // profiles, the owner's root for references — so the owner's stored
      // settings and resources are inherited, not the host default's.
      const configRoot = devinProfileConfigViewDir(settings, location, linuxHome);
      configViewSource = roots.configRoot;
      env.XDG_CONFIG_HOME = configRoot;
      roots = {
        ...roots,
        configRoot,
        // The view dir is a Linux path for WSL locations (POSIX-joined); on
        // native Windows it is an APPDATA path (platform-joined).
        nativeConfigPath:
          location.kind === "wsl"
            ? devinPosixJoin(configRoot, "devin", "config.json")
            : join(configRoot, "devin", "config.json"),
      };
      requiresConfigSeed = true;
    }
  }

  const prefixArgs = resolvedConfigPath ? ["--config", resolvedConfigPath] : [];
  const binaryIdentity = options?.executablePath ?? "devin";
  const accountIdentity =
    settings.auth.kind === "default" ? "default" : `owner:${settings.auth.ownerId}`;
  // Hash keys AND values: a proxy/routing change must invalidate the catalog.
  // Only the digest enters the identity; raw environment values never escape.
  const envIdentity = settings.environment
    ? createHash("sha256")
        .update(
          JSON.stringify(
            Object.entries(settings.environment).sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          ),
        )
        .digest("hex")
    : "-";
  const generation = [
    location.kind === "wsl" ? `wsl:${location.distro}` : location.kind,
    accountIdentity,
    settings.configGeneration,
    settings.orgId ?? "-",
    settings.runtimeTarget,
    envIdentity,
    binaryIdentity,
  ].join("|");

  const context: DevinExecutionContext = {
    instanceId: settings.instanceId,
    label: settings.label,
    account: settings.auth,
    location,
    binaryIdentity,
    ...(resolvedConfigPath !== undefined ? { configPath: resolvedConfigPath } : {}),
    ...(settings.orgId !== undefined ? { orgId: settings.orgId } : {}),
    runtimeTarget: settings.runtimeTarget,
    ...(settings.agentType !== undefined ? { agentType: settings.agentType } : {}),
    ...(settings.cloudDefaults !== undefined
      ? { cloudDefaults: structuredClone(settings.cloudDefaults) }
      : {}),
    configGeneration: settings.configGeneration,
    roots,
    requiresConfigSeed,
    ...(configViewSource !== undefined ? { configViewSource } : {}),
    ...(Object.keys(env).length > 0 ? { env } : {}),
    prefixArgs,
    generation,
  };
  return { ok: true, context: Object.freeze(context) };
}

/**
 * Absolute global config root a PROFILE's resources (skills, personas) are
 * discovered under on THIS host — the same root the context's spawn env
 * redirects `XDG_CONFIG_HOME`/`APPDATA` to, so the picker and the session
 * agree (plan G18/G16). The shared skills scanner reads the supervisor's
 * global env, which cannot see a profile's spawn env; profile adapters
 * therefore carry the resolved base on their root specs instead. Native
 * Windows host paths use APPDATA, POSIX uses the XDG data base, matching
 * `devinAccountsBaseDir`/`devinProfileConfigViewDir`. `undefined` keeps the
 * base adapter's HOME/env resolution.
 */
export function devinProfileSkillConfigBase(settings: DevinExecutionSettings): string | undefined {
  const windows = process.platform === "win32";
  const hostLocation: ProjectLocation = windows
    ? { kind: "windows", path: "C:\\" }
    : { kind: "posix", path: "/" };
  if (settings.auth.kind !== "isolated" && settings.auth.kind !== "reference") {
    // Shared login: only an org view redirects resources.
    return settings.orgId !== undefined
      ? devinProfileConfigViewDir(settings, hostLocation)
      : undefined;
  }
  if (settings.orgId !== undefined && settings.auth.kind === "reference") {
    return devinProfileConfigViewDir(settings, hostLocation);
  }
  const root = join(
    devinAccountsBaseDir(hostLocation),
    devinAccountRootSegment(settings.auth.ownerId),
  );
  return windows ? root : join(root, "config");
}

/** Derive `DevinExecutionSettings` from a parsed profile config. */
export function devinExecutionSettingsFromConfig(
  instanceId: string,
  label: string,
  config: DevinProfileConfig,
  environment?: Record<string, string> | undefined,
): DevinExecutionSettings {
  const auth: DevinAccountBinding =
    config.auth.kind === "native-default"
      ? { kind: "default" }
      : config.auth.kind === "isolated-owner"
        ? { kind: "isolated", ownerId: instanceId }
        : { kind: "reference", ownerId: config.auth.ownerId };
  return {
    instanceId,
    label,
    auth,
    ...(config.configPath !== undefined ? { configPath: config.configPath } : {}),
    ...(config.orgId !== undefined ? { orgId: config.orgId } : {}),
    runtimeTarget: config.runtimeTarget ?? "local",
    ...(config.agentType !== undefined ? { agentType: config.agentType } : {}),
    ...(config.cloudDefaults !== undefined
      ? { cloudDefaults: structuredClone(config.cloudDefaults) }
      : {}),
    configGeneration: devinProfileConfigGeneration(config),
    ...(environment ? { environment } : {}),
  };
}
