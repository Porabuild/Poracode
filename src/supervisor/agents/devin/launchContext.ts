import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  link,
  writeFile,
  chmod,
  lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import JSON5 from "json5";
import type { ProjectLocation, ResolvedMcpServer, ThreadConfig } from "@/shared/contracts";
import { quotePosixShellArg, readAgentCommandOutput } from "../base";
import { devinDefaultRoots, devinPosixJoin } from "./accountRoots";
import { devinDefaultConfigRoot } from "./credentials";
import type { DevinExecutionContext } from "./profileContext";
import { resolveDevinModel } from "./models";
import type { DevinModelFamily } from "./models";
import { mergeDevinMcpConfig } from "./mcpConfig";
import type { ModelSelection, SelectionBindingOwner } from "@/shared/selectionBinding.schemas";
import { devinColdSelectionView } from "./terminalSelectionPolicy";

/**
 * Launch-time preparation shared by every Devin spawn lane, plus the model
 * catalog fallback policy (plan G17 / Q35).
 *
 * The catalog is best-effort enrichment: when the stored selection is fully
 * concrete without any control — a raw id or alias with no controls, or no
 * model at all (native-default callers omit `--model`) — a cold or failing
 * catalog must never abort the launch. Any OTHER stored control needs the
 * catalog to map onto a concrete variant id: on regular families,
 * `fast: false` / `thinking: false` are REAL pins that land on the plain
 * sibling, a nonempty `contextSize` (including `"default"`) replaces the
 * variant's own, and a nonempty `effort` selects a tier — so without the
 * catalog such a selection cannot be honored and fails with a typed, visible
 * `DevinCatalogUnavailableError` instead of silently launching a different
 * variant (the ACP lane keeps negotiating after session open).
 *
 * Warm composite resolution uses positive catalog evidence. When cold,
 * matching deliberate family-member evidence can prove only its recorded
 * Terminal inert values; unrecorded controls remain subject to the ordinary
 * predicate. Restored unstamped picks still fail typed. No UID text is parsed.
 */

export class DevinCatalogUnavailableError extends Error {
  readonly lane: "launch" | "oneshot";

  constructor(lane: "launch" | "oneshot", model: string) {
    super(
      `The Devin model catalog is unavailable, so the explicit model controls for "${model}" cannot be resolved to a concrete model variant. Refresh detection (or retry once the CLI is reachable); launching would silently switch model or effort.`,
    );
    this.name = "DevinCatalogUnavailableError";
    this.lane = lane;
  }
}

/**
 * A profile's own stored policy/config could not be honored: an unreadable or
 * unparseable native config, MCP catalog or credential-adjacent policy file.
 * Callers must surface this as a visible profile failure — it is NEVER
 * ordinary best-effort enrichment, because proceeding would run the session
 * with the account's policy quietly stripped or replaced.
 */
export class DevinProfilePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevinProfilePolicyError";
  }
}

/**
 * Absence policy for every native/project config read on this lane: ONLY
 * ENOENT means the file is absent. An unreadable (EACCES, EISDIR, …) config
 * throws — treating it as absent would seed an empty derived view and launch
 * with the user's effective policy stripped.
 */
async function readConfigOrAbsent(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw new DevinProfilePolicyError(
      `The Devin config file ${path} exists but could not be read (${error.code ?? "unknown error"}); refusing to launch with a derived view that would silently replace it.`,
    );
  });
}

/**
 * Conservative catalog-dependency predicate, shared by the warm spawn
 * decision AND the cold-catalog outage gate: true when the config carries
 * ANY present control that needs a loaded catalog to map onto a concrete
 * model id. `false` fast/thinking, nonempty effort (including `"default"`),
 * and nonempty context (including `"default"`) all count: on regular
 * families they are real pins, so without the catalog they are
 * unresolvable. Empty strings inherit the selected variant warm and need
 * nothing.
 */
export function devinConfigNeedsVariantMapping(
  config: Pick<ThreadConfig, "model" | "effort" | "fast" | "thinking" | "contextSize">,
): boolean {
  if (!config.model) return false;
  return Boolean(
    config.effort ||
    config.fast !== undefined ||
    config.thinking !== undefined ||
    config.contextSize,
  );
}

/** Warm inventories resolve the original tuple; only cold resolution uses evidence. */
function resolveDevinSelectionModel(
  families: readonly DevinModelFamily[] | undefined,
  selection: ModelSelection,
  owner: SelectionBindingOwner,
  lane: "launch" | "oneshot",
): string {
  if (families?.length) return resolveDevinModel(selection, [...families]);
  if (devinConfigNeedsVariantMapping(devinColdSelectionView(selection, owner)))
    throw new DevinCatalogUnavailableError(lane, selection.model);
  return selection.model;
}

export function resolveDevinLaunchModel(
  families: readonly DevinModelFamily[] | undefined,
  config: ThreadConfig,
  owner: SelectionBindingOwner,
): string | undefined {
  if (!config.model) return undefined;
  return resolveDevinSelectionModel(families, config, owner, "launch");
}

/** Same complete selection and cold policy for CLI print utilities. */
export function resolveDevinOneShotModel(
  families: readonly DevinModelFamily[] | undefined,
  selection: ModelSelection,
  owner: SelectionBindingOwner,
): string {
  return resolveDevinSelectionModel(families, selection, owner, "oneshot");
}

/**
 * Compose the seeded user-config content for a profile's config view: the
 * native default config with unknown keys preserved and `devin.org_id` set.
 * The original default config is never written; comments (JSONC) survive in
 * the original but not in the derived copy.
 *
 * Fail closed: a default config that exists but does not parse throws instead
 * of silently seeding a minimal `{}` view — a launch must not run with the
 * user's effective policy quietly stripped out.
 */
export function buildDevinProfileSeedConfig(
  existingDefault: string | undefined,
  orgId: string,
): string {
  const config = parseDevinSeedPolicy(existingDefault);
  const devin = {
    ...(typeof config.devin === "object" && config.devin !== null && !Array.isArray(config.devin)
      ? (config.devin as Record<string, unknown>)
      : {}),
    org_id: orgId,
  };
  return JSON.stringify(
    {
      ...config,
      version: typeof config.version === "number" ? config.version : 1,
      devin,
    },
    null,
    2,
  );
}

function parseDevinSeedPolicy(content: string | undefined): Record<string, unknown> {
  if (content === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON5.parse(content);
  } catch {
    // Parser errors can quote credential-adjacent source lines. Keep the
    // failure visible without including the config contents in diagnostics.
    throw new DevinProfilePolicyError("The Devin user config is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DevinProfilePolicyError("The Devin user config is not a JSON object.");
  }
  const config = parsed as Record<string, unknown>;
  if (
    Object.hasOwn(config, "devin") &&
    (!config.devin || typeof config.devin !== "object" || Array.isArray(config.devin))
  ) {
    throw new DevinProfilePolicyError("The Devin user config has an invalid devin policy object.");
  }
  if (
    Object.hasOwn(config, "version") &&
    (typeof config.version !== "number" || !Number.isFinite(config.version))
  ) {
    throw new DevinProfilePolicyError("The Devin user config has an invalid version field.");
  }
  return config;
}

function seededOrgId(existing: string | undefined, orgId: string): boolean {
  if (existing === undefined) return false;
  const config = parseDevinSeedPolicy(existing);
  return (config.devin as { org_id?: unknown } | undefined)?.org_id === orgId;
}

async function seedHostConfigView(context: DevinExecutionContext): Promise<void> {
  const target = join(context.roots.configRoot, "devin", "config.json");
  const existing = await readConfigOrAbsent(target);
  if (seededOrgId(existing, context.orgId ?? "")) return;
  // Inherit the source only when creating the view. Org changes retain the
  // view's native policy edits and unknown keys; corrupt views fail above.
  const sourceRoot = context.configViewSource ?? devinDefaultConfigRoot();
  const source = existing ?? (await readConfigOrAbsent(join(sourceRoot, "devin", "config.json")));
  const content = buildDevinProfileSeedConfig(source, context.orgId ?? "");
  await mkdir(join(target, ".."), { recursive: true });
  const temp = `${target}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(temp, content, { mode: 0o600 });
  await rename(temp, target);
  // Resource policy: the redirected view must not hide the source root's
  // other resources (global skills, cognition roots, sibling tool config), so
  // they are linked in verbatim. The seeded config.json stays a real file.
  await mirrorViewResources(sourceRoot, context.roots.configRoot);
}

async function mirrorViewResources(sourceRoot: string, viewRoot: string): Promise<void> {
  const linkIfExists = async (from: string, to: string): Promise<void> => {
    if (
      await lstat(to).then(
        () => true,
        () => false,
      )
    )
      return;
    await symlink(from, to).catch(() => undefined);
  };
  // ENOENT-only absence here too: an unreadable source root must fail the
  // seed instead of quietly producing a resource-less view.
  const readDirOrAbsent = async (path: string): Promise<string[]> =>
    readdir(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
  for (const name of await readDirOrAbsent(sourceRoot)) {
    if (name === "devin" || name.startsWith(".poracode")) continue;
    await linkIfExists(join(sourceRoot, name), join(viewRoot, name));
  }
  for (const name of await readDirOrAbsent(join(sourceRoot, "devin"))) {
    if (name === "config.json" || name.startsWith(".poracode")) continue;
    await linkIfExists(join(sourceRoot, "devin", name), join(viewRoot, "devin", name));
  }
}

/**
 * Read a config file inside the distro, distinguishing ABSENCE (empty output,
 * exit 0) from an unreadable file (nonzero exit → typed policy failure). The
 * old `cat … 2>/dev/null || printf ""` shape made an EACCES look absent and
 * seeded an empty view over the account's real policy.
 */
async function readWslConfigOrAbsent(
  location: ProjectLocation,
  pathExpression: string,
): Promise<string | undefined> {
  const script = `f=${pathExpression}
if [ -e "$f" ]; then printf 'present\\n'; cat "$f"; else printf 'absent\\n'; fi`;
  const result = await readAgentCommandOutput(location, "sh", ["-c", script]);
  if (!result.ok) {
    throw new DevinProfilePolicyError(
      "The Devin config file could not be read inside the WSL distro; refusing to seed a config view that would silently replace it.",
    );
  }
  if (result.stdout === "absent\n") return undefined;
  if (!result.stdout.startsWith("present\n")) {
    throw new DevinProfilePolicyError("The WSL config read returned an invalid presence marker.");
  }
  return result.stdout.slice("present\n".length);
}

async function seedWslConfigView(context: DevinExecutionContext): Promise<void> {
  const target = context.roots.nativeConfigPath;
  const sourceRoot = context.configViewSource ?? "${XDG_CONFIG_HOME:-$HOME/.config}";
  // Default-account sources are the trusted shell-expansion templates
  // (devinDefaultRoots, exact-match — never a caller-invented `$` string);
  // those must expand inside the distro shell, every literal path stays quoted.
  const sourceShellPath = isTrustedDistroTemplate(sourceRoot)
    ? sourceRoot
    : quotePosixShellArg(sourceRoot);
  // Seed targets are Poracode-managed literal paths today, but the embed
  // helper keeps this correct if a template ever flows through `roots`.
  const existing = await readWslConfigOrAbsent(
    context.location,
    embedDevinDistroConfigPath(target),
  );
  if (seededOrgId(existing, context.orgId ?? "")) return;
  const source =
    existing ??
    (await readWslConfigOrAbsent(context.location, `${sourceShellPath}/devin/config.json`));
  const content = buildDevinProfileSeedConfig(source, context.orgId ?? "");
  const script = `set -eu
umask 077
view="$(dirname -- "$(dirname -- ${quotePosixShellArg(target)})")"
mkdir -p "$(dirname -- ${quotePosixShellArg(target)})"
tmp="$(dirname -- ${quotePosixShellArg(target)})/.poracode-seed-$$.tmp"
printf '%s' ${quotePosixShellArg(Buffer.from(content).toString("base64"))} | base64 -d > "$tmp"
mv -f "$tmp" ${quotePosixShellArg(target)}
src=${sourceShellPath}
for entry in "$src"/* "$src"/.[!.]*; do
  [ -e "$entry" ] || continue
  base=\${entry##*/}
  [ "$base" = devin ] && continue
  case "$base" in .poracode*) continue ;; esac
  [ -e "$view/$base" ] || ln -s "$entry" "$view/$base" || true
done
for entry in "$src"/devin/* "$src"/devin/.[!.]*; do
  [ -e "$entry" ] || continue
  base=\${entry##*/}
  [ "$base" = config.json ] && continue
  case "$base" in .poracode*) continue ;; esac
  [ -e "$view/devin/$base" ] || ln -s "$entry" "$view/devin/$base" || true
done`;
  const result = await readAgentCommandOutput(context.location, "sh", ["-c", script]);
  if (!result.ok) throw new Error("Unable to seed the Devin profile config view");
}

/**
 * Prepare a profile context for a spawn: seed the Poracode-managed config view
 * (org selection) when the context requires it. Explicit `--config` files are
 * the user's own and are never rewritten. Idempotent per launch.
 */
export async function prepareDevinProfileLaunch(context: DevinExecutionContext): Promise<void> {
  if (!context.requiresConfigSeed || context.orgId === undefined) return;
  if (context.location.kind === "wsl") {
    await seedWslConfigView(context);
    return;
  }
  await seedHostConfigView(context);
}

/**
 * Distro-side native-default paths for a WSL default account are shell
 * EXPANSION expressions (see `devinDefaultRoots`): the XDG/HOME resolution
 * that names the account's real config happens INSIDE the distro, so these
 * strings are only ever interpolated into distro shell commands — never
 * quoted as literals and never handed to the host fs.
 */
const DEVIN_WSL_DEFAULT_ROOT_EXPRESSION = devinDefaultRoots({
  kind: "wsl",
  distro: "",
  linuxPath: "",
  uncPath: "",
}).configRoot;

/**
 * The effective config path of a WSL default account: the controlled
 * native-default expression from `devinDefaultRoots`. This exact string is
 * the ONLY value the distro readers may interpolate unquoted — no user
 * input can produce it (a profile `configPath` must be absolute after `~`
 * expansion, so it can never equal a `$`-expression).
 */
const DEVIN_WSL_DEFAULT_CONFIG_EXPRESSION = devinDefaultRoots({
  kind: "wsl",
  distro: "",
  linuxPath: "",
  uncPath: "",
}).nativeConfigPath;

/**
 * True only for the exact controlled distro-side native-default templates
 * above. Everything else — user-provided paths, Poracode-managed roots, or
 * any `$`-bearing string a caller invented — is untrusted for interpolation
 * and must be quoted literally.
 */
function isTrustedDistroTemplate(value: string): boolean {
  return (
    value === DEVIN_WSL_DEFAULT_CONFIG_EXPRESSION || value === DEVIN_WSL_DEFAULT_ROOT_EXPRESSION
  );
}

/**
 * Embed an effective config path in a distro `sh` script. The trusted
 * native-default expression is interpolated raw so `${XDG_CONFIG_HOME:-…}`
 * expands INSIDE the distro (single-quoting it would search for a file
 * literally named with braces); every other path is single-quoted so
 * spaces, quotes, `$` and `$( )` stay literal — never a command.
 */
export function embedDevinDistroConfigPath(path: string): string {
  return isTrustedDistroTemplate(path) ? path : quotePosixShellArg(path);
}

/**
 * The user-config file a Terminal session will actually resolve: an explicit
 * `--config`, else the redirected config view / account root, else the native
 * default. The per-launch SessionStart hook view snapshots this file (see
 * `prepareDevinSessionRecordLaunch` in `sessionFiles.ts`). WSL contexts name
 * Linux paths — POSIX-joined; callers must not hand one to the host fs (the
 * record lane skips WSL entirely). A WSL DEFAULT account has no redirected
 * root: its native default is resolved by the DISTRO's own XDG/HOME
 * environment — the controlled shell expression, never the host default root
 * (a host path would read the wrong machine's config and silently miss the
 * account's real policy and org selection).
 */
export function effectiveDevinUserConfigPath(
  context: DevinExecutionContext | undefined,
): string | undefined {
  if (context?.configPath !== undefined) return context.configPath;
  const windowsRoot = context?.env?.APPDATA;
  if (windowsRoot !== undefined) return join(windowsRoot, "devin", "config.json");
  const posixRoot = context?.env?.XDG_CONFIG_HOME;
  if (posixRoot !== undefined) {
    return context?.location.kind === "wsl"
      ? devinPosixJoin(posixRoot, "devin", "config.json")
      : join(posixRoot, "devin", "config.json");
  }
  if (context?.location.kind === "wsl") {
    return DEVIN_WSL_DEFAULT_CONFIG_EXPRESSION;
  }
  return join(devinDefaultConfigRoot(), "devin", "config.json");
}

async function mirrorOverlayEntries(source: string, target: string, excluded: string) {
  // Mirrors `mcpConfig.ts`'s overlay mechanics for a redirected root; the
  // shared root-parameterized helper is requested from the ACP/MCP lane
  // (reported in tmp/devin/lane-p1-result.md) and should replace this copy.
  const entries = await readdir(source).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const name of entries) {
    if (name === excluded || name.startsWith(".poracode-devin-")) continue;
    const from = join(source, name),
      to = join(target, name);
    try {
      await symlink(
        from,
        to,
        process.platform === "win32" && (await stat(from)).isDirectory() ? "junction" : "file",
      );
    } catch (error) {
      if (process.platform !== "win32") throw error;
      // Hard links retain mutable credentials/state without copying a profile.
      if ((await stat(from)).isDirectory()) throw error;
      await link(from, to);
    }
  }
}

export interface DevinMcpOverlay {
  env: Record<string, string>;
  cleanup: () => Promise<void>;
}

/**
 * Private MCP disk overlay for a redirected profile (plan G6/Q23).
 *
 * `mcpConfig.ts` builds the disk catalog overlay from the supervisor's own
 * config root, so a profile whose `XDG_CONFIG_HOME`/`APPDATA` is redirected
 * would otherwise skip the overlay entirely. This overlay mirrors the
 * PROFILE's config root instead and merges the injected servers through the
 * same vendor merge, preserving the account's resources (symlinked siblings,
 * skills) and — on Windows, where APPDATA also carries credentials — the
 * credential root via links into the real files. Native `session/new`
 * injection itself is wire-proven on all transports (stdio + spec-exact
 * http/sse, real tool round trips — `fixtures/contracts/mcp-injection.json`);
 * the disk overlay is kept because Poracode's per-server `disabledTools`
 * filtering is enforced by its stdio tool-filter proxy, and a natively
 * injected server bypasses that guarantee. WSL distro-side profile overlays
 * remain pending (reported gate).
 */
export async function prepareDevinProfileMcpOverlay(
  location: ProjectLocation,
  context: DevinExecutionContext,
  servers: readonly ResolvedMcpServer[],
): Promise<DevinMcpOverlay | undefined> {
  if (location.kind === "wsl") return undefined;
  const variable = location.kind === "windows" ? "APPDATA" : "XDG_CONFIG_HOME";
  const sourceRoot = context.env?.[variable];
  if (!sourceRoot) return undefined;
  const root = await mkdtemp(
    join(
      tmpdir(),
      process.platform === "win32" ? ".poracode-devin-profile-mcp-" : "poracode-devin-profile-mcp-",
    ),
  );
  const cleanup = async () => {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  };
  try {
    await chmod(root, 0o700);
    await mirrorOverlayEntries(sourceRoot, root, "devin");
    await mkdir(join(root, "devin"));
    await mirrorOverlayEntries(join(sourceRoot, "devin"), join(root, "devin"), "mcp_config.json");
    let raw = "{}";
    try {
      raw = await readFile(join(sourceRoot, "devin", "mcp_config.json"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Absent is a normal state; the overlay seeds a catalog with only the
        // injected servers.
      } else {
        throw new DevinProfilePolicyError(
          `The Devin MCP configuration for this profile exists but could not be read (${
            (error as NodeJS.ErrnoException).code ?? "unknown error"
          }); refusing to build an overlay that would silently replace it.`,
        );
      }
    }
    let merged: string;
    try {
      merged = mergeDevinMcpConfig(raw, servers);
    } catch (error) {
      // An unparseable account MCP catalog is a policy failure, not an
      // enrichment gap: degrading would run the session without the account's
      // servers and hide the real cause behind a generic MCP error.
      throw new DevinProfilePolicyError(
        `The Devin MCP configuration for this profile could not be applied: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await writeFile(join(root, "devin", "mcp_config.json"), merged, { mode: 0o600 });
    return { env: { [variable]: root }, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
