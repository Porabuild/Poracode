import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, writeFile } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import {
  agentKindSchema,
  threadConfigSchema,
  threadPresentationModeSchema,
  threadTransferGitStateSchema,
} from "@/shared/contracts";
import { persistedCompletedTurnSchema } from "@/shared/ipc/schemas";
import { sha256HexSchema, THREAD_TRANSFER_VERSION } from "@/shared/threadTransfer";

/**
 * Thread transfer package, format 1 (the `threadTransfer` capability version):
 *
 *   "PCTXFR01" | u32 BE header length | header JSON (UTF-8) | parts…
 *
 * Parts follow the header in `header.parts` order, each with its byte length
 * and SHA-256; the whole file's SHA-256 is checked separately before a commit.
 * A reader refuses any other magic, a header over the cap, an unknown format
 * version, duplicate part names or a layout that does not end exactly at the
 * end of the file. Part names are a closed charset because they never become
 * paths; attachment file names are sanitized again by the attachment store.
 */
export const THREAD_TRANSFER_PACKAGE_FORMAT_VERSION = THREAD_TRANSFER_VERSION;
const MAGIC = Buffer.from("PCTXFR01", "ascii");
const PREFIX_BYTES = MAGIC.length + 4;
const MAX_HEADER_BYTES = 4 * 1024 * 1024;

const partNameSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/u);

export const threadTransferPackageHeaderSchema = z.object({
  formatVersion: z.literal(THREAD_TRANSFER_PACKAGE_FORMAT_VERSION),
  createdAt: z.string().min(1),
  source: z.object({
    hostId: z.string().min(1),
    hostLabel: z.string().min(1),
    appVersion: z.string().min(1).optional(),
  }),
  thread: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    agentKind: agentKindSchema,
    config: threadConfigSchema,
    presentationMode: threadPresentationModeSchema,
    createdAt: z.string().min(1),
    starred: z.boolean(),
    workingDirectory: z.string().min(1).optional(),
  }),
  transcript: z.object({
    throughItemId: z.string().min(1),
    turns: z.array(persistedCompletedTurnSchema).max(100_000),
  }),
  /** Null when only the conversation moves. `bundle` names whether a `bundle` part exists. */
  git: threadTransferGitStateSchema.extend({ bundle: z.boolean() }).nullable(),
  attachments: z
    .array(
      z.object({
        part: partNameSchema,
        fileName: z.string().min(1).max(255),
        sourcePath: z.string().min(1).max(4096),
      }),
    )
    .max(200),
  parts: z
    .array(
      z.object({
        name: partNameSchema,
        length: z.number().int().nonnegative(),
        sha256: sha256HexSchema,
      }),
    )
    .max(256),
});
export type ThreadTransferPackageHeader = z.infer<typeof threadTransferPackageHeaderSchema>;

export class ThreadTransferPackageError extends Error {
  constructor(reason: string) {
    super(`Invalid thread transfer package: ${reason}`);
    this.name = "ThreadTransferPackageError";
  }
}

export interface ThreadTransferPackagePart {
  readonly name: string;
  readonly data?: Uint8Array;
  /** A file whose bytes become the part; read twice (hash, then copy). */
  readonly file?: string;
}

function hashingTransform(onChunk: (chunk: Buffer) => void): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      onChunk(chunk);
      callback(null, chunk);
    },
  });
}

async function describePart(
  part: ThreadTransferPackagePart,
): Promise<{ length: number; sha256: string }> {
  const hash = createHash("sha256");
  if (part.data) {
    hash.update(part.data);
    return { length: part.data.length, sha256: hash.digest("hex") };
  }
  let length = 0;
  for await (const chunk of createReadStream(part.file!)) {
    hash.update(chunk as Buffer);
    length += (chunk as Buffer).length;
  }
  return { length, sha256: hash.digest("hex") };
}

/** Writes a new package file (never overwrites) and returns its size and SHA-256. */
export async function writeThreadTransferPackage(
  path: string,
  header: Omit<ThreadTransferPackageHeader, "parts">,
  parts: readonly ThreadTransferPackagePart[],
): Promise<{ byteLength: number; sha256: string }> {
  const described: ThreadTransferPackageHeader["parts"] = [];
  for (const part of parts) described.push({ name: part.name, ...(await describePart(part)) });
  const headerBytes = Buffer.from(
    JSON.stringify(threadTransferPackageHeaderSchema.parse({ ...header, parts: described })),
    "utf8",
  );
  if (headerBytes.length > MAX_HEADER_BYTES)
    throw new ThreadTransferPackageError("header too large");
  const prefix = Buffer.alloc(PREFIX_BYTES);
  MAGIC.copy(prefix);
  prefix.writeUInt32BE(headerBytes.length, MAGIC.length);
  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield prefix;
    yield headerBytes;
    for (const part of parts) {
      if (part.data) yield part.data;
      else for await (const chunk of createReadStream(part.file!)) yield chunk as Buffer;
    }
  }
  const hash = createHash("sha256");
  let byteLength = 0;
  await pipeline(
    Readable.from(chunks()),
    hashingTransform((chunk) => {
      hash.update(chunk);
      byteLength += chunk.length;
    }),
    createWriteStream(path, { flags: "wx" }),
  );
  return { byteLength, sha256: hash.digest("hex") };
}

/** SHA-256 of a whole file, streamed. */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export interface ThreadTransferPackage {
  readonly header: ThreadTransferPackageHeader;
  hasPart(name: string): boolean;
  /** Reads and verifies one part; refuses a part larger than `maxBytes`. */
  readPart(name: string, maxBytes: number): Promise<Buffer>;
  /** Streams one part into a new file and verifies it. */
  copyPartToFile(name: string, destination: string): Promise<void>;
}

export async function openThreadTransferPackage(path: string): Promise<ThreadTransferPackage> {
  const handle = await open(path, "r");
  let header: ThreadTransferPackageHeader;
  const layout = new Map<string, { offset: number; length: number; sha256: string }>();
  try {
    const { size } = await handle.stat();
    const prefix = Buffer.alloc(PREFIX_BYTES);
    const { bytesRead } = await handle.read(prefix, 0, PREFIX_BYTES, 0);
    if (bytesRead !== PREFIX_BYTES || !prefix.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new ThreadTransferPackageError("unknown format");
    }
    const headerLength = prefix.readUInt32BE(MAGIC.length);
    if (headerLength > MAX_HEADER_BYTES || PREFIX_BYTES + headerLength > size) {
      throw new ThreadTransferPackageError("header out of bounds");
    }
    const headerBytes = Buffer.alloc(headerLength);
    await handle.read(headerBytes, 0, headerLength, PREFIX_BYTES);
    try {
      header = threadTransferPackageHeaderSchema.parse(JSON.parse(headerBytes.toString("utf8")));
    } catch {
      throw new ThreadTransferPackageError("unreadable header");
    }
    let offset = PREFIX_BYTES + headerLength;
    for (const part of header.parts) {
      if (layout.has(part.name)) throw new ThreadTransferPackageError("duplicate part");
      layout.set(part.name, { offset, length: part.length, sha256: part.sha256 });
      offset += part.length;
    }
    if (offset !== size) throw new ThreadTransferPackageError("layout does not match the file");
  } finally {
    await handle.close();
  }
  const partOf = (name: string) => {
    const part = layout.get(name);
    if (!part) throw new ThreadTransferPackageError(`missing part ${name}`);
    return part;
  };
  return {
    header,
    hasPart: (name) => layout.has(name),
    readPart: async (name, maxBytes) => {
      const part = partOf(name);
      if (part.length > maxBytes) throw new ThreadTransferPackageError(`part ${name} too large`);
      const data = Buffer.alloc(part.length);
      const reader = await open(path, "r");
      try {
        if (part.length > 0) await reader.read(data, 0, part.length, part.offset);
      } finally {
        await reader.close();
      }
      if (createHash("sha256").update(data).digest("hex") !== part.sha256) {
        throw new ThreadTransferPackageError(`part ${name} is corrupt`);
      }
      return data;
    },
    copyPartToFile: async (name, destination) => {
      const part = partOf(name);
      const hash = createHash("sha256");
      if (part.length === 0) {
        await writeFile(destination, new Uint8Array(), { flag: "wx" });
      } else {
        await pipeline(
          createReadStream(path, { start: part.offset, end: part.offset + part.length - 1 }),
          hashingTransform((chunk) => hash.update(chunk)),
          createWriteStream(destination, { flags: "wx" }),
        );
      }
      if (hash.digest("hex") !== part.sha256) {
        throw new ThreadTransferPackageError(`part ${name} is corrupt`);
      }
    },
  };
}
