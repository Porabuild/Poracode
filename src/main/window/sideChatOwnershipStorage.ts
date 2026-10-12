import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { threadSchema } from "@/shared/contracts";
import { sideChatBootstrapSchema } from "@/shared/ipc/sideChat";

// Device-local ownership format 1. It does not change thread or remote-wire formats.
// Old bootstraps without a selection remain valid; absent files start empty.
export const sideChatOwnershipSchema = z.object({
  version: z.literal(1),
  entries: z.array(
    z.object({ bootstrap: sideChatBootstrapSchema, thread: threadSchema.optional() }),
  ),
  disposing: z.array(threadSchema),
});
export type SideChatOwnershipState = z.infer<typeof sideChatOwnershipSchema>;

export function createSideChatOwnershipStorage(path: string) {
  let writes = Promise.resolve();
  return {
    async load(): Promise<SideChatOwnershipState> {
      try {
        return sideChatOwnershipSchema.parse(JSON.parse(await readFile(path, "utf8")));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return { version: 1, entries: [], disposing: [] };
        throw error;
      }
    },
    save(state: SideChatOwnershipState): Promise<void> {
      const json = JSON.stringify(sideChatOwnershipSchema.parse(state));
      const write = writes
        .catch(() => {})
        .then(async () => {
          await mkdir(dirname(path), { recursive: true });
          const temp = `${path}.${crypto.randomUUID()}.tmp`;
          try {
            await writeFile(temp, json, { mode: 0o600 });
            await rename(temp, path);
          } finally {
            await rm(temp, { force: true });
          }
        });
      writes = write;
      return write;
    },
  };
}
