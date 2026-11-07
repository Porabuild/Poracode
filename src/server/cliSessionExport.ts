import { createHash, randomUUID } from "node:crypto";
import { open, realpath, lstat, link, unlink, type FileHandle } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Writable } from "node:stream";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import {
  SESSION_EXPORT_CHUNK_BYTES,
  sessionExportCommandSchema,
  sessionExportStartSchema,
  sessionExportReadSchema,
  sessionExportCancelSchema,
} from "@/shared/contracts/sessionExport";

type AdminRequest = (command: HostAdminCommand, signal?: AbortSignal) => Promise<unknown>;

export function parseSessionExportCli(args: readonly string[]) {
  if (args[0] !== "sessions" || args[1] !== "export") return null;
  const parsed = parseArgs({
    args: args.slice(2),
    options: { output: { type: "string" } },
    allowPositionals: true,
    strict: true,
  });
  if (parsed.positionals.length !== 1 || parsed.values.output?.trim() === "")
    throw new Error(
      "Usage: poracode sessions export THREAD_ID [--output FILE|-]. Run sessions export --help.",
    );
  const command = sessionExportCommandSchema.parse({
    action: "sessions-export-start",
    threadId: parsed.positionals[0],
  });
  return { threadId: command.threadId, output: parsed.values.output ?? "-" };
}

export async function runSessionExportCli(
  input: NonNullable<ReturnType<typeof parseSessionExportCli>>,
  connect: (signal: AbortSignal) => Promise<AdminRequest>,
  stdout: Writable = process.stdout,
) {
  const controller = new AbortController();
  let outputError: Error | undefined;
  let writingOutput = false;
  const failOutput = (error: Error) => {
    outputError ??= error;
    controller.abort(error);
  };
  const cancel = () => controller.abort(new Error("Session export cancelled."));
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  if (input.output === "-") stdout.on("error", failOutput);
  const cancelOutput = () => {
    if (writingOutput) stdout.destroy(controller.signal.reason as Error);
  };
  controller.signal.addEventListener("abort", cancelOutput);
  let request: AdminRequest | undefined;
  let active: { threadId: string; exportId: string } | undefined;
  let file: FileHandle | undefined;
  let temporary: string | undefined;
  let identity: { dev: bigint; ino: bigint } | undefined;
  let failure: unknown;
  try {
    request = await connect(controller.signal);
    const started = sessionExportStartSchema.parse(
      await request(
        {
          action: "sessions-export-start",
          threadId: input.threadId,
        },
        controller.signal,
      ),
    );
    if (started.threadId !== input.threadId)
      throw new Error("The owner returned a different session; no export was written.");
    active = { threadId: input.threadId, exportId: started.exportId };
    let target: string | undefined;
    if (input.output !== "-") {
      const resolved = resolve(input.output);
      let parent: string;
      try {
        parent = await realpath(dirname(resolved));
      } catch (error) {
        throw new Error(
          "The export destination directory is unavailable. Choose an existing writable directory.",
          { cause: error },
        );
      }
      target = join(parent, basename(resolved));
      try {
        await lstat(target);
        throw new Error("The destination already exists. Choose a new export filename.");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      temporary = join(parent, `.${basename(resolved)}.${randomUUID()}.tmp`);
      file = await open(temporary, "wx", 0o600);
      const metadata = await file.stat({ bigint: true });
      identity = { dev: metadata.dev, ino: metadata.ino };
    }
    const hash = createHash("sha256");
    let offset = 0;
    for (;;) {
      controller.signal.throwIfAborted();
      const response = sessionExportReadSchema.parse(
        await request(
          {
            action: "sessions-export-read",
            ...active,
            offset,
          },
          controller.signal,
        ),
      );
      if (
        response.threadId !== active.threadId ||
        response.exportId !== active.exportId ||
        response.offset !== offset
      )
        throw new Error("Export identity or offset mismatch; no complete file was published.");
      if (response.finished) {
        if (response.nextOffset !== offset || response.sha256 !== hash.digest("hex"))
          throw new Error("Export checksum mismatch; no complete file was published.");
        active = undefined;
        break;
      }
      const bytes = Buffer.from(response.data, "base64");
      if (
        bytes.length === 0 ||
        bytes.length > SESSION_EXPORT_CHUNK_BYTES ||
        bytes.toString("base64") !== response.data ||
        response.nextOffset !== offset + bytes.length
      )
        throw new Error("Invalid export chunk; no complete file was published.");
      hash.update(bytes);
      if (file) await file.writeFile(bytes);
      else
        await new Promise<void>((resolveWrite, reject) => {
          writingOutput = true;
          const closed = () => {
            writingOutput = false;
            reject(controller.signal.reason ?? new Error("Export output closed unexpectedly."));
          };
          stdout.once("close", closed);
          stdout.write(bytes, (error) => {
            stdout.off("close", closed);
            writingOutput = false;
            if (error) reject(error);
            else resolveWrite();
          });
        });
      offset = response.nextOffset;
    }
    if (file && target) {
      await file.sync();
      await file.close();
      file = undefined;
      controller.signal.throwIfAborted();
      // link creates a complete destination exclusively; rename would overwrite on Unix.
      await link(temporary!, target);
    }
  } catch (error) {
    failure = outputError ?? error;
  } finally {
    const cleanupErrors: unknown[] = [];
    if (active && request) {
      try {
        const result = sessionExportCancelSchema.parse(
          await request({
            action: "sessions-export-cancel",
            ...active,
          }),
        );
        if (result.exportId !== active.exportId || result.threadId !== active.threadId)
          cleanupErrors.push(new Error("Export closure returned a different session."));
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await file?.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (temporary && identity) {
      try {
        const metadata = await lstat(temporary, { bigint: true });
        if (metadata.isFile() && metadata.dev === identity.dev && metadata.ino === identity.ino)
          await unlink(temporary);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
    controller.signal.removeEventListener("abort", cancelOutput);
    if (input.output === "-") stdout.off("error", failOutput);
    if (cleanupErrors.length)
      failure = new AggregateError(
        [...(failure === undefined ? [] : [failure]), ...cleanupErrors],
        `${failure instanceof Error ? `${failure.message} ` : ""}Session export cleanup could not be confirmed. Inspect the destination and run doctor before retrying.`,
        { cause: failure ?? cleanupErrors[0] },
      );
  }
  if (failure !== undefined)
    throw failure instanceof Error
      ? failure
      : new Error("Session export failed.", { cause: failure });
}
