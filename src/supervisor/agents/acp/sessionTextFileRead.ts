import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { sliceTextFileContent } from "./sessionPaths";

/** Preserve ACP text slicing while avoiding the unrequested file suffix and skipped lines. */
export async function readTextFileContent(
  path: string,
  line: number | null | undefined,
  limit: number | null | undefined,
): Promise<string> {
  if (
    (line == null && limit == null) ||
    (line != null && !Number.isFinite(line)) ||
    (limit != null && !Number.isFinite(limit))
  ) {
    return sliceTextFileContent(await readFile(path, "utf8"), line, limit);
  }

  const startLine = Math.max(1, Math.trunc(line ?? 1));
  const maxLines = limit == null ? undefined : Math.max(0, Math.trunc(limit));
  const selected: string[] = [];
  let currentLine = 1;
  let parts: string[] = [];
  const stream = createReadStream(path, { encoding: "utf8" });
  let earlyStop = false;
  let filesystemError: NodeJS.ErrnoException | undefined;
  const captureError = (error: NodeJS.ErrnoException) => {
    if (earlyStop && error.code === "ABORT_ERR") return;
    filesystemError ??= error;
  };
  // The iterator's return can settle before a later filesystem close failure.
  stream.on("error", captureError);
  const closed = new Promise<void>((resolve) => stream.once("close", resolve));
  try {
    readLines: for await (const chunk of stream) {
      // Opening/reading must still report missing, unreadable or directory paths for limit zero.
      if (maxLines === 0) {
        earlyStop = true;
        break;
      }
      const text = chunk as string;
      let cursor = 0;
      for (;;) {
        const newline = text.indexOf("\n", cursor);
        const end = newline < 0 ? text.length : newline;
        if (currentLine >= startLine && end > cursor) parts.push(text.slice(cursor, end));
        if (newline < 0) break;
        if (currentLine >= startLine) {
          const last = parts.at(-1);
          if (last?.endsWith("\r")) parts[parts.length - 1] = last.slice(0, -1);
          selected.push(parts.join(""));
          parts = [];
          if (maxLines !== undefined && selected.length >= maxLines) {
            earlyStop = true;
            break readLines;
          }
        }
        currentLine++;
        cursor = newline + 1;
      }
    }
    // split(/\r?\n/) includes the final empty line and preserves a bare CR at EOF.
    if (!earlyStop && maxLines !== 0 && currentLine >= startLine) selected.push(parts.join(""));
  } finally {
    stream.destroy();
    await closed;
    stream.off("error", captureError);
  }
  if (filesystemError) throw filesystemError;
  return selected.join("\n");
}
