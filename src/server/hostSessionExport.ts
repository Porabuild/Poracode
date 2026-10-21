import { fork, type ChildProcess, type ForkOptions } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { HostControlContext } from "@/backend/ownership/HostControlServer";
import { getRuntimeThreadGapNotice } from "@/host/db";
import { fenceRefusalError } from "@/host/db/runtimeItems";
import {
  beginRuntimeFence,
  flushRuntimeFence,
  readRuntimeFenceAsync,
  releaseRuntimeFence,
} from "@/host/db/runtimePersistenceRuntime";
import type { RuntimeFenceToken } from "@/host/db/runtimePersistenceTypes";
import { toRemoteRuntimeHistoryNotice } from "@/host/remote/server/runtimeHistoryNoticeGate";
import {
  SESSION_EXPORT_CHUNK_BYTES,
  SESSION_EXPORT_FORMAT_VERSION,
  type SessionExportCommand,
} from "@/shared/contracts/sessionExport";
import { HOST_ADMIN_TIMEOUT_MS } from "@/shared/hostAdminProtocol";
import {
  SESSION_EXPORT_WORKER_VERSION,
  sessionExportWorkerMessageSchema,
} from "./sessionExportProtocol";

interface ExportJob {
  id: string;
  threadId: string;
  createdAt: number;
  lastRead: number;
  ready: ReturnType<typeof Promise.withResolvers<void>>;
  closed: ReturnType<typeof Promise.withResolvers<number | null>>;
  started: ReturnType<typeof Promise.withResolvers<void>>;
  hash: ReturnType<typeof createHash>;
  offset: number;
  reading: boolean;
  cancelled: boolean;
  phase: "initializing" | "ready" | "streaming" | "complete";
  fence?: RuntimeFenceToken;
  child?: ChildProcess;
  retiring?: Promise<void>;
  error?: Error;
  completed?: { bytes: number; sha256: string };
}

/** One bounded read-only snapshot per owner; no provider or credential store is opened. */
export class HostSessionExports {
  private closed = false;
  private job: ExportJob | undefined;
  private readonly retired = new Map<string, string>();
  private readonly starts = new Set<Promise<void>>();
  private readonly timer = setInterval(() => {
    const job = this.job;
    if (job && this.expired(job)) void this.retire(job).catch(() => undefined);
  }, 30_000);

  constructor(private readonly worker: { path: string; dbPath: string } | undefined) {
    this.timer.unref();
  }

  async execute(command: SessionExportCommand, context: HostControlContext) {
    context.assertActive();
    if (this.closed) throw new Error("Session exports are shutting down.");
    if (command.action === "sessions-export-start") return this.start(command.threadId, context);
    const job = this.job;
    if (!job || job.id !== command.exportId || job.threadId !== command.threadId) {
      if (
        command.action === "sessions-export-cancel" &&
        this.retired.get(command.exportId) === command.threadId
      )
        return { ...this.metadata(command.exportId, command.threadId), closed: true };
      throw new Error(
        "This export is unknown or has expired. Start a new export in the same profile.",
      );
    }
    if (command.action === "sessions-export-cancel") {
      await this.retire(job);
      return { ...this.metadata(job.id, job.threadId), closed: true };
    }
    if (job.reading) throw new Error("An export chunk is already being read.");
    if (command.offset !== job.offset)
      throw new Error("Export offset mismatch; restart the export.");
    this.assertActive(job, context);
    job.reading = true;
    job.lastRead = Date.now();
    const cancel = () => void this.retire(job).catch(() => undefined);
    context.signal.addEventListener("abort", cancel, { once: true });
    try {
      const data = await this.readChunk(job);
      this.assertActive(job, context);
      if (data) {
        job.hash.update(data);
        job.offset += data.length;
        return {
          ...this.metadata(job.id, job.threadId),
          offset: command.offset,
          nextOffset: job.offset,
          data: data.toString("base64"),
          finished: false,
        };
      }
      const code = await job.closed.promise;
      this.assertActive(job, context);
      const digest = job.hash.digest("hex");
      if (code !== 0 || job.completed?.bytes !== job.offset || job.completed.sha256 !== digest)
        throw new Error(
          "The export did not complete with a matching checksum. No file was published.",
        );
      await this.retire(job);
      return {
        ...this.metadata(job.id, job.threadId),
        offset: command.offset,
        nextOffset: job.offset,
        data: "",
        sha256: digest,
        finished: true,
      };
    } catch (error) {
      await this.retire(job);
      throw error;
    } finally {
      context.signal.removeEventListener("abort", cancel);
      job.reading = false;
    }
  }

  private metadata(exportId: string, threadId: string) {
    return {
      formatVersion: SESSION_EXPORT_FORMAT_VERSION,
      scope: "persisted-thread",
      exportId,
      threadId,
    };
  }

  private assertActive(job: ExportJob, context: HostControlContext) {
    context.assertActive();
    if (this.expired(job)) void this.retire(job).catch(() => undefined);
    if (this.closed || job.cancelled || this.job !== job)
      throw new Error("Session export was cancelled or expired; no file was published.");
    if (job.error) throw job.error;
  }

  private expired(job: ExportJob) {
    return (
      Date.now() - job.lastRead >= 120_000 || Date.now() - job.createdAt >= HOST_ADMIN_TIMEOUT_MS
    );
  }

  private async start(threadId: string, context: HostControlContext) {
    if (!this.worker || !existsSync(this.worker.path))
      throw new Error(
        "This owner has no session export worker. Upgrade its runtime explicitly, then retry.",
      );
    if (this.job && this.expired(this.job)) await this.retire(this.job);
    context.assertActive();
    if (this.closed) throw new Error("Session exports are shutting down.");
    if (this.job)
      throw new Error(
        "Another session export is active. Finish it or wait for its idle lease to expire.",
      );
    const now = Date.now();
    const job: ExportJob = {
      id: randomUUID(),
      threadId,
      createdAt: now,
      lastRead: now,
      ready: Promise.withResolvers<void>(),
      closed: Promise.withResolvers<number | null>(),
      started: Promise.withResolvers<void>(),
      hash: createHash("sha256"),
      offset: 0,
      reading: false,
      cancelled: false,
      phase: "initializing",
    };
    void job.ready.promise.catch(() => undefined);
    this.job = job;
    this.starts.add(job.started.promise);
    const cancel = () => void this.retire(job).catch(() => undefined);
    context.signal.addEventListener("abort", cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      job.fence = beginRuntimeFence(threadId);
      const fence = await flushRuntimeFence(job.fence);
      if (fence.kind !== "committed") throw fenceRefusalError(threadId, fence);
      await readRuntimeFenceAsync(job.fence, async () => {
        this.assertActive(job, context);
        const notice = getRuntimeThreadGapNotice(threadId);
        const env = Object.fromEntries(
          Object.entries(process.env).filter(([key]) =>
            /^(?:path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata)$/i.test(
              key,
            ),
          ),
        );
        if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = "1";
        const childOptions: ForkOptions & { windowsHide: boolean } = {
          execArgv: [],
          env,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        };
        const child = fork(this.worker!.path, [], childOptions);
        job.child = child;
        const fail = () => {
          job.error ??= new Error(
            "The read-only export worker failed. Run doctor before retrying.",
          );
          job.ready.reject(job.error);
          cancel();
        };
        child.stderr!.resume();
        child.stdout!.on("error", fail);
        child.on("error", fail);
        child.once("close", (code) => {
          job.closed.resolve(code);
          job.ready.reject(new Error("The export worker exited before its snapshot was ready."));
        });
        child.on("message", (frame: unknown) => {
          const parsed = sessionExportWorkerMessageSchema.safeParse(frame);
          if (!parsed.success || parsed.data.exportId !== job.id) return fail();
          if (parsed.data.kind === "ready" && job.phase === "initializing") {
            job.phase = "ready";
            job.ready.resolve();
          } else if (parsed.data.kind === "complete" && job.phase === "streaming") {
            job.phase = "complete";
            job.completed = parsed.data;
          } else fail();
        });
        // Match the existing async reader's deadline before a five-second fence can expire.
        timer = setTimeout(fail, 4_000);
        child.send({
          kind: "initialize",
          version: SESSION_EXPORT_WORKER_VERSION,
          exportId: job.id,
          dbPath: this.worker!.dbPath,
          threadId,
          runtimeNotice: notice ? toRemoteRuntimeHistoryNotice(notice) : null,
        });
        await job.ready.promise;
        clearTimeout(timer);
      });
      this.assertActive(job, context);
      job.phase = "streaming";
      await new Promise<void>((resolve, reject) => {
        job.child!.send(
          { kind: "continue", version: SESSION_EXPORT_WORKER_VERSION, exportId: job.id },
          (error) => (error ? reject(error) : resolve()),
        );
      });
      return {
        ...this.metadata(job.id, threadId),
        format: "poracode-session-json",
        chunkBytes: SESSION_EXPORT_CHUNK_BYTES,
        expiresAt: now + HOST_ADMIN_TIMEOUT_MS,
      };
    } catch (error) {
      await this.retire(job);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      context.signal.removeEventListener("abort", cancel);
      job.started.resolve();
      this.starts.delete(job.started.promise);
    }
  }

  private readChunk(job: ExportJob): Promise<Buffer | null> {
    const stream = job.child!.stdout!;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        stream.off("readable", read);
        stream.off("end", read);
        stream.off("close", read);
      };
      const read = () => {
        if (job.cancelled || job.error) {
          cleanup();
          reject(job.error ?? new Error("Session export cancelled."));
          return;
        }
        const data = stream.read(SESSION_EXPORT_CHUNK_BYTES) as Buffer | null;
        if (data || stream.readableEnded) {
          cleanup();
          resolve(data);
        } else if (stream.destroyed) {
          cleanup();
          reject(new Error("Export output closed unexpectedly."));
        }
      };
      stream.on("readable", read);
      stream.on("end", read);
      stream.on("close", read);
      read();
    });
  }

  private retire(job: ExportJob): Promise<void> {
    if (job.retiring) return job.retiring;
    job.cancelled = true;
    job.ready.reject(new Error("Session export cancelled."));
    if (job.fence) releaseRuntimeFence(job.fence);
    const pending = (async () => {
      if (job.child) {
        job.child.stdout?.destroy();
        job.child.stderr?.destroy();
        if (job.child.exitCode === null && job.child.signalCode === null) job.child.kill("SIGKILL");
        await job.closed.promise;
      }
      if (this.job === job) this.job = undefined;
      this.retired.set(job.id, job.threadId);
      if (this.retired.size > 32) this.retired.delete(this.retired.keys().next().value!);
    })();
    job.retiring = pending;
    void pending.catch(() => {
      delete job.retiring;
    });
    return pending;
  }

  async dispose() {
    this.closed = true;
    clearInterval(this.timer);
    if (this.job) await this.retire(this.job);
    await Promise.all(this.starts);
  }
}
