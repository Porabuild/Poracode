import { constants } from "node:fs";
import { open, realpath, stat, type FileHandle } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getProjectFsPath, wslLinuxToHostFsPath } from "@/shared/wsl";
import { fileMediaType } from "@/shared/fileMedia";
import type { MediaFileRequest, MediaTicketResult } from "@/shared/remote/media";
import { RemoteHttpError, type AuthenticatedRemoteSession, type RemoteAuthStore } from "../auth";
import { authorizeProjectProcedurePayload } from "./projectProcedureAuthorization";
import { parseByteRange, pipeOwnedFileResponse } from "../fileResponseStream";
import type { RemoteServerContext } from "./context";
import { PlaybackGrants } from "./playbackGrants";

interface FileMediaGrant {
  readonly request: MediaFileRequest;
  readonly hostPath: string;
  readonly projectOwner: string | null;
  readonly projectRoot: string | null;
  readonly dev: number;
  readonly ino: number;
  readonly sizeBytes: number;
  readonly modifiedAtMs: number;
  readonly contentType: string;
}

const stores = new WeakMap<RemoteAuthStore, PlaybackGrants<FileMediaGrant>>();
export function fileMediaGrants(auth: RemoteAuthStore): PlaybackGrants<FileMediaGrant> {
  let store = stores.get(auth);
  if (!store) {
    store = new PlaybackGrants();
    stores.set(auth, store);
  }
  return store;
}

/** Pure registry/scope check, also repeated after filesystem awaits without a WSL read. */
function authorizeMediaLocation(request: MediaFileRequest, canManage: boolean) {
  const payload = { projectLocation: { ...request.projectLocation } };
  if (request.access === "external" && !canManage)
    throw new RemoteHttpError(
      "missing_scope",
      "External media requires project management access.",
      403,
    );
  const owners =
    request.access === "project"
      ? authorizeProjectProcedurePayload("readProjectFile", payload, () => canManage)
      : undefined;
  const location = payload.projectLocation;
  if (location.remoteServerId)
    throw new RemoteHttpError("invalid_media_owner", "Media must be read by its owning host.", 403);
  return { location, projectOwner: owners?.projectLocation ?? null };
}

/** One full resolution/WSL containment gate per request. Retain the original path/root
 * coordinates so the post-open check detects symlink/root changes, not just the old target.
 * Never retry an external lane after denial.
 */
async function resolveMediaPath(
  request: MediaFileRequest,
  canManage: boolean,
  ctx: RemoteServerContext,
) {
  const { location, projectOwner } = authorizeMediaLocation(request, canManage);
  if (request.path.includes("\0"))
    throw new RemoteHttpError("invalid_path", "Invalid media path.", 400);
  let requestFsPath: string;
  let rootFsPath: string | null = null;
  let projectRoot: string | null = null;
  if (request.access === "external") {
    if (location.kind === "wsl" && request.path.startsWith("/")) {
      requestFsPath = wslLinuxToHostFsPath(location.distro, request.path);
    } else {
      if (!isAbsolute(request.path))
        throw new RemoteHttpError("invalid_path", "An absolute media path is required.", 400);
      requestFsPath = request.path;
    }
  } else {
    const path = request.path.replace(/\\/gu, "/");
    if (path.startsWith("/") || /^[A-Za-z]:/u.test(path) || path.split("/").includes(".."))
      throw new RemoteHttpError(
        "invalid_path",
        "A contained project-relative media path is required.",
        400,
      );
    // UNC resolution alone is not an in-distro admission gate. Once admitted, the
    // minted descriptor identity pins which file can be opened; post-open host path,
    // root containment, registry and authority checks fence any asynchronous changes.
    if (location.kind === "wsl")
      await ctx.options.callSupervisor("readProjectFile", { projectLocation: location, path });
    rootFsPath = getProjectFsPath(location);
    projectRoot = await realpath(rootFsPath);
    requestFsPath = resolve(projectRoot, path);
  }
  const hostPath = await realpath(requestFsPath);
  assertMediaContained(projectRoot, hostPath);
  return { hostPath, projectOwner, projectRoot, rootFsPath, requestFsPath };
}

function assertMediaContained(root: string | null, path: string) {
  if (root === null) return;
  const tail = relative(root, path);
  if (isAbsolute(tail) || tail.split(/[\\/]/u)[0] === "..")
    throw new RemoteHttpError(
      "media_path_not_contained",
      "The media path escapes the project root.",
      403,
    );
}

function assertMediaOwner(expected: string | null, current: string | null) {
  if (current !== expected)
    throw new RemoteHttpError(
      "media_owner_changed",
      "The registered media owner changed; reopen its preview.",
      403,
    );
}

export async function issueFileMediaTicket(
  ctx: RemoteServerContext,
  session: AuthenticatedRemoteSession,
  request: MediaFileRequest,
): Promise<MediaTicketResult> {
  const { auth } = ctx;
  const media = fileMediaType(request.path);
  if (!media)
    throw new RemoteHttpError(
      "unsupported_media_type",
      "Only editor media files can be served.",
      415,
    );
  const { hostPath, projectOwner, projectRoot } = await resolveMediaPath(
    request,
    session.scopes.includes("projects:manage"),
    ctx,
  );
  const info = await stat(hostPath);
  if (!info.isFile())
    throw new RemoteHttpError("media_not_found", "The media path is not a file.", 404);
  const value: FileMediaGrant = {
    request,
    hostPath,
    projectOwner,
    projectRoot,
    dev: info.dev,
    ino: info.ino,
    sizeBytes: info.size,
    modifiedAtMs: info.mtimeMs,
    contentType: media.mime,
  };
  const currentSession = auth.authenticateSession(
    session.sessionId,
    request.access === "external" ? ["projects:manage"] : ["session:read"],
  );
  assertMediaOwner(
    projectOwner,
    authorizeMediaLocation(request, currentSession.scopes.includes("projects:manage")).projectOwner,
  );
  return {
    ...fileMediaGrants(auth).issue(value, currentSession.sessionId, currentSession.expiresAtMs),
    sizeBytes: info.size,
    modifiedAtMs: info.mtimeMs,
    contentType: media.mime,
  };
}

async function openValidatedMedia(ctx: RemoteServerContext, ticket: string) {
  const { auth } = ctx;
  const grant = fileMediaGrants(auth).read(ticket);
  const value = grant.value;
  const session = auth.authenticateSession(
    grant.sessionId,
    value.request.access === "external" ? ["projects:manage"] : ["session:read"],
  );
  // Session revocation retires the grant. Registry removal/root changes and symlink changes
  // are independently rechecked before opening any bytes, even for an unexpired grant.
  const resolved = await resolveMediaPath(
    value.request,
    session.scopes.includes("projects:manage"),
    ctx,
  );
  const { hostPath } = resolved;
  assertMediaOwner(value.projectOwner, resolved.projectOwner);
  if (resolved.projectRoot !== value.projectRoot || hostPath !== value.hostPath)
    throw new RemoteHttpError(
      "media_file_changed",
      "The media file changed; reopen its preview.",
      409,
    );
  let file: FileHandle | undefined;
  try {
    file = await open(hostPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const [checkedPath, checkedRoot] = await Promise.all([
      realpath(resolved.requestFsPath),
      resolved.rootFsPath === null ? Promise.resolve(null) : realpath(resolved.rootFsPath),
    ]);
    assertMediaContained(checkedRoot, checkedPath);
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.dev !== value.dev ||
      info.ino !== value.ino ||
      info.size !== value.sizeBytes ||
      info.mtimeMs !== value.modifiedAtMs ||
      checkedPath !== hostPath ||
      checkedRoot !== value.projectRoot
    ) {
      throw new RemoteHttpError(
        "media_file_changed",
        "The media file changed; reopen its preview.",
        409,
      );
    }
    const currentSession = auth.authenticateSession(
      grant.sessionId,
      value.request.access === "external" ? ["projects:manage"] : ["session:read"],
    );
    // Filesystem/WSL operations can take arbitrarily long. Recheck current registry
    // identity and scopes after the final await, without repeating the supervisor read.
    const currentOwner = authorizeMediaLocation(
      value.request,
      currentSession.scopes.includes("projects:manage"),
    ).projectOwner;
    assertMediaOwner(value.projectOwner, currentOwner);
    if (grant.signal.aborted)
      throw new RemoteHttpError("invalid_media_ticket", "The media preview has expired.", 401);
    return { file, info, grant };
  } catch (error) {
    await file?.close();
    throw error;
  }
}

/** Authenticated in-place renewal; the issuing session and every file boundary stay unchanged. */
export async function renewFileMediaTicket(
  ctx: RemoteServerContext,
  session: AuthenticatedRemoteSession,
  ticket: string,
) {
  const store = fileMediaGrants(ctx.auth);
  if (store.read(ticket).sessionId !== session.sessionId)
    throw new RemoteHttpError("invalid_media_ticket", "The media preview has expired.", 401);
  const validated = await openValidatedMedia(ctx, ticket);
  try {
    const current = ctx.auth.authenticateSession(
      session.sessionId,
      validated.grant.value.request.access === "external" ? ["projects:manage"] : ["session:read"],
    );
    return store.renew(ticket, current.sessionId, current.expiresAtMs);
  } finally {
    await validated.file.close();
  }
}

export async function writeFileMedia(
  ctx: RemoteServerContext,
  req: IncomingMessage,
  res: ServerResponse,
  ticket: string,
): Promise<void> {
  const validated = await openValidatedMedia(ctx, ticket);
  let file: FileHandle | undefined = validated.file;
  const { info, grant } = validated;
  const value = grant.value;
  try {
    const range = parseByteRange(req.headers.range, info.size);
    const headers = {
      "content-type": value.contentType,
      "cache-control": "private, no-store",
      "accept-ranges": "bytes",
      "x-poracode-media-expires-at": new Date(
        fileMediaGrants(ctx.auth).read(ticket).expiresAtMs,
      ).toISOString(),
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "referrer-policy": "no-referrer",
      "content-disposition": 'inline; filename="preview"',
    };
    if (range === "unsatisfiable") {
      res.writeHead(416, {
        ...headers,
        "content-length": "0",
        "content-range": `bytes */${info.size}`,
      });
      res.end();
      return;
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? info.size - 1;
    res.writeHead(range ? 206 : 200, {
      ...headers,
      "content-length": String(info.size === 0 ? 0 : end - start + 1),
      ...(range ? { "content-range": `bytes ${start}-${end}/${info.size}` } : {}),
    });
    if (info.size === 0) {
      res.end();
      return;
    }
    // This stream owns the exact descriptor that passed the identity check.
    const stream = file.createReadStream({ start, end, autoClose: true });
    file = undefined;
    await pipeOwnedFileResponse(stream, res, undefined, grant.signal);
  } finally {
    await file?.close();
  }
}
