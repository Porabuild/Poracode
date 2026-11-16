import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  hostRuntimeTarget,
  installServerRelease,
  readStandaloneRuntimeMarker,
} from "../../scripts/server-release-install.mjs";
import { writeCurrentSymlink } from "./serverNativeOverlay";
import { SERVER_SERVICE_REGISTRATION_FILE } from "./serverServiceRegistration";
import { upgradeServerPrefix } from "./serverUpgrade";
import type { UpgradeCliOptions, UpgradeResult } from "./serverUpgradeContract";
import { acquireServerUpgradeLock } from "./serverUpgradeLock";
import { compareCliReleaseVersions, isNightlyRelease } from "./cliReleaseVersion";
import { refusePendingCliInstallMigration } from "./cliInstallMigrationJournal";
import { sha256OfFile } from "./cliArtifactDigest";
import { copyVerifiedRuntime, verifiedLauncherCache } from "./cliServiceRuntimeCache";
import { downloadArtifact } from "../../packages/poracode-cli/lib/artifact.mjs";
import { resolveTar, tarCommand } from "../../scripts/server-host-tools.mjs";
import {
  defaultProbeOwner,
  type InstallerPrefix,
  RELEASE_REPOSITORY,
  removeTuiCachesForVersions,
  resolveInstallerPrefix,
  SelfUpdateError,
  VERSION_PATTERN,
} from "./installerPrefix";

/**
 * `poracode update` for installs made by the one-line installers
 * (`website/public/install.sh`, `install.ps1`): a prefix holding
 * `releases/<version>` self-contained archives with `current` pointing at the
 * active one. The update verifies the release archive against its published
 * SHA256SUMS before anything is extracted. A running owner or managed service
 * goes through the full `upgrade` path (drain, candidate admission, rollback);
 * otherwise the new release installs beside the old one and `current` moves.
 */
export interface SelfUpdateCliOptions {
  readonly version?: string;
  readonly channel?: "stable" | "nightly";
  readonly prefix?: string;
  readonly json: boolean;
}

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

/** Mirrors `standaloneArchiveName` in `scripts/standalone-runtime.mjs`. */
export function standaloneArchiveFileName(version: string, target: string): string {
  return `poracode-${version}-${target}.${target.startsWith("win32-") ? "zip" : "tar.gz"}`;
}

export function releaseDownloadBase(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PORACODE_RELEASE_BASE_URL?.trim();
  return (override || `https://github.com/${RELEASE_REPOSITORY}/releases/download`).replace(
    /\/+$/u,
    "",
  );
}

/** `SHA256SUMS` lines (`<sha256>  [*]<name>`) as a name → digest map. */
export function parseSha256Sums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split(/\r?\n/u)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(\S.*)$/u.exec(line.trim());
    if (match) sums.set(match[2]!, match[1]!.toLowerCase());
  }
  return sums;
}

async function fetchRelease(
  fetchImpl: FetchLike,
  url: string,
  init?: { headers?: Record<string, string> },
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (cause) {
    if (cause instanceof SelfUpdateError) throw cause;
    const reason =
      cause instanceof Error
        ? cause.cause instanceof Error
          ? cause.cause.message
          : cause.message
        : String(cause);
    throw new SelfUpdateError(`Could not reach ${url}: ${reason}.`);
  }
}

async function releaseJson(response: Response, url: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new SelfUpdateError(
      `GitHub returned an unexpected response for ${url}; pass an explicit version.`,
    );
  }
}

export async function resolveReleaseVersion(input: {
  readonly version?: string;
  readonly channel: "stable" | "nightly";
  readonly fetchImpl?: FetchLike;
}): Promise<string> {
  if (input.version !== undefined) {
    const version = input.version.replace(/^v/u, "");
    if (!VERSION_PATTERN.test(version))
      throw new SelfUpdateError(`Invalid version "${input.version}".`);
    return version;
  }
  const fetchImpl = input.fetchImpl ?? (fetch as FetchLike);
  const headers = { Accept: "application/json", "User-Agent": "poracode-update" };
  if (input.channel === "stable") {
    // Only plain releases are marked latest; this page is not rate-limited like the API.
    const url = `https://github.com/${RELEASE_REPOSITORY}/releases/latest`;
    const response = await fetchRelease(fetchImpl, url, { headers });
    if (!response.ok)
      throw new SelfUpdateError(`Could not find the latest release (HTTP ${response.status}).`);
    const tag = ((await releaseJson(response, url)) as { tag_name?: unknown }).tag_name;
    const match = typeof tag === "string" ? /^v(\d+\.\d+\.\d+)$/u.exec(tag) : null;
    if (!match) throw new SelfUpdateError("The latest release has no plain version tag.");
    return match[1]!;
  }
  const url = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases?per_page=100`;
  const response = await fetchRelease(fetchImpl, url, { headers });
  if (!response.ok) {
    throw new SelfUpdateError(
      `Could not list releases (HTTP ${response.status}); pass an explicit version.`,
    );
  }
  for (const release of (await releaseJson(response, url)) as readonly {
    tag_name?: unknown;
  }[]) {
    const tag = release.tag_name;
    const match = typeof tag === "string" ? /^v(\d+\.\d+\.\d+-nightly\.\d+)$/u.exec(tag) : null;
    if (match) return match[1]!;
  }
  throw new SelfUpdateError("No nightly release was found; pass an explicit version.");
}

/** Download the release archive for `target` and prove it matches SHA256SUMS. */
export async function downloadVerifiedArchive(input: {
  readonly base: string;
  readonly version: string;
  readonly target: string;
  readonly directory: string;
  readonly fetchImpl?: FetchLike;
}): Promise<string> {
  const fetchImpl = input.fetchImpl ?? (fetch as FetchLike);
  const name = standaloneArchiveFileName(input.version, input.target);
  const releaseUrl = `${input.base}/v${input.version}`;
  const sums = await fetchRelease(fetchImpl, `${releaseUrl}/SHA256SUMS`);
  if (sums.status === 404) {
    throw new SelfUpdateError(
      `Release ${input.version} publishes no SHA256SUMS; it predates the self-contained CLI.`,
    );
  }
  if (!sums.ok)
    throw new SelfUpdateError(`Could not download ${releaseUrl}/SHA256SUMS (HTTP ${sums.status}).`);
  const expected = parseSha256Sums(await sums.text()).get(name);
  if (expected === undefined) {
    throw new SelfUpdateError(
      `Release ${input.version} has no self-contained archive for ${input.target}.`,
    );
  }
  const destination = join(input.directory, name);
  try {
    await downloadArtifact({ url: `${releaseUrl}/${name}`, sha256: expected }, destination, {
      allowHttp: input.base.startsWith("http://"),
      fetchImpl: (url) => fetchRelease(fetchImpl, url),
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "PORACODE_ARTIFACT_CHECKSUM_MISMATCH"
    ) {
      throw new SelfUpdateError(`Checksum mismatch for ${name}.`);
    }
    throw error;
  }
  return destination;
}

/**
 * A registered service keeps launching the Node it was registered with (the
 * previous release's bundled Node, which stays on disk). Say so when the
 * update changed the bundled Node version.
 */
function serviceNodeNote(install: InstallerPrefix): string {
  const before = readStandaloneRuntimeMarker(install.currentDir);
  const after = readStandaloneRuntimeMarker(realpathSync(join(install.prefix, "current")));
  if (!before || !after || before.node.version === after.node.version) return "";
  return (
    ` The managed service still runs Node ${before.node.version} from the previous release; ` +
    `re-register it (poracode service uninstall --prefix ${install.prefix}, then poracode up) ` +
    `to use Node ${after.node.version}.`
  );
}

export interface SelfUpdateResult {
  readonly ok: boolean;
  readonly outcome: "current" | "installed" | "upgraded" | "failed";
  readonly version: string;
  readonly previous: string;
  readonly prefix: string;
  readonly detail: string;
}

export async function runSelfUpdate(
  options: SelfUpdateCliOptions,
  deps: {
    readonly releaseRoot: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly fetchImpl?: FetchLike;
    readonly hostTarget?: string;
    readonly probeOwner?: () => Promise<unknown>;
    readonly upgrade?: (options: UpgradeCliOptions) => Promise<UpgradeResult>;
    readonly platform?: NodeJS.Platform;
    readonly home?: string;
    readonly onlyIfNewer?: boolean;
  },
): Promise<SelfUpdateResult> {
  const install = resolveInstallerPrefix({
    ...(options.prefix !== undefined ? { explicitPrefix: options.prefix } : {}),
    releaseRoot: deps.releaseRoot,
  });
  refusePendingCliInstallMigration(install.prefix);
  const channel =
    options.channel ?? (/-nightly\./u.test(install.currentVersion) ? "nightly" : "stable");
  const version = await resolveReleaseVersion({
    ...(options.version !== undefined ? { version: options.version } : {}),
    channel,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  });
  const base = { version, previous: install.currentVersion, prefix: install.prefix };
  if (isNightlyRelease(version) !== isNightlyRelease(install.currentVersion)) {
    throw new SelfUpdateError(
      "Stable and nightly use separate profiles. Install the other channel in a separate prefix instead of switching this installation.",
    );
  }
  if (deps.onlyIfNewer) {
    const order = compareCliReleaseVersions(version, install.currentVersion);
    if (order === undefined)
      throw new SelfUpdateError(
        "Cannot safely compare the installed and requested release versions.",
      );
    if (order <= 0) {
      return {
        ...base,
        ok: true,
        outcome: "current",
        detail: `The installed Poracode ${install.currentVersion} is at least as new as ${version}.`,
      };
    }
  }
  if (version === install.currentVersion) {
    return {
      ...base,
      ok: true,
      outcome: "current",
      detail: `Poracode ${version} is already current.`,
    };
  }
  const target = deps.hostTarget ?? hostRuntimeTarget();
  // Same filesystem as releases/, so publishing the staged release is a rename.
  const work = mkdtempSync(join(install.prefix, ".update-"));
  try {
    const env = deps.env ?? process.env;
    const sourceVersion = readStandaloneRuntimeMarker(deps.releaseRoot)?.version;
    const cached =
      sourceVersion === version
        ? await verifiedLauncherCache({ env, releaseRoot: deps.releaseRoot, version, target })
        : null;
    let archive: string;
    if (cached) {
      const stagedCache = join(work, "verified-cache");
      mkdirSync(stagedCache);
      copyVerifiedRuntime(cached.root, stagedCache);
      if ((await sha256OfFile(join(stagedCache, "lib", "server.cjs"))) !== cached.entrySha256) {
        throw new SelfUpdateError(
          "The npm runtime changed while it was being copied; nothing was published.",
        );
      }
      archive = join(work, "verified-runtime.tar.gz");
      const tar = tarCommand(resolveTar(), ["-czf", archive, "-C", stagedCache, "."]);
      execFileSync(tar[0], tar[1], { stdio: "pipe" });
    } else {
      archive = await downloadVerifiedArchive({
        base: releaseDownloadBase(env),
        version,
        target,
        directory: work,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      });
    }
    const registered = existsSync(join(install.prefix, SERVER_SERVICE_REGISTRATION_FILE));
    const owner = registered ? null : await (deps.probeOwner ?? defaultProbeOwner)();
    if (registered || owner !== null) {
      const result = await (deps.upgrade ?? upgradeServerPrefix)({
        from: archive,
        prefix: install.prefix,
        json: options.json,
        ...(deps.onlyIfNewer ? { expectedCurrentDir: install.currentDir } : {}),
      });
      return {
        ...base,
        ok: result.ok,
        outcome: result.ok ? "upgraded" : "failed",
        detail:
          result.ok && registered ? `${result.detail}${serviceNodeNote(install)}` : result.detail,
      };
    }
    let pruned: string[] = [];
    const lock = acquireServerUpgradeLock({
      prefix: install.prefix,
      releaseId: `update-${version}`,
    });
    try {
      refusePendingCliInstallMigration(install.prefix);
      if (
        deps.onlyIfNewer &&
        realpathSync(join(install.prefix, "current")) !== install.currentDir
      ) {
        throw new SelfUpdateError(
          "The current release changed before the automatic update acquired its lock; retry.",
        );
      }
      const releaseDir = join(install.prefix, "releases", version);
      const staging = join(
        install.prefix,
        "releases",
        `.staging-${randomBytes(6).toString("hex")}`,
      );
      installServerRelease({
        tarball: archive,
        releaseDir: staging,
        destination: staging,
        hostTarget: target,
      });
      lock.assertHeld();
      if (existsSync(releaseDir)) {
        const aside = `${staging}.previous`;
        renameSync(releaseDir, aside);
        rmSync(aside, { recursive: true, force: true });
      }
      renameSync(staging, releaseDir);
      writeCurrentSymlink(install.prefix, releaseDir);
      // Keep the previous release for a manual rollback; older ones go.
      pruned = pruneInstallerReleases(install.prefix, [releaseDir, install.currentDir], {
        env: deps.env ?? process.env,
        platform: deps.platform ?? process.platform,
        home: deps.home ?? homedir(),
      });
    } finally {
      lock.release();
    }
    return {
      ...base,
      ok: true,
      outcome: "installed",
      detail:
        `Updated Poracode ${install.currentVersion} → ${version}; ${install.currentVersion} is kept ` +
        `in ${join(install.prefix, "releases")}` +
        (pruned.length > 0 ? ` and ${pruned.length} older release(s) were removed.` : "."),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Remove self-contained releases under `<prefix>/releases` other than `keep`.
 * Only directories carrying a valid standalone marker are touched; staging
 * directories, foreign trees and a release still in use (Windows keeps a
 * running node.exe locked) are left in place. The TUI cache entries of the
 * pruned versions go too, except versions a kept release still uses.
 */
export function pruneInstallerReleases(
  prefix: string,
  keep: readonly string[],
  deps: {
    readonly env?: NodeJS.ProcessEnv;
    readonly platform?: NodeJS.Platform;
    readonly home?: string;
  } = {},
): string[] {
  const releases = join(prefix, "releases");
  const kept = new Set(keep.map((path) => realpathSync(path)));
  const keptVersions = new Set<string>();
  for (const path of keep) {
    try {
      const version = readStandaloneRuntimeMarker(path)?.version;
      if (version !== undefined) keptVersions.add(version);
    } catch {
      // A kept release without a readable marker pins no cache version.
    }
  }
  const pruned: string[] = [];
  const prunedVersions: string[] = [];
  for (const name of readdirSync(releases).sort()) {
    const path = join(releases, name);
    try {
      if (name.startsWith(".") || !lstatSync(path).isDirectory() || kept.has(realpathSync(path))) {
        continue;
      }
      const marker = readStandaloneRuntimeMarker(path);
      if (marker === null) continue;
      rmSync(path, { recursive: true, force: true });
      pruned.push(name);
      prunedVersions.push(marker.version);
    } catch {
      // Unreadable, foreign or busy: keep it.
    }
  }
  removeTuiCachesForVersions(
    prunedVersions.filter((version) => !keptVersions.has(version)),
    {
      env: deps.env ?? process.env,
      platform: deps.platform ?? process.platform,
      home: deps.home ?? homedir(),
    },
  );
  return pruned;
}

export async function runSelfUpdateCli(
  options: SelfUpdateCliOptions,
  releaseRoot: string,
): Promise<void> {
  const result = await runSelfUpdate(options, { releaseRoot });
  process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : `${result.detail}\n`);
  if (!result.ok) process.exitCode = 1;
}
