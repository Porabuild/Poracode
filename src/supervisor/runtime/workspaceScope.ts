import { posix, win32 } from "node:path";
import type {
  StartThreadPayload,
  ProjectLocation,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import {
  MAX_WORKSPACE_DIRECTORY_SERIALIZED_CHARS,
  MAX_WORKSPACE_DIRECTORY_ENTRIES,
  workspaceDirectoryLocationSchema,
  workspaceDirectorySelectionSchema,
  workspaceGrantRevisionSchema,
} from "@/shared/workspaceDirectorySelection";
import { parseWslUncPath, toWslUncPath } from "@/shared/wsl";
import { resolveAgentProjectLocation, type AgentAdapter } from "../agents/base";

/** INTERNAL host-approved intent. Never accept this via a public start schema.
 * A generation owns this detached snapshot; replacement requires a future host transaction.
 */
export interface ApprovedThreadWorkspaceScope {
  readonly primaryLocation: ProjectLocation;
  readonly additionalDirectories: readonly ProjectLocation[];
  readonly revision: number;
}

/** INTERNAL launch carrier. Public schemas intentionally never accept this authorization. */
export type StartThreadRuntimeInput = StartThreadPayload & {
  workspaceScope?: ApprovedThreadWorkspaceScope;
};

function snapshotLocation(value: ProjectLocation): ProjectLocation {
  const location = workspaceDirectoryLocationSchema.parse(value);
  if (JSON.stringify(location).length > MAX_WORKSPACE_DIRECTORY_SERIALIZED_CHARS)
    throw new Error("Workspace location exceeds its size bound.");
  const raw = location.kind === "wsl" ? location.linuxPath : location.path;
  const paths = location.kind === "windows" ? win32 : posix;
  if (
    Array.from(raw).some((char) => char.charCodeAt(0) < 32) ||
    !paths.isAbsolute(raw) ||
    (location.kind === "windows" &&
      (!/^(?:[A-Za-z]:[\\/]|\\\\[^\\/?.][^\\/]*[\\/][^\\/]+)/u.test(raw) || parseWslUncPath(raw)))
  )
    throw new Error("Workspace locations must be absolute execution paths.");
  const normalized = paths.normalize(raw);
  const path =
    normalized.length > paths.parse(normalized).root.length
      ? normalized.replace(location.kind === "windows" ? /[\\/]+$/u : /\/+$/u, "")
      : normalized;
  if (location.kind !== "wsl") return Object.freeze({ ...location, path });
  const unc = parseWslUncPath(location.uncPath);
  if (!unc || unc.distro !== location.distro || posix.normalize(unc.linuxPath) !== normalized)
    throw new Error("Workspace location has inconsistent WSL host mapping.");
  return Object.freeze({
    ...location,
    linuxPath: path,
    uncPath: toWslUncPath(location.distro, path),
  });
}

function locationKey(location: ProjectLocation): string {
  const path = location.kind === "wsl" ? location.linuxPath : location.path;
  return JSON.stringify([
    location.kind,
    location.remoteServerId ?? null,
    location.kind === "wsl" ? location.distro : null,
    location.kind === "windows" ? path.toLowerCase() : path,
  ]);
}

function assertSameEnvironment(primary: ProjectLocation, location: ProjectLocation): void {
  if (
    primary.kind !== location.kind ||
    primary.remoteServerId !== location.remoteServerId ||
    (primary.kind === "wsl" && location.kind === "wsl" && primary.distro !== location.distro)
  )
    throw new Error("Workspace directories must share the primary execution host and environment.");
}

export function snapshotWorkspaceScope(
  scope: ApprovedThreadWorkspaceScope,
  primary: ProjectLocation,
): ApprovedThreadWorkspaceScope {
  // Explicit malformed/null scope is never interpreted as legacy empty intent.
  if (!scope || typeof scope !== "object") throw new Error("Invalid approved workspace scope.");
  const revision = workspaceGrantRevisionSchema.parse(scope.revision);
  const primaryLocation = snapshotLocation(scope.primaryLocation);
  if (locationKey(primaryLocation) !== locationKey(snapshotLocation(primary)))
    throw new Error("Approved workspace primary does not match the launch primary.");
  if (
    !Array.isArray(scope.additionalDirectories) ||
    scope.additionalDirectories.length > MAX_WORKSPACE_DIRECTORY_ENTRIES
  )
    throw new Error("Invalid approved workspace directory list.");
  const roots = workspaceDirectorySelectionSchema.parse(scope.additionalDirectories);
  const additionalDirectories = roots.map((root) => {
    const location = snapshotLocation(root);
    assertSameEnvironment(primaryLocation, location);
    return location;
  });
  // Keep nonempty intent even if every root aliases primary. The consumer may
  // deduplicate only after admission has qualified that intent.
  return Object.freeze({
    primaryLocation,
    additionalDirectories: Object.freeze(additionalDirectories),
    revision,
  });
}

/** Snapshot before the first await, including primary and the execution pin. */
export function snapshotWorkspaceStart(input: StartThreadRuntimeInput): StartThreadRuntimeInput {
  if (input.workspaceScope === undefined) return input;
  const workspaceScope = snapshotWorkspaceScope(input.workspaceScope, input.projectLocation);
  return {
    ...input,
    projectLocation: workspaceScope.primaryLocation,
    config: snapshotWorkspaceConfig(input.config),
    workspaceScope,
  };
}

/** Copy the execution pin before resolving asynchronous host mappings. */
export function snapshotWorkspaceConfig(config: ThreadConfig): ThreadConfig {
  return {
    ...config,
    ...(config.executionEnvironment
      ? { executionEnvironment: Object.freeze({ ...config.executionEnvironment }) }
      : {}),
  };
}

export function assertWorkspaceLaunchSupported(
  scope: ApprovedThreadWorkspaceScope | undefined,
  adapter: AgentAdapter | undefined,
  presentation?: ThreadPresentationMode,
): void {
  if (!scope?.additionalDirectories.length) return;
  if (
    (presentation ?? adapter?.capabilities.presentationMode) !== "gui" ||
    adapter?.supportsStructuredWorkspaceDirectories !== true ||
    !adapter.createStructuredSession
  )
    throw new Error("Approved workspace directories require a qualified structured GUI adapter.");
}

export function assertWorkspaceScopeUnchanged(
  current: ApprovedThreadWorkspaceScope | undefined,
  requested: ApprovedThreadWorkspaceScope | undefined,
): void {
  const key = (scope: ApprovedThreadWorkspaceScope | undefined) =>
    scope === undefined
      ? undefined
      : JSON.stringify([
          scope.revision,
          locationKey(scope.primaryLocation),
          scope.additionalDirectories.map(locationKey),
        ]);
  if (key(current) !== key(requested))
    throw new Error(
      "Workspace scope conflicts with the owned runtime; replacement requires a host transaction.",
    );
}

/** Resolve the entire set with the same pin. Never strip host coordinates. */
export async function resolveWorkspaceScope(
  scope: ApprovedThreadWorkspaceScope,
  config: ThreadConfig,
): Promise<ApprovedThreadWorkspaceScope> {
  const source = snapshotWorkspaceScope(scope, scope.primaryLocation);
  const environment = config.executionEnvironment ? { ...config.executionEnvironment } : undefined;
  const locations = await Promise.all(
    [source.primaryLocation, ...source.additionalDirectories].map((location) =>
      resolveAgentProjectLocation(location, environment),
    ),
  );
  const primaryLocation = locations[0]!;
  for (const [index, location] of locations.entries()) {
    const original =
      index === 0 ? source.primaryLocation : source.additionalDirectories[index - 1]!;
    if (location.remoteServerId !== original.remoteServerId)
      throw new Error("Workspace resolution changed the execution host.");
    if (
      environment?.kind === "wsl" &&
      location.kind === "wsl" &&
      location.distro !== environment.distro
    )
      throw new Error("Workspace resolution does not match the pinned distro.");
  }
  return snapshotWorkspaceScope(
    { primaryLocation, additionalDirectories: locations.slice(1), revision: source.revision },
    primaryLocation,
  );
}

/** A live handle cannot move execution hosts in place. Restart resolves the full set. */
export function assertWorkspaceLiveConfig(
  session: { workspaceScope?: ApprovedThreadWorkspaceScope; config: ThreadConfig },
  config: ThreadConfig,
): void {
  if (
    session.workspaceScope &&
    JSON.stringify(session.config.executionEnvironment ?? null) !==
      JSON.stringify(config.executionEnvironment ?? null)
  )
    throw new Error("Approved workspace execution environment changes require a session restart.");
}
