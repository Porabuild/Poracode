import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { rm } from "node:fs/promises";
import type {
  FileCheckpointChangedFile,
  FileCheckpointRecord,
  FileCheckpointTurn,
  ProjectLocation,
} from "@/shared/contracts";
import { readWslCommandOutputAsync } from "../agents/base";
import type { WslBridgeClient } from "../wsl/bridge/client";
import { execGit, removeWslPathViaBridge } from "./exec";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const REF_ROOT = "refs/lightcode/checkpoints";

type CheckpointMetadata = FileCheckpointRecord | FileCheckpointTurn;

export class GitCheckpointService {
  private wslClient: WslBridgeClient | undefined;

  setWslClient(client: WslBridgeClient): void {
    this.wslClient = client;
  }

  async create(input: {
    threadId: string;
    checkpointItemId: string;
    projectLocation: ProjectLocation;
  }): Promise<FileCheckpointRecord> {
    return this.writeSnapshot(input.projectLocation, {
      threadId: input.threadId,
      checkpointItemId: input.checkpointItemId,
      capturedAt: new Date().toISOString(),
    });
  }

  async finalize(input: {
    threadId: string;
    checkpointItemId: string;
    baseCheckpointItemId: string;
    projectLocation: ProjectLocation;
  }): Promise<FileCheckpointTurn> {
    const base = await this.readCheckpoint(input.projectLocation, {
      threadId: input.threadId,
      checkpointItemId: input.baseCheckpointItemId,
    });
    const ref = checkpointRef(input.threadId, input.checkpointItemId);
    const baseRef = checkpointRef(input.threadId, input.baseCheckpointItemId);
    await this.writeSnapshot(input.projectLocation, {
      threadId: input.threadId,
      checkpointItemId: input.checkpointItemId,
      capturedAt: new Date().toISOString(),
      baseCheckpointItemId: input.baseCheckpointItemId,
      baseRef,
      changedFiles: [],
    });
    const changedFiles = await changedFilesBetween(input.projectLocation, baseRef, ref);

    const snapshot = await this.writeSnapshot(input.projectLocation, {
      threadId: input.threadId,
      checkpointItemId: input.checkpointItemId,
      capturedAt: new Date().toISOString(),
      baseCheckpointItemId: input.baseCheckpointItemId,
      baseRef,
      changedFiles,
    });

    return {
      ...snapshot,
      baseCheckpointItemId: input.baseCheckpointItemId,
      baseRef: base.ref,
      changedFiles,
    };
  }

  async list(input: {
    threadId: string;
    projectLocation: ProjectLocation;
  }): Promise<{ checkpoints: FileCheckpointRecord[]; turns: FileCheckpointTurn[] }> {
    const prefix = `${REF_ROOT}/${refSegment(input.threadId)}/`;
    const output = await execGit(input.projectLocation, [
      "for-each-ref",
      "--format=%(refname)",
      prefix,
    ]);
    const refs = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const checkpoints: FileCheckpointRecord[] = [];
    const turns: FileCheckpointTurn[] = [];

    for (const ref of refs) {
      const metadata = await this.readCheckpointMetadata(input.projectLocation, ref);
      if (!metadata || metadata.threadId !== input.threadId) continue;
      checkpoints.push(metadata);
      if ("baseCheckpointItemId" in metadata) turns.push(metadata);
    }

    return { checkpoints, turns };
  }

  async restore(input: {
    threadId: string;
    checkpointItemId: string;
    projectLocation: ProjectLocation;
  }): Promise<void> {
    const ref = checkpointRef(input.threadId, input.checkpointItemId);
    await execGit(input.projectLocation, ["rev-parse", "--verify", `${ref}^{commit}`]);
    await execGit(input.projectLocation, ["clean", "-fd"]);
    await execGit(input.projectLocation, ["read-tree", "--reset", "-u", ref]);
    if (await resolveHeadCommit(input.projectLocation)) {
      await execGit(input.projectLocation, ["reset", "--mixed", "--quiet", "HEAD"]);
    }
  }

  private async readCheckpoint(
    projectLocation: ProjectLocation,
    input: { threadId: string; checkpointItemId: string },
  ): Promise<FileCheckpointRecord> {
    const ref = checkpointRef(input.threadId, input.checkpointItemId);
    const metadata = await this.readCheckpointMetadata(projectLocation, ref);
    if (!metadata) {
      throw new Error(`No file checkpoint exists for item ${input.checkpointItemId}.`);
    }
    return metadata;
  }

  private async writeSnapshot(
    projectLocation: ProjectLocation,
    metadata: Omit<FileCheckpointRecord, "ref" | "commit"> &
      Partial<Pick<FileCheckpointTurn, "baseCheckpointItemId" | "baseRef" | "changedFiles">>,
  ): Promise<FileCheckpointRecord> {
    const ref = checkpointRef(metadata.threadId, metadata.checkpointItemId);
    if (projectLocation.kind === "wsl") {
      if (!this.wslClient) {
        throw new Error("WSL bridge unavailable for checkpoint snapshot");
      }
      const { commit } = await this.wslClient.createGitCheckpointSnapshot(projectLocation, {
        ref,
        metadata: { ...metadata, ref },
      });
      return {
        threadId: metadata.threadId,
        checkpointItemId: metadata.checkpointItemId,
        ref,
        commit,
        capturedAt: metadata.capturedAt,
      };
    }

    await execGit(projectLocation, ["rev-parse", "--is-inside-work-tree"]);
    const tempIndex = await createTempIndexPath(projectLocation);
    try {
      const env = { GIT_INDEX_FILE: tempIndex };
      const baseTree = await resolveHeadTree(projectLocation);
      await execGit(projectLocation, ["read-tree", baseTree], { env });
      await execGit(projectLocation, ["add", "-A", "--", "."], { env });
      const tree = (await execGit(projectLocation, ["write-tree"], { env })).trim();
      const head = await resolveHeadCommit(projectLocation);
      const commitArgs = [
        "commit-tree",
        tree,
        ...(head ? ["-p", head] : []),
        "-m",
        "Lightcode checkpoint",
        "-m",
        JSON.stringify({ ...metadata, ref }),
      ];
      const commit = (await execGit(projectLocation, commitArgs, { env })).trim();
      await execGit(projectLocation, ["update-ref", ref, commit]);
      return {
        threadId: metadata.threadId,
        checkpointItemId: metadata.checkpointItemId,
        ref,
        commit,
        capturedAt: metadata.capturedAt,
      };
    } finally {
      await removeTempIndex(projectLocation, tempIndex);
    }
  }

  private async readCheckpointMetadata(
    projectLocation: ProjectLocation,
    ref: string,
  ): Promise<CheckpointMetadata | null> {
    let commit: string;
    try {
      commit = (
        await execGit(projectLocation, ["rev-parse", "--verify", `${ref}^{commit}`])
      ).trim();
    } catch {
      return null;
    }
    const body = await execGit(projectLocation, ["log", "-1", "--format=%B", ref]);
    const jsonLine = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith("{") && line.endsWith("}"));
    if (!jsonLine) return null;
    try {
      const parsed = JSON.parse(jsonLine) as CheckpointMetadata;
      return { ...parsed, ref, commit };
    } catch {
      return null;
    }
  }
}

async function resolveHeadTree(projectLocation: ProjectLocation): Promise<string> {
  try {
    return (await execGit(projectLocation, ["rev-parse", "--verify", "HEAD^{tree}"])).trim();
  } catch {
    return EMPTY_TREE;
  }
}

async function resolveHeadCommit(projectLocation: ProjectLocation): Promise<string | null> {
  try {
    return (await execGit(projectLocation, ["rev-parse", "--verify", "HEAD"])).trim();
  } catch {
    return null;
  }
}

async function createTempIndexPath(projectLocation: ProjectLocation): Promise<string> {
  const indexPath = (
    await execGit(projectLocation, ["rev-parse", "--path-format=absolute", "--git-path", "index"])
  ).trim();
  return `${indexPath}.lightcode-${randomUUID()}`;
}

async function removeTempIndex(projectLocation: ProjectLocation, tempIndex: string): Promise<void> {
  if (projectLocation.kind === "wsl") {
    if (await removeWslPathViaBridge(projectLocation, tempIndex, { force: true })) {
      return;
    }
    await readWslCommandOutputAsync(projectLocation.distro, "rm", ["-f", tempIndex]);
    return;
  }
  const resolved = isAbsolute(tempIndex) ? tempIndex : join(projectLocation.path, tempIndex);
  await rm(resolved, { force: true });
}

async function changedFilesBetween(
  projectLocation: ProjectLocation,
  baseRef: string,
  targetRef: string,
): Promise<FileCheckpointChangedFile[]> {
  const output = await execGit(projectLocation, [
    "diff",
    "--name-status",
    "-M",
    baseRef,
    targetRef,
  ]);
  return output
    .split(/\r?\n/)
    .map((line) => parseNameStatusLine(line))
    .filter((file): file is FileCheckpointChangedFile => file !== null);
}

function parseNameStatusLine(line: string): FileCheckpointChangedFile | null {
  const parts = line.split("\t");
  const status = parts[0];
  if (!status) return null;
  if (status.startsWith("R") || status.startsWith("C")) {
    const oldPath = parts[1];
    const path = parts[2];
    return oldPath && path ? { status, oldPath, path } : null;
  }
  const path = parts[1];
  return path ? { status, path } : null;
}

function checkpointRef(threadId: string, checkpointItemId: string): string {
  return `${REF_ROOT}/${refSegment(threadId)}/${refSegment(checkpointItemId)}`;
}

function refSegment(value: string): string {
  return Buffer.from(value).toString("base64url");
}
