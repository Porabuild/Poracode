import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/** Stream large release artifacts instead of buffering them in memory. */
export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
