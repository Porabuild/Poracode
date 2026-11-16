import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import type { IpcProcedurePayload, SupervisorProcedureName } from "@/shared/ipc";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import type { ThreadTransferResultOf } from "@/shared/threadTransfer";
import { saveUploadedAttachmentFile } from "@/host/attachments/attachmentStorage";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { dbGetThreadRuntimeItems, dbReplaceThreadRuntimeSnapshot } from "@/host/db/runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { readThreadForkInitialInstructions } from "@/host/db/threadForks";
import { ThreadTransferService, type ThreadTransferServiceOptions } from "./threadTransferService";

const HEAD = "a".repeat(40);
const BASIS = "b".repeat(40);
const BUNDLE_BYTES = Buffer.from("fake git bundle bytes");
const TRANSFER_ID = "transfer-0001";
const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  closeDatabase();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
});

function openHost(prefix: string): string {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  initDatabase(join(dir, "state.sqlite"));
  return dir;
}

type Calls = Array<{ name: string; payload: unknown }>;

/** Supervisor Git steps answered from fixtures; the real ones have their own tests. */
function fakeSupervisor(
  calls: Calls,
  target: { worktreePath: string; onImport?: (() => void) | undefined },
) {
  const answer = async (name: SupervisorProcedureName, payload: unknown): Promise<unknown> => {
    calls.push({ name, payload });
    switch (name) {
      case "threadTransferInspectGit":
        return {
          repository: true,
          branch: "feature",
          head: HEAD,
          changedFiles: 2,
          repoIdentities: ["github.com/acme/widgets"],
        };
      case "threadTransferExportGit": {
        const { bundlePath } = payload as IpcProcedurePayload<"threadTransferExportGit">;
        writeFileSync(bundlePath, BUNDLE_BYTES);
        return {
          branch: "feature",
          head: HEAD,
          worktreeCommit: "c".repeat(40),
          basis: [BASIS],
          changedFiles: 2,
          bundleBytes: BUNDLE_BYTES.length,
        };
      }
      case "threadTransferRepoProbe": {
        const { projectLocations } = payload as IpcProcedurePayload<"threadTransferRepoProbe">;
        return {
          repositories: projectLocations.map(() => ({
            repository: true,
            repoIdentities: ["github.com/acme/widgets"],
          })),
        };
      }
      case "threadTransferGitHaves":
        return { repository: true, haves: [BASIS] };
      case "threadTransferImportGit": {
        const { bundlePath } = payload as IpcProcedurePayload<"threadTransferImportGit">;
        expect(readFileSync(bundlePath!)).toEqual(BUNDLE_BYTES);
        target.onImport?.();
        return {
          worktreePath: target.worktreePath,
          branch: "feature",
          branchRenamed: false,
          branchCreated: true,
        };
      }
      case "gitRemoveWorktree":
        return undefined;
      default:
        throw new Error(`unexpected supervisor call ${name}`);
    }
  };
  return answer as unknown as ThreadTransferServiceOptions["callSupervisor"];
}

function service(dir: string, label: string, calls: Calls, onImport?: () => void) {
  const published: string[][] = [];
  const prepared: string[] = [];
  const instance = new ThreadTransferService({
    paths: resolvePoracodePaths(dir),
    identity: () => ({ hostId: `${label}-id`, hostLabel: label, appVersion: "1.0.0" }),
    callSupervisor: fakeSupervisor(calls, { worktreePath: join(dir, "wt"), onImport }),
    prepareWorktree: async (_projectId, path) => {
      prepared.push(path);
    },
    publishThreadsChanged: (ids) => published.push([...ids]),
  });
  return { instance, published, prepared };
}

async function seedSource(dir: string, status: Thread["status"] = "idle"): Promise<string> {
  dbUpsertProject(
    {
      id: "project-1",
      name: "Widgets",
      location: { kind: "posix", path: join(dir, "repo") },
      createdAt: "2026-11-01T10:00:00Z",
    },
    0,
  );
  dbUpsertThread(
    {
      ...testThread(),
      status,
      attention: "none",
      presentationMode: "gui",
      starred: true,
      config: { model: "gpt-5", executionEnvironment: { kind: "wsl", distro: "Ubuntu" } },
      worktreePath: join(dir, "worktrees", "feature"),
      worktreeBranch: "feature",
    },
    0,
  );
  const image = await saveUploadedAttachmentFile(resolvePoracodePaths(dir), {
    threadId: "thread-1",
    fileName: "screen.png",
    data: Buffer.from("png-bytes"),
  });
  await dbReplaceThreadRuntimeSnapshot(
    "thread-1",
    [
      {
        id: "u1",
        type: "user_message",
        state: "completed",
        payload: {
          content: [
            { kind: "text", text: "Build the widget picker" },
            { kind: "image", mimeType: "image/png", dataUrl: "poracode-local://x", path: image },
          ],
        },
        streams: {},
      },
      {
        id: "a1",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Started the picker in src/picker.ts" },
      },
      { id: "goal", type: "goal", state: "completed", streams: {} },
    ],
    [{ anchorItemId: "a1", startedAt: "2026-11-01T10:00:00Z", endedAt: "2026-11-01T10:05:00Z" }],
    null,
  );
  return image;
}

function stagedExports(dir: string): string[] {
  const staging = join(resolvePoracodePaths(dir).cacheDir, "thread-transfers");
  return existsSync(staging)
    ? readdirSync(staging).flatMap((entry) => {
        const exportsDir = join(staging, entry, "exports");
        return existsSync(exportsDir) ? readdirSync(exportsDir) : [];
      })
    : [];
}

async function readAll(
  source: ThreadTransferService,
  exported: ThreadTransferResultOf<"export">,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < exported.byteLength; offset += 1000) {
    const read = await source.run({
      kind: "read",
      transferId: exported.transferId,
      offset,
      length: 1000,
    });
    if (read.kind !== "read") throw new Error("expected a read");
    chunks.push(Buffer.from(read.data, "base64"));
  }
  return Buffer.concat(chunks);
}

async function uploadAll(
  target: ThreadTransferService,
  bytes: Buffer,
  exported: ThreadTransferResultOf<"export">,
): Promise<void> {
  for (let offset = 0; offset < bytes.length; offset += 1000) {
    const query = { offset, total: bytes.length, sha256: exported.sha256 };
    const chunk = bytes.subarray(offset, offset + 1000);
    await target.upload(exported.transferId, query, chunk);
    // A retried chunk is acknowledged without being written twice.
    expect(await target.upload(exported.transferId, query, chunk)).toEqual({
      received: Math.min(bytes.length, offset + 1000),
    });
  }
}

describe.skipIf(!sqliteAvailable)("thread transfer service", () => {
  it("moves a chat thread with its history, attachment and code to another host", async () => {
    const sourceDir = openHost("poracode-transfer-source-");
    const sourceImage = await seedSource(sourceDir);
    const sourceCalls: Calls = [];
    const { instance: source } = service(sourceDir, "Poracode on Laptop", sourceCalls);

    const described = await source.run({ kind: "describe", threadId: "thread-1" });
    expect(described).toMatchObject({
      kind: "describe",
      source: { git: { branch: "feature", changedFiles: 2 }, presentationMode: "gui" },
    });
    expect(described.kind === "describe" && described.source.blocker).toBeUndefined();

    const exported = await source.run({
      kind: "export",
      transferId: TRANSFER_ID,
      threadId: "thread-1",
      haves: [BASIS],
    });
    if (exported.kind !== "export") throw new Error("expected an export");
    expect(exported.summary).toMatchObject({
      itemCount: 2,
      turnCount: 1,
      attachmentCount: 1,
      git: { branch: "feature", basisCount: 1, bundleBytes: BUNDLE_BYTES.length },
    });
    const bytes = await readAll(source, exported);
    expect(bytes.length).toBe(exported.byteLength);
    await source.run({ kind: "release", transferId: TRANSFER_ID });
    await expect(
      source.run({ kind: "read", transferId: TRANSFER_ID, offset: 0, length: 10 }),
    ).rejects.toMatchObject({ code: "thread_transfer_expired", status: 410 });
    // Stage a second export while the source database is still open; the
    // same-provider commit below reuses these bytes after the target opens.
    const SECOND_TRANSFER = "transfer-0002";
    const reexported = await source.run({
      kind: "export",
      transferId: SECOND_TRANSFER,
      threadId: "thread-1",
      haves: [BASIS],
    });
    if (reexported.kind !== "export") throw new Error("expected an export");
    const rebytes = await readAll(source, reexported);
    await source.run({ kind: "release", transferId: SECOND_TRANSFER });
    // Export never changes the source thread.
    expect(dbGetThread("thread-1")).toMatchObject({ status: "idle", archived: false });
    closeDatabase();

    const targetDir = openHost("poracode-transfer-target-");
    dbUpsertProject(
      {
        id: "project-b",
        name: "Widgets",
        location: { kind: "posix", path: join(targetDir, "repo") },
        createdAt: "2026-11-01T10:00:00Z",
      },
      0,
    );
    const targetCalls: Calls = [];
    const target = service(targetDir, "Server", targetCalls);
    const plan = await target.instance.run({
      kind: "plan",
      repoIdentities: ["github.com/acme/widgets"],
    });
    expect(plan).toMatchObject({ kind: "plan", selectedProjectId: "project-b", haves: [BASIS] });

    await uploadAll(target.instance, bytes, exported);
    const commit = {
      kind: "commit" as const,
      transferId: TRANSFER_ID,
      threadId: "moved-1",
      projectId: "project-b",
      byteLength: exported.byteLength,
      sha256: exported.sha256,
      // The source provider is not set up on the target, so the move switches it.
      // Host-bound fields in the chosen config never cross to the new host.
      agent: {
        kind: "claude",
        config: {
          model: "sonnet",
          executionEnvironment: { kind: "wsl" as const, distro: "Ubuntu" },
        },
      },
    };
    const committed = await target.instance.run(commit);
    if (committed.kind !== "commit") throw new Error("expected a commit");
    expect(committed).toMatchObject({
      replayed: false,
      branch: "feature",
      worktreePath: join(targetDir, "wt"),
      thread: {
        id: "moved-1",
        projectId: "project-b",
        status: "inactive",
        presentationMode: "gui",
        starred: true,
        worktreeBranch: "feature",
        agentKind: "claude",
        forkedFrom: {
          threadId: "thread-1",
          throughItemId: "a1",
          transfer: {
            transferId: TRANSFER_ID,
            sourceHostLabel: "Laptop",
            sourceHostId: "Poracode on Laptop-id",
            targetHostLabel: "Server",
            fromAgentKind: "codex",
          },
        },
      },
    });
    // Another provider starts from its own defaults; host-bound settings never cross.
    expect(committed.thread.config).toEqual({ model: "sonnet" });
    expect(target.published).toEqual([["moved-1"]]);
    expect(target.prepared).toEqual([join(targetDir, "wt")]);

    const items = await dbGetThreadRuntimeItems("moved-1");
    expect(items.map((item) => item.id)).toEqual(["u1", "a1"]);
    const image = (
      items[0]!.payload as { content: Array<{ kind: string; path?: string }> }
    ).content.find((block) => block.kind === "image")!;
    expect(image.path).not.toBe(sourceImage);
    expect(image.path!.startsWith(resolvePoracodePaths(targetDir).attachmentsDir)).toBe(true);
    expect(readFileSync(image.path!, "utf8")).toBe("png-bytes");

    const instructions = readThreadForkInitialInstructions("moved-1");
    expect(instructions).toContain('moved here from another machine ("Laptop")');
    expect(instructions).toContain('branch "feature"');
    expect(instructions).toContain("came from another agent (codex)");
    expect(instructions).toContain("Build the widget picker");
    expect(instructions).toContain(join(targetDir, "wt"));

    // A lost reply retried with the same transfer replays the saved thread.
    expect(await target.instance.run(commit)).toMatchObject({ replayed: true });
    expect(targetCalls.filter((call) => call.name === "threadTransferImportGit")).toHaveLength(1);

    // Keeping the source provider still applies the chosen model, with no
    // agent-change lineage recorded.
    await uploadAll(target.instance, rebytes, reexported);
    const recommitted = await target.instance.run({
      kind: "commit" as const,
      transferId: SECOND_TRANSFER,
      threadId: "moved-2",
      projectId: "project-b",
      byteLength: reexported.byteLength,
      sha256: reexported.sha256,
      agent: { kind: "codex", config: { model: "gpt-5-mini" } },
    });
    if (recommitted.kind !== "commit") throw new Error("expected a commit");
    expect(recommitted.thread.agentKind).toBe("codex");
    expect(recommitted.thread.config).toEqual({ model: "gpt-5-mini" });
    const lineage = (
      recommitted.thread.forkedFrom as { transfer?: { fromAgentKind?: string } } | undefined
    )?.transfer;
    expect(lineage?.fromAgentKind).toBeUndefined();
  });

  it("refuses a busy thread before staging anything", async () => {
    const dir = openHost("poracode-transfer-busy-");
    await seedSource(dir, "working");
    const { instance } = service(dir, "Laptop", []);
    const described = await instance.run({ kind: "describe", threadId: "thread-1" });
    expect(described.kind === "describe" && described.source.blocker).toBe("busy");
    await expect(
      instance.run({ kind: "export", transferId: TRANSFER_ID, threadId: "thread-1", haves: [] }),
    ).rejects.toMatchObject({ code: "thread_transfer_busy", status: 409 });
    const staging = join(resolvePoracodePaths(dir).cacheDir, "thread-transfers");
    const staged = existsSync(staging)
      ? readdirSync(staging).flatMap((entry) => {
          const exportsDir = join(staging, entry, "exports");
          return existsSync(exportsDir) ? readdirSync(exportsDir) : [];
        })
      : [];
    expect(staged).toEqual([]);
  });

  it("keeps another server's staged package and clears orphans of exited processes", async () => {
    const dir = openHost("poracode-transfer-staging-");
    await seedSource(dir);
    const staging = join(resolvePoracodePaths(dir).cacheDir, "thread-transfers");
    const orphan = join(staging, "999999999-orphan");
    mkdirSync(orphan, { recursive: true });
    const { instance: first } = service(dir, "Laptop", []);
    await first.run({ kind: "export", transferId: TRANSFER_ID, threadId: "thread-1", haves: [] });
    expect(existsSync(orphan)).toBe(false);
    // A second server in the same process prepares its own staging without touching the first.
    const { instance: second } = service(dir, "Laptop", []);
    await second.run({ kind: "describe", threadId: "thread-1" });
    const read = await first.run({ kind: "read", transferId: TRANSFER_ID, offset: 0, length: 8 });
    expect(read.kind === "read" && Buffer.from(read.data, "base64").toString("latin1")).toBe(
      "PCTXFR01",
    );
  });

  it("rolls back the worktree when saving the thread fails, and checks uploads", async () => {
    const sourceDir = openHost("poracode-transfer-source-");
    await seedSource(sourceDir);
    const { instance: source } = service(sourceDir, "Laptop", []);
    const exported = await source.run({
      kind: "export",
      transferId: TRANSFER_ID,
      threadId: "thread-1",
      haves: [],
    });
    if (exported.kind !== "export") throw new Error("expected an export");
    const bytes = await readAll(source, exported);
    closeDatabase();

    const targetDir = openHost("poracode-transfer-target-");
    dbUpsertProject(
      {
        id: "project-b",
        name: "Widgets",
        location: { kind: "posix", path: join(targetDir, "repo") },
        createdAt: "2026-11-01T10:00:00Z",
      },
      0,
    );
    dbUpsertThread({ ...testThread(), id: "taken", projectId: "project-b" }, 0);
    const calls: Calls = [];
    // A row with the moved thread's id appears while Git runs, so the save fails late.
    const { instance: target } = service(targetDir, "Server", calls, () =>
      dbUpsertThread({ ...testThread(), id: "moved-race", projectId: "project-b" }, 0),
    );
    await expect(
      target.upload(
        TRANSFER_ID,
        { offset: 5, total: bytes.length, sha256: exported.sha256 },
        bytes,
      ),
    ).rejects.toMatchObject({ code: "thread_transfer_expired" });
    await uploadAll(target, bytes, exported);
    await expect(
      target.run({
        kind: "commit",
        transferId: TRANSFER_ID,
        threadId: "taken",
        projectId: "project-b",
        byteLength: exported.byteLength,
        sha256: exported.sha256,
      }),
    ).rejects.toMatchObject({ code: "thread_already_exists" });

    calls.length = 0;
    await expect(
      target.run({
        kind: "commit",
        transferId: TRANSFER_ID,
        threadId: "moved-race",
        projectId: "project-b",
        byteLength: exported.byteLength,
        sha256: exported.sha256,
      }),
    ).rejects.toMatchObject({ code: "thread_already_exists" });
    // The worktree and the branch the import created are removed again.
    expect(calls.map((call) => call.name)).toEqual([
      "threadTransferImportGit",
      "gitRemoveWorktree",
    ]);
    expect(calls[1]!.payload).toMatchObject({
      path: join(targetDir, "wt"),
      force: true,
      deleteBranch: true,
      expectedBranch: "feature",
    });
    // So are the attachment copies saved for the thread that was never created.
    const attachmentsDir = resolvePoracodePaths(targetDir).attachmentsDir;
    expect(
      existsSync(attachmentsDir)
        ? readdirSync(attachmentsDir, { recursive: true, withFileTypes: true }).filter((entry) =>
            entry.isFile(),
          )
        : [],
    ).toEqual([]);
  });

  it("rejects a second export under the same transfer id for another thread", async () => {
    const dir = openHost("poracode-transfer-mismatch-");
    await seedSource(dir);
    const { instance } = service(dir, "Laptop", []);
    const first = instance.run({
      kind: "export",
      transferId: TRANSFER_ID,
      threadId: "thread-1",
      haves: [],
    });
    await expect(
      instance.run({
        kind: "export",
        transferId: TRANSFER_ID,
        threadId: "thread-2",
        haves: [],
      }),
    ).rejects.toMatchObject({ code: "thread_transfer_mismatch", status: 409 });
    await first;
  });

  it("shares one in-flight export between retries for the same thread", async () => {
    const dir = openHost("poracode-transfer-dedupe-");
    await seedSource(dir);
    const { instance } = service(dir, "Laptop", []);
    const first = instance.run({
      kind: "export",
      transferId: TRANSFER_ID,
      threadId: "thread-1",
      haves: [],
    });
    const second = instance.run({
      kind: "export",
      transferId: TRANSFER_ID,
      threadId: "thread-1",
      haves: [],
    });
    expect(await second).toBe(await first);
  });

  it("plans only the requested project when a project id is given", async () => {
    const dir = openHost("poracode-transfer-plan-");
    dbUpsertProject(
      {
        id: "project-a",
        name: "A",
        location: { kind: "posix", path: join(dir, "repo-a") },
        createdAt: "2026-11-01T10:00:00Z",
      },
      0,
    );
    dbUpsertProject(
      {
        id: "project-b",
        name: "B",
        location: { kind: "posix", path: join(dir, "repo-b") },
        createdAt: "2026-11-01T10:00:00Z",
      },
      0,
    );
    const calls: Calls = [];
    const { instance } = service(dir, "Server", calls);
    const plan = await instance.run({
      kind: "plan",
      projectId: "project-b",
      repoIdentities: ["github.com/acme/widgets"],
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan.projects).toHaveLength(1);
    expect(plan).toMatchObject({
      kind: "plan",
      projects: [{ projectId: "project-b", git: true, matched: true }],
      selectedProjectId: "project-b",
      haves: [BASIS],
    });
    const probe = calls.find((call) => call.name === "threadTransferRepoProbe");
    expect(probe?.payload).toEqual({
      projectLocations: [{ kind: "posix", path: join(dir, "repo-b") }],
    });
  });

  it("returns no projects or haves for an unknown project id instead of falling back", async () => {
    const dir = openHost("poracode-transfer-plan-missing-");
    dbUpsertProject(
      {
        id: "project-a",
        name: "A",
        location: { kind: "posix", path: join(dir, "repo-a") },
        createdAt: "2026-11-01T10:00:00Z",
      },
      0,
    );
    const calls: Calls = [];
    const { instance } = service(dir, "Server", calls);
    const plan = await instance.run({
      kind: "plan",
      projectId: "missing",
      repoIdentities: ["github.com/acme/widgets"],
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan).toMatchObject({ projects: [], haves: [] });
    expect(plan.selectedProjectId).toBeUndefined();
    expect(
      calls.filter(
        (call) => call.name === "threadTransferRepoProbe" || call.name === "threadTransferGitHaves",
      ),
    ).toHaveLength(0);
  });

  it("refuses a terminal-presentation thread before staging anything", async () => {
    const dir = openHost("poracode-transfer-not-chat-");
    await seedSource(dir);
    dbUpsertThread(
      {
        ...testThread(),
        id: "thread-term",
        projectId: "project-1",
        status: "idle",
        attention: "none",
        presentationMode: "terminal",
      },
      0,
    );
    const { instance } = service(dir, "Laptop", []);
    const described = await instance.run({ kind: "describe", threadId: "thread-term" });
    expect(described.kind === "describe" && described.source.blocker).toBe("not_chat");
    await expect(
      instance.run({
        kind: "export",
        transferId: TRANSFER_ID,
        threadId: "thread-term",
        haves: [],
      }),
    ).rejects.toMatchObject({ code: "thread_transfer_not_chat", status: 409 });
    expect(stagedExports(dir)).toEqual([]);
  });

  it("refuses a WSL-project thread before staging anything", async () => {
    const dir = openHost("poracode-transfer-wsl-");
    await seedSource(dir);
    dbUpsertProject(
      {
        id: "project-wsl",
        name: "WSL repo",
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: "\\\\wsl$\\Ubuntu\\repo",
        },
        createdAt: "2026-11-01T10:00:00Z",
      },
      0,
    );
    dbUpsertThread(
      {
        ...testThread(),
        id: "thread-wsl",
        projectId: "project-wsl",
        status: "idle",
        attention: "none",
        presentationMode: "gui",
      },
      0,
    );
    const { instance } = service(dir, "Laptop", []);
    const described = await instance.run({ kind: "describe", threadId: "thread-wsl" });
    expect(described.kind === "describe" && described.source.blocker).toBe("unsupported_location");
    await expect(
      instance.run({
        kind: "export",
        transferId: TRANSFER_ID,
        threadId: "thread-wsl",
        haves: [],
      }),
    ).rejects.toMatchObject({ code: "thread_transfer_unsupported_location", status: 409 });
    expect(stagedExports(dir)).toEqual([]);
  });

  it("refuses a thread with no settled history before staging anything", async () => {
    const dir = openHost("poracode-transfer-no-history-");
    await seedSource(dir);
    dbUpsertThread(
      {
        ...testThread(),
        id: "thread-empty",
        projectId: "project-1",
        status: "idle",
        attention: "none",
        presentationMode: "gui",
      },
      0,
    );
    await dbReplaceThreadRuntimeSnapshot(
      "thread-empty",
      [
        { id: "g1", type: "goal", state: "completed", streams: {} },
        {
          id: "r1",
          type: "assistant_message",
          state: "started",
          payload: { status: "running" },
          streams: {},
        },
      ],
      [],
      null,
    );
    const { instance } = service(dir, "Laptop", []);
    await expect(
      instance.run({
        kind: "export",
        transferId: TRANSFER_ID,
        threadId: "thread-empty",
        haves: [],
      }),
    ).rejects.toMatchObject({ code: "thread_transfer_no_history", status: 409 });
    expect(stagedExports(dir)).toEqual([]);
  });

  it("refuses a Git package for WSL and Home targets before Git or attachments", async () => {
    const sourceDir = openHost("poracode-transfer-source-");
    await seedSource(sourceDir);
    const { instance: source } = service(sourceDir, "Laptop", []);
    const exportedWsl = await source.run({
      kind: "export",
      transferId: "transfer-0001",
      threadId: "thread-1",
      haves: [],
    });
    const exportedHome = await source.run({
      kind: "export",
      transferId: "transfer-0002",
      threadId: "thread-1",
      haves: [],
    });
    if (exportedWsl.kind !== "export" || exportedHome.kind !== "export") {
      throw new Error("expected exports");
    }
    const bytesWsl = await readAll(source, exportedWsl);
    const bytesHome = await readAll(source, exportedHome);
    closeDatabase();

    const targetDir = openHost("poracode-transfer-target-");
    dbUpsertProject(
      {
        id: "project-wsl",
        name: "WSL repo",
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: "\\\\wsl$\\Ubuntu\\repo",
        },
        createdAt: "2026-11-01T10:00:00Z",
      },
      0,
    );
    dbUpsertProject(
      {
        id: HOME_PROJECT_ID,
        name: "Home",
        location: { kind: "posix", path: join(targetDir, "home") },
        createdAt: "2026-11-01T10:00:00Z",
      },
      0,
    );
    const calls: Calls = [];
    const target = service(targetDir, "Server", calls);
    await uploadAll(target.instance, bytesWsl, exportedWsl);
    await uploadAll(target.instance, bytesHome, exportedHome);

    await expect(
      target.instance.run({
        kind: "commit",
        transferId: "transfer-0001",
        threadId: "moved-wsl",
        projectId: "project-wsl",
        byteLength: exportedWsl.byteLength,
        sha256: exportedWsl.sha256,
      }),
    ).rejects.toMatchObject({ code: "thread_transfer_unsupported_location", status: 409 });
    await expect(
      target.instance.run({
        kind: "commit",
        transferId: "transfer-0002",
        threadId: "moved-home",
        projectId: HOME_PROJECT_ID,
        byteLength: exportedHome.byteLength,
        sha256: exportedHome.sha256,
      }),
    ).rejects.toMatchObject({ code: "thread_transfer_target_not_git", status: 409 });

    expect(calls.filter((call) => call.name === "threadTransferImportGit")).toHaveLength(0);
    const attachmentsDir = resolvePoracodePaths(targetDir).attachmentsDir;
    expect(
      existsSync(attachmentsDir)
        ? readdirSync(attachmentsDir, { recursive: true, withFileTypes: true }).filter((entry) =>
            entry.isFile(),
          )
        : [],
    ).toEqual([]);
  });

  it("streams multi-batch transcripts to package.bin without leaving intermediate files", async () => {
    const sourceDir = openHost("poracode-transfer-stream-src-");
    await seedSource(sourceDir);
    const manyItems = Array.from({ length: 80 }, (_, i) => ({
      id: `m-${i}`,
      type: i % 2 === 0 ? "user_message" : "assistant_message",
      state: "completed" as const,
      payload: { content: [{ kind: "text", text: `Msg ${i}` }] },
      streams: i % 2 === 1 ? { assistant_text: `Reply ${i}` } : {},
    }));
    await dbReplaceThreadRuntimeSnapshot(
      "thread-1",
      [
        ...manyItems,
        { id: "excluded-goal", type: "goal", state: "completed", streams: {} },
        {
          id: "running-parent",
          type: "tool_call",
          state: "started",
          payload: { name: "Task", status: "running" },
          streams: {},
        },
        {
          id: "running-child",
          type: "assistant_message",
          state: "completed",
          parentItemId: "running-parent",
          streams: { assistant_text: "Excluded child" },
        },
      ],
      [
        {
          anchorItemId: "m-79",
          startedAt: "2026-11-01T10:00:00Z",
          endedAt: "2026-11-01T10:01:00Z",
        },
      ],
      null,
    );
    const { instance: source } = service(sourceDir, "Laptop", []);
    const exported = await source.run({
      kind: "export",
      transferId: TRANSFER_ID,
      threadId: "thread-1",
      haves: [],
    });
    if (exported.kind !== "export") throw new Error("expected export");
    expect(exported.summary.itemCount).toBe(80);
    // Intermediate items.json.gz and repo.bundle are unlinked once packaged.
    const transfersRoot = join(resolvePoracodePaths(sourceDir).cacheDir, "thread-transfers");
    const [instanceRoot] = readdirSync(transfersRoot);
    if (!instanceRoot) throw new Error("expected transfer staging root");
    expect(readdirSync(join(transfersRoot, instanceRoot, "exports", TRANSFER_ID))).toEqual([
      "package.bin",
    ]);
    const bytes = await readAll(source, exported);
    closeDatabase();

    const targetDir = openHost("poracode-transfer-stream-dst-");
    dbUpsertProject(
      {
        id: "project-target",
        name: "Widgets",
        location: { kind: "windows", path: join(targetDir, "repo") },
        createdAt: "2026-11-01T10:00:00Z",
      },
      0,
    );
    const target = service(targetDir, "Desktop", []);
    await uploadAll(target.instance, bytes, exported);
    await target.instance.run({
      kind: "commit",
      transferId: TRANSFER_ID,
      threadId: "moved-many",
      projectId: "project-target",
      byteLength: exported.byteLength,
      sha256: exported.sha256,
    });
    const transferred = await dbGetThreadRuntimeItems("moved-many");
    expect(transferred).toHaveLength(80);
    expect(transferred.at(0)?.id).toBe("m-0");
    expect(transferred.at(-1)?.id).toBe("m-79");
  });
});
