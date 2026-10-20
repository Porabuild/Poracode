import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { ForgeGetPrViewedFilesPayload } from "@/shared/contracts";
import { writeFileAtomicAsync } from "@/shared/atomicFileAsync";

// Host-owned user marks survive restarts. Unknown versions must never be overwritten.
const documentSchema = z.object({
  version: z.literal(1),
  reviews: z.record(z.string(), z.array(z.tuple([z.string(), z.string()]))),
});

export class ForgeViewedFilesStore {
  private pending = Promise.resolve();

  constructor(private readonly path: string) {}

  private key(input: ForgeGetPrViewedFilesPayload): string {
    return JSON.stringify([
      input.forgeAccount.forge,
      input.forgeAccount.host,
      input.forgeAccount.login,
      input.forgeRepository,
      input.prNumber,
    ]);
  }

  private async read() {
    try {
      return documentSchema.parse(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1 as const, reviews: {} as Record<string, [string, string][]> };
      }
      throw error;
    }
  }

  async get(input: ForgeGetPrViewedFilesPayload): Promise<Record<string, string>> {
    await this.pending;
    return Object.fromEntries((await this.read()).reviews[this.key(input)] ?? []);
  }

  set(input: ForgeGetPrViewedFilesPayload, path: string, fingerprint: string | null) {
    const result = this.pending.then(async () => {
      const document = await this.read();
      const key = this.key(input);
      const current = Object.fromEntries(document.reviews[key] ?? []);
      const marks = fingerprint === null ? current : { ...current, [path]: fingerprint };
      if (fingerprint === null) delete marks[path];
      if (Object.keys(marks).length) document.reviews[key] = Object.entries(marks);
      else delete document.reviews[key];
      await writeFileAtomicAsync(this.path, JSON.stringify(document), {
        encoding: "utf8",
        mode: 0o600,
      });
      return marks;
    });
    this.pending = result.then(
      () => {},
      () => {},
    );
    return result;
  }
}
