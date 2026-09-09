export const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
export const MAX_EDITABLE_FILE_SIZE = 1_000_000;

export function isBinaryBuffer(buffer: Buffer): boolean {
  for (const byte of buffer) {
    if (byte === 0) return true;
  }
  return false;
}

export function detectLineEnding(content: string): "lf" | "crlf" {
  return content.includes("\r\n") ? "crlf" : "lf";
}

function normalizeContentForWrite(content: string, lineEnding: "lf" | "crlf"): string {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lineEnding === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
}

/**
 * Build the on-disk bytes for a save, preserving the original file's BOM
 * and line-ending convention. Throws if the original is not valid UTF-8.
 */
export function buildWriteBuffer(existingBuffer: Buffer, nextContent: string): Buffer {
  const hasBom = existingBuffer.subarray(0, BOM.length).equals(BOM);
  const contentBuffer = hasBom ? existingBuffer.subarray(BOM.length) : existingBuffer;
  let existingContent = "";
  try {
    existingContent = new TextDecoder("utf-8", { fatal: true }).decode(contentBuffer);
  } catch {
    throw new Error("This file uses an unsupported encoding.");
  }
  const normalized = normalizeContentForWrite(nextContent, detectLineEnding(existingContent));
  const nextBuffer = Buffer.from(normalized, "utf8");
  return hasBom ? Buffer.concat([BOM, nextBuffer]) : nextBuffer;
}
