import { homedir } from "node:os";
import { join, posix } from "node:path";
import { lstat, mkdir, readFile, writeFile, link, unlink } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import type { ProjectLocation } from "@/shared/contracts";
import { quotePosixShellArg, readAgentCommandOutput } from "../base";
import { DEVIN_ACCOUNT_ROOT_FORMAT } from "./profileConfig";

/**
 * Account-root derivation and provisioning for isolated Devin logins (plan §4).
 *
 * Account roots are Poracode-managed directories derived deterministically from
 * the opaque owner id — never from labels or stored paths — so an owner and its
 * references resolve the same root without a registry lookup. Every id is
 * sanitized AND hashed, so even a filesystem-safe id cannot impersonate another
 * id's root by sanitizing to the same segment.
 *
 * Every root carries a Poracode ownership manifest. Guarding is fail-closed and
 * happens BEFORE any filesystem touch: a root written by a future Poracode
 * format, an unparseable manifest, or a manifest naming a different owner is
 * rejected — never overwritten, never repaired in place, never provisioned
 * over. The read-only {@link validateDevinAccountRoot} enforces the same guard
 * for lanes that do not provision, so a launch cannot bypass it by resolving
 * its context first.
 */

/** Filesystem-safe root name. Hash every id so a valid literal id cannot
 * impersonate another id's sanitized result. Credentials stay in one root. */
export function devinAccountRootSegment(ownerId: string): string {
  const base = ownerId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48) || "_";
  return `${base}-${createHash("sha256").update(ownerId).digest("hex")}`;
}

/**
 * POSIX segment join for WSL Linux paths. WSL roots are built and consumed on
 * every host — including native Windows, whose default `path.join` would
 * inject backslashes into Linux paths the distro shell cannot resolve. Every
 * WSL-derived account/config-view/credential/manifest/persona path goes
 * through this helper; native Windows host paths keep the platform join.
 */
export function devinPosixJoin(...segments: readonly string[]): string {
  return posix.join(...segments);
}

/** Poracode-managed base directory holding every isolated Devin account root. */
export function devinAccountsBaseDir(location: ProjectLocation, linuxHome?: string): string {
  if (location.kind === "wsl") {
    return devinPosixJoin(linuxHome ?? ".", ".local", "share", "Poracode", "devin-accounts");
  }
  if (location.kind === "windows") {
    return join(
      process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
      "Poracode",
      "devin-accounts",
    );
  }
  return join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    "Poracode",
    "devin-accounts",
  );
}

/**
 * Per-profile config view used for org selection under a shared login: a
 * Poracode-managed `XDG_CONFIG_HOME` seeded from the native default config.
 * Deterministic per instance so repeated launches reuse the seeded copy.
 */
export function devinProfileConfigViewDir(
  settings: Pick<DevinExecutionSettingsRef, "instanceId">,
  location: ProjectLocation,
  linuxHome?: string,
): string {
  if (location.kind === "windows") {
    return join(
      process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
      "Poracode",
      "devin-profiles",
      devinAccountRootSegment(settings.instanceId),
      "config",
    );
  }
  const base =
    location.kind === "wsl"
      ? devinPosixJoin(linuxHome ?? ".", ".local", "share", "Poracode", "devin-profiles")
      : join(
          process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
          "Poracode",
          "devin-profiles",
        );
  return devinPosixJoin(base, devinAccountRootSegment(settings.instanceId), "config");
}

/** Structural reference so this leaf module does not import profileContext. */
interface DevinExecutionSettingsRef {
  instanceId: string;
}

/** Absolute paths describing one account view of the native CLI storage. */
export interface DevinAccountRoots {
  /** Directory that becomes `XDG_CONFIG_HOME` (or the APPDATA root on Windows). */
  configRoot: string;
  /** Directory that becomes `XDG_DATA_HOME` (equals `configRoot` on Windows). */
  dataRoot: string;
  credentialsPath: string;
  nativeConfigPath: string;
  manifestPath: string;
}

export function devinAccountRootsFor(
  location: ProjectLocation,
  ownerId: string,
  linuxHome?: string,
): DevinAccountRoots {
  if (location.kind === "wsl") {
    // Linux paths inside the distro: always POSIX-joined, never host-joined
    // (a Windows host would otherwise backslash them). The host fs is never
    // called with these — every read/write routes through the distro shell.
    const root = devinPosixJoin(
      devinAccountsBaseDir(location, linuxHome),
      devinAccountRootSegment(ownerId),
    );
    const configRoot = devinPosixJoin(root, "config");
    const dataRoot = devinPosixJoin(root, "data");
    return {
      configRoot,
      dataRoot,
      credentialsPath: devinPosixJoin(dataRoot, "devin", "credentials.toml"),
      nativeConfigPath: devinPosixJoin(configRoot, "devin", "config.json"),
      manifestPath: devinPosixJoin(root, "poracode-account.json"),
    };
  }
  const root = join(devinAccountsBaseDir(location, linuxHome), devinAccountRootSegment(ownerId));
  if (location.kind === "windows") {
    // APPDATA couples config, credentials and session storage for the native
    // CLI; one account-scoped root is the only verified redirection. Splitting
    // config from data on Windows remains a reported design gate (plan §4).
    const configRoot = root;
    return {
      configRoot,
      dataRoot: root,
      credentialsPath: join(root, "devin", "credentials.toml"),
      nativeConfigPath: join(root, "devin", "config.json"),
      manifestPath: join(root, "poracode-account.json"),
    };
  }
  const configRoot = join(root, "config");
  const dataRoot = join(root, "data");
  return {
    configRoot,
    dataRoot,
    credentialsPath: join(dataRoot, "devin", "credentials.toml"),
    nativeConfigPath: join(configRoot, "devin", "config.json"),
    manifestPath: join(root, "poracode-account.json"),
  };
}

/**
 * Native default roots (no redirection): where the user's own login lives.
 * For WSL the root strings are shell-expansion templates (matching the CLI's
 * own resolution) — only for interpolation into distro shell commands, never
 * host-side `fs` calls.
 */
export function devinDefaultRoots(location: ProjectLocation): DevinAccountRoots {
  if (location.kind === "windows") {
    const root = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return {
      configRoot: root,
      dataRoot: root,
      credentialsPath: join(root, "devin", "credentials.toml"),
      nativeConfigPath: join(root, "devin", "config.json"),
      // The default account is user-owned; Poracode writes no manifest there.
      manifestPath: "",
    };
  }
  const dataRoot =
    location.kind === "wsl" ? "${XDG_DATA_HOME:-$HOME/.local/share}" : devinDefaultDataRoot();
  const configRoot =
    location.kind === "wsl" ? "${XDG_CONFIG_HOME:-$HOME/.config}" : devinDefaultConfigRoot();
  return {
    configRoot,
    dataRoot,
    credentialsPath: devinPosixJoin(dataRoot, "devin", "credentials.toml"),
    nativeConfigPath: devinPosixJoin(configRoot, "devin", "config.json"),
    manifestPath: "",
  };
}

function devinDefaultDataRoot(): string {
  return process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
}

function devinDefaultConfigRoot(): string {
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

interface ManifestContent {
  format: number;
  kind: string;
  ownerId: string;
  createdAt: string;
}

/**
 * Outcome of inspecting an account root's ownership manifest. `absent` means
 * the manifest file does not exist (the root may still be unprovisioned);
 * every other state except `valid` is a hard guard failure.
 */
export type DevinManifestState =
  | { state: "absent" }
  | { state: "valid"; manifest: ManifestContent }
  | { state: "future-format"; format: unknown }
  | { state: "corrupt" }
  | { state: "wrong-owner"; ownerId: string };

function classifyManifest(raw: string | undefined, expectedOwnerId: string): DevinManifestState {
  if (raw === undefined) return { state: "absent" };
  let parsed: Partial<ManifestContent> | undefined;
  try {
    parsed = JSON.parse(raw) as Partial<ManifestContent>;
  } catch {
    return { state: "corrupt" };
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.format !== "number" ||
    parsed.kind !== "devin-account-root"
  ) {
    return { state: "corrupt" };
  }
  if (parsed.format !== DEVIN_ACCOUNT_ROOT_FORMAT) {
    return { state: "future-format", format: parsed.format };
  }
  if (typeof parsed.ownerId !== "string" || parsed.ownerId !== expectedOwnerId) {
    return { state: "wrong-owner", ownerId: String(parsed.ownerId ?? "") };
  }
  return {
    state: "valid",
    manifest: parsed as ManifestContent,
  };
}

async function readHostManifest(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    // Only ENOENT is absence. EACCES, EISDIR, or a failing filesystem is an
    // unavailable root — never silently treated as unprovisioned.
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
}

/** Distro-shell stdout marker: a managed path is a symbolic link. */
const WSL_SYMLINK_MARKER = "__PORACODE_SYMLINK__";
/** Distro-shell stdout marker: another writer claimed the manifest mid-provision. */
const WSL_CLAIMED_MARKER = "__PORACODE_CLAIMED__";

/**
 * Read a manifest through the distro shell (WSL paths never touch the host
 * fs). Absence (ENOENT) and unreadability are DISTINGUISHED: a read failure
 * (EACCES, distro error) is a typed refusal, never an empty-looking
 * "absent" that provisioning would stamp over.
 */
async function readWslManifest(
  location: ProjectLocation & { kind: "wsl" },
  roots: DevinAccountRoots,
): Promise<string | undefined> {
  const script = `set -eu
for d in ${quotePosixShellArg(roots.configRoot)} ${quotePosixShellArg(roots.dataRoot)} "$(dirname -- ${quotePosixShellArg(roots.manifestPath)})"; do
  if [ -L "$d" ]; then printf ${quotePosixShellArg(WSL_SYMLINK_MARKER)}; exit 0; fi
done
m=${quotePosixShellArg(roots.manifestPath)}
if [ -L "$m" ]; then printf ${quotePosixShellArg(WSL_SYMLINK_MARKER)}; exit 0; fi
if [ ! -e "$m" ]; then exit 0; fi
cat "$m"`;
  const result = await readAgentCommandOutput(location, "sh", ["-c", script]).catch(() => ({
    ok: false,
    stdout: "",
    stderr: "unavailable",
  }));
  if (result.stdout.includes(WSL_SYMLINK_MARKER)) {
    throw new DevinAccountRootGuardError(
      "The Devin account root or its ownership manifest is a symbolic link; refusing to touch it.",
    );
  }
  if (!result.ok) {
    throw new Error(
      `Unable to inspect the Devin account root inside ${location.distro}: ${
        result.stderr || "distro command failed"
      }`,
    );
  }
  return result.stdout.trim() ? result.stdout : undefined;
}

/**
 * Reject managed paths that are symbolic links before any touch: a link at
 * the manifest or inside the managed root could redirect the account's
 * credentials/config/storage elsewhere while every guard reads the wrong
 * target. Directories ABOVE the managed root (the user's own `~/.local`
 * layout) are not policed. Host branch only; the WSL scripts check inline.
 */
async function guardHostManagedSymlinks(roots: DevinAccountRoots): Promise<void> {
  const managed = [roots.configRoot, roots.dataRoot, roots.manifestPath];
  for (const path of managed) {
    if (!path) continue;
    const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (info?.isSymbolicLink()) {
      throw new DevinAccountRootGuardError(
        `The Devin account root path ${path} is a symbolic link; refusing to touch it.`,
      );
    }
  }
}

/**
 * Read-only ownership guard for one account root. Runs before any lane touches
 * the root — including lanes that never provision. Default roots (no manifest
 * path) are user-owned and always pass. Throws a typed message on every
 * non-valid state so callers can surface a visible failure.
 */
export async function validateDevinAccountRoot(
  roots: DevinAccountRoots,
  ownerId: string,
  location?: ProjectLocation | undefined,
): Promise<void> {
  if (!roots.manifestPath) return;
  let raw: string | undefined;
  if (location?.kind === "wsl") {
    raw = await readWslManifest(location, roots);
  } else {
    await guardHostManagedSymlinks(roots);
    raw = await readHostManifest(roots.manifestPath);
  }
  const state = classifyManifest(raw, ownerId);
  switch (state.state) {
    case "absent":
    case "valid":
      return;
    case "future-format":
      throw new DevinAccountRootGuardError(
        `Devin account root was created by a newer Poracode (format ${String(state.format)}); refusing to touch it.`,
      );
    case "corrupt":
      throw new DevinAccountRootGuardError(
        "The Devin account root's Poracode ownership manifest is unreadable or was written by something else; refusing to touch the root. Remove the directory to re-provision it deliberately.",
      );
    case "wrong-owner":
      throw new DevinAccountRootGuardError(
        `The Devin account root's ownership manifest names a different owner (${state.ownerId || "none"}); refusing to touch it.`,
      );
  }
}

/** Typed guard failure; surfaces as `DevinProfileUnavailableError` upstream. */
export class DevinAccountRootGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevinAccountRootGuardError";
  }
}

function manifestStamp(ownerId: string): string {
  return Buffer.from(
    JSON.stringify({
      format: DEVIN_ACCOUNT_ROOT_FORMAT,
      kind: "devin-account-root",
      ownerId,
      createdAt: new Date().toISOString(),
    }),
  ).toString("base64");
}

/**
 * Create both roots and stamp the manifest with a NO-CLOBBER claim. Runs only
 * after the read-only guard classified the manifest as absent; the claim is
 * still race-safe against a writer that lands between the guard and the
 * stamp: the manifest is created through `ln` (fails if the target exists),
 * never through a rename that would silently overwrite a concurrent future /
 * wrong-owner marker. On a lost claim the host re-classifies the winner
 * instead of overwriting it.
 */
function manifestCreateScript(roots: DevinAccountRoots, ownerId: string): string {
  return `set -eu
umask 077
for d in ${quotePosixShellArg(roots.configRoot)} ${quotePosixShellArg(roots.dataRoot)} "$(dirname -- ${quotePosixShellArg(roots.manifestPath)})"; do
  if [ -L "$d" ]; then printf ${quotePosixShellArg(WSL_SYMLINK_MARKER)}; exit 0; fi
done
manifest=${quotePosixShellArg(roots.manifestPath)}
if [ -e "$manifest" ]; then
  printf ${quotePosixShellArg(WSL_CLAIMED_MARKER)}
  exit 0
fi
mkdir -p -- ${quotePosixShellArg(roots.configRoot)} ${quotePosixShellArg(roots.dataRoot)}
tmp="$(dirname -- "$manifest")/.poracode-manifest-$$.tmp"
printf '%s' ${quotePosixShellArg(manifestStamp(ownerId))} | base64 -d > "$tmp"
if ln "$tmp" "$manifest" 2>/dev/null; then
  rm -f -- "$tmp"
else
  rm -f -- "$tmp"
  printf ${quotePosixShellArg(WSL_CLAIMED_MARKER)}
fi`;
}

/**
 * Host-side no-clobber manifest claim: write a temp file, then `link` it into
 * place. `link` fails with EEXIST when any file (including a concurrent
 * marker) already sits at the target, so a future-format or wrong-owner stamp
 * created between the read-only guard and this claim is re-read and
 * classified — never overwritten. A filesystem without hardlink support fails
 * closed instead of falling back to an overwriting rename.
 */
async function claimHostManifest(path: string, manifest: ManifestContent): Promise<void> {
  const temp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(temp, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  try {
    await link(temp, path);
  } finally {
    await unlink(temp).catch(() => undefined);
  }
}

/**
 * A manifest appeared (or changed owner) between the read-only guard and the
 * claim. Classify the winner read-only: a valid stamp for THIS owner is the
 * idempotent happy path; anything else is a refusal — the claim is never
 * overwritten to force this provisioning through.
 */
async function reclassifyLostClaim(
  roots: DevinAccountRoots,
  ownerId: string,
  location: ProjectLocation | undefined,
): Promise<{ ok: true } | { ok: false; code: "unsupported-account-root"; message: string }> {
  let raw: string | undefined;
  if (location?.kind === "wsl") {
    raw = await readWslManifest(location, roots);
  } else {
    raw = await readHostManifest(roots.manifestPath);
  }
  const state = classifyManifest(raw, ownerId);
  if (state.state === "valid") return { ok: true };
  throw new DevinAccountRootGuardError(
    state.state === "absent"
      ? "The Devin account root's ownership manifest vanished while provisioning; refusing to continue."
      : state.state === "future-format"
        ? `The Devin account root was claimed by a newer Poracode (format ${String(state.format)}) while provisioning; refusing to overwrite it.`
        : state.state === "wrong-owner"
          ? `The Devin account root was claimed by another owner (${state.ownerId || "unknown"}) while provisioning; refusing to overwrite it.`
          : "The Devin account root's ownership manifest became unreadable while provisioning; refusing to overwrite it.",
  );
}

/**
 * Create the account root if absent and stamp the Poracode ownership manifest.
 * Idempotent and concurrency-safe: the stamp is a no-clobber claim (host
 * `link`, in-distro `ln`) — a concurrent future/wrong-owner marker created
 * between the guard and the claim is re-read and classified, never renamed
 * over.
 *
 * Guarding always precedes touching: an existing manifest that is corrupt, was
 * written by a future Poracode format, or names a different owner is rejected
 * before any directory is created or file written — the provisioning path has
 * no repair-on-touch behavior.
 *
 * WSL roots are Linux paths inside the distro: validation and provisioning are
 * routed through the distro shell so the host filesystem never sees a `/home`
 * write. The host `fs` branch is only for posix/Windows locations.
 */
export async function provisionDevinAccountRoot(
  roots: DevinAccountRoots,
  ownerId: string,
  location?: ProjectLocation | undefined,
): Promise<
  | { ok: true }
  | { ok: false; code: "unsupported-account-root" | "provision-failed"; message: string }
> {
  try {
    await validateDevinAccountRoot(roots, ownerId, location);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The manifest guard states are not distinguished at the typed-result
    // level: any guard failure is a refusal to touch a root Poracode does not
    // own in its current form.
    return { ok: false, code: "unsupported-account-root", message };
  }
  try {
    if (location?.kind === "wsl") {
      const result = await readAgentCommandOutput(location, "sh", [
        "-c",
        manifestCreateScript(roots, ownerId),
      ]);
      if (result.stdout.includes(WSL_SYMLINK_MARKER)) {
        return {
          ok: false,
          code: "unsupported-account-root",
          message:
            "The Devin account root path is a symbolic link inside the distro; refusing to touch it.",
        };
      }
      if (result.stdout.includes(WSL_CLAIMED_MARKER)) {
        // Another writer claimed the manifest between the read-only guard and
        // the create script. Re-classify the winner instead of overwriting it.
        return await reclassifyLostClaim(roots, ownerId, location);
      }
      if (!result.ok) {
        return {
          ok: false,
          code: "provision-failed",
          message: `Unable to provision the isolated Devin account root inside ${location.distro}: ${
            result.stderr || "distro command failed"
          }`,
        };
      }
      return { ok: true };
    }
    await guardHostManagedSymlinks(roots);
    await mkdir(roots.configRoot, { recursive: true });
    if (roots.dataRoot !== roots.configRoot) {
      await mkdir(roots.dataRoot, { recursive: true });
    }
    if (roots.manifestPath) {
      try {
        await claimHostManifest(roots.manifestPath, {
          format: DEVIN_ACCOUNT_ROOT_FORMAT,
          kind: "devin-account-root",
          ownerId,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST") throw error;
        // Claimed between the guard and this claim: classify the winner.
        return await reclassifyLostClaim(roots, ownerId, location);
      }
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof DevinAccountRootGuardError) {
      return { ok: false, code: "unsupported-account-root", message: error.message };
    }
    return {
      ok: false,
      code: "provision-failed",
      message: `Unable to provision the isolated Devin account root: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
