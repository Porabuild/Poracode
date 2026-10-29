import { Buffer } from "node:buffer";
import { z } from "zod";
import { gitFileStatus, json, parseGitDiff, record } from "../helpers";
import {
  gitBranchListResultSchema,
  gitDiffResultSchema,
  gitProjectSnapshotResultSchema,
  gitStatusResultSchema,
} from "@/shared/contracts/gitResults";
import {
  listProjectTreeResultSchema,
  readProjectFileResultSchema,
} from "@/shared/contracts/projectTreeResults";
import type {
  FileListOutput,
  VcsBaseOutput,
  VcsBranchListOutput,
  VcsDiffOutput,
  VcsGetOutput,
  VcsStatusOutput,
} from "@opencode/client";
import type { RouteArgs } from "../context";

/** Filesystem find/read/list plus VCS and worktree routes. */
export async function handleFileRoutes({
  ctx,
  url,
  method,
  path,
  readBody,
}: RouteArgs): Promise<Response | undefined> {
  const { input, createdWorktrees, resolveProject, requestLocation } = ctx;

  if (path === "/api/fs/find" && method === "GET") {
    const current = await resolveProject();
    const limitValue = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(200, limitValue)) : 50;
    const result = z
      .object({
        entries: z.array(
          z.object({
            path: z.string(),
            name: z.string(),
            type: z.enum(["file", "directory"]),
          }),
        ),
        totalIndexed: z.number().int().nonnegative(),
      })
      .parse(
        await input.client.callRemoteProcedure("searchProjectFiles", {
          projectLocation: current.location,
          query: url.searchParams.get("query") ?? "",
          limit,
        }),
      );
    const requestedType = url.searchParams.get("type");
    const data = result.entries
      .filter((entry) => requestedType === null || entry.type === requestedType)
      .map((entry) => ({ path: entry.path, type: entry.type }));
    return json({ location: requestLocation(url), data });
  }
  const fileReadMatch = path.match(/^\/api\/fs\/read\/(.+)$/u);
  if (fileReadMatch && method === "GET") {
    const current = await resolveProject();
    const filePath = decodeURIComponent(fileReadMatch[1]!);
    const result = readProjectFileResultSchema.parse(
      await input.client.callRemoteProcedure("readProjectFile", {
        projectLocation: current.location,
        path: filePath,
      }),
    );
    if (result.status === "ready" && result.content !== undefined)
      return new Response(new TextEncoder().encode(result.content), {
        headers: { "content-type": "application/octet-stream" },
      });
    if (result.status === "binary" && result.contentBase64 !== undefined)
      return new Response(Buffer.from(result.contentBase64, "base64"), {
        headers: { "content-type": "application/octet-stream" },
      });
    return json(
      { error: { code: result.status, message: `File content is ${result.status}.` } },
      result.status === "too_large" ? 413 : 415,
    );
  }
  if ((path === "/api/file" || path === "/api/fs/list") && method === "GET") {
    const current = await resolveProject();
    const directoryPath = url.searchParams.get("path") ?? "";
    const result = listProjectTreeResultSchema.parse(
      await input.client.callRemoteProcedure("listProjectTree", {
        projectLocation: current.location,
        directoryPath,
      }),
    );
    const output: FileListOutput = {
      location: requestLocation(url),
      data: result.entries.map((entry) => ({ path: entry.path, type: entry.type })),
    };
    return json(output);
  }
  if (path === "/api/vcs" && method === "GET") {
    try {
      const current = await resolveProject();
      const snapshot = gitProjectSnapshotResultSchema.parse(
        await input.client.callRemoteProcedure("gitProjectSnapshot", {
          projectLocation: current.location,
        }),
      );
      const output: VcsGetOutput = {
        location: { directory: input.bootstrap.directory },
        data: {
          ...(snapshot.status?.remoteInfo ? { provider: snapshot.status.remoteInfo.platform } : {}),
          branch: {
            ...(snapshot.branches?.current ? { current: snapshot.branches.current } : {}),
          },
        },
      };
      return json(output);
    } catch {
      return json({
        location: { directory: input.bootstrap.directory },
        data: { branch: {} },
      } satisfies VcsGetOutput);
    }
  }
  if (path === "/api/vcs/base" && method === "GET")
    return json({
      location: { directory: input.bootstrap.directory },
      data: null,
    } satisfies VcsBaseOutput);
  if (path === "/api/vcs/status" && method === "GET") {
    try {
      const current = await resolveProject();
      const status = gitStatusResultSchema.parse(
        await input.client.callRemoteProcedure("getGitStatus", {
          projectLocation: current.location,
        }),
      );
      const data: VcsStatusOutput["data"] = [...status.staged, ...status.unstaged].map(
        (change) => ({
          file: change.path,
          additions: change.insertions,
          deletions: change.deletions,
          status: gitFileStatus(change.status),
        }),
      );
      return json({ location: { directory: input.bootstrap.directory }, data });
    } catch {
      return json({
        location: { directory: input.bootstrap.directory },
        data: [],
      } satisfies VcsStatusOutput);
    }
  }
  if (path === "/api/vcs/branch" && method === "GET") {
    try {
      const current = await resolveProject();
      const branches = gitBranchListResultSchema.parse(
        await input.client.callRemoteProcedure("gitListBranches", {
          projectLocation: current.location,
          includeRemote: true,
        }),
      );
      const search = url.searchParams.get("search")?.toLowerCase();
      const limitValue = Number(url.searchParams.get("limit"));
      const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(500, limitValue)) : 100;
      const data = branches.branches
        .map((branch) => branch.name)
        .filter((name) => !search || name.toLowerCase().includes(search))
        .slice(0, limit);
      return json({
        location: { directory: input.bootstrap.directory },
        data,
      } satisfies VcsBranchListOutput);
    } catch {
      return json({
        location: { directory: input.bootstrap.directory },
        data: [],
      } satisfies VcsBranchListOutput);
    }
  }
  if (path === "/api/vcs/diff" && method === "GET") {
    try {
      const current = await resolveProject();
      const mode = url.searchParams.get("mode");
      const result = gitDiffResultSchema.parse(
        await input.client.callRemoteProcedure("getGitDiff", {
          projectLocation: current.location,
          staged: mode === "committed",
        }),
      );
      return json({
        location: { directory: input.bootstrap.directory },
        data: parseGitDiff(result.diff),
      } satisfies VcsDiffOutput);
    } catch {
      return json({
        location: { directory: input.bootstrap.directory },
        data: [],
      } satisfies VcsDiffOutput);
    }
  }
  if (path === "/api/vcs/init" && method === "POST")
    return json(
      {
        error: {
          code: "unsupported",
          message: "VCS initialization is unavailable in this TUI.",
        },
      },
      501,
    );
  if (path === "/api/worktree" && method === "GET") {
    // An old host without gitListWorktrees answers an empty list.
    const output: { directory: string }[] = [];
    try {
      const currentProject = await resolveProject();
      const result = record(
        await input.client.callRemoteProcedure("gitListWorktrees", {
          projectLocation: currentProject.location,
        }),
      );
      for (const entry of Array.isArray(result.worktrees) ? (result.worktrees as unknown[]) : [])
        output.push({ directory: String(record(entry).path ?? "") });
    } catch {
      // Unsupported or unreachable host — the workspace dialog sees none.
    }
    return json(output);
  }
  if (path === "/api/worktree" && method === "POST") {
    const body = record(await readBody());
    const currentProject = await resolveProject();
    const branch =
      String(body.name ?? body.branch ?? "").trim() ||
      `poracode/${currentProject.name.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}-${crypto.randomUUID().slice(0, 4)}`;
    const result = record(
      await input.client.callRemoteProcedure("gitAddWorktree", {
        projectLocation: currentProject.location,
        branch,
        createBranch: true,
      }),
    );
    const directory = String(result.path ?? result.worktree ?? result.directory ?? "");
    if (!directory)
      return json(
        { error: { code: "invalid_request", message: "Worktree creation returned no path" } },
        400,
      );
    createdWorktrees.set(directory, branch);
    return json({ data: { directory } });
  }
  if (path === "/api/worktree/refresh" && method === "POST") {
    try {
      const currentProject = await resolveProject();
      await input.client.callRemoteProcedure("gitListWorktrees", {
        projectLocation: currentProject.location,
      });
    } catch {
      // Refresh is best-effort; unsupported hosts still get 204.
    }
    return new Response(null, { status: 204 });
  }
  return undefined;
}
