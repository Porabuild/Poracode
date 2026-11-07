import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  forgeReviewGuideSchema,
  type ForgeGetPrReviewGuidePayload,
  type ForgePrReviewGuideResult,
  type ForgeReviewGuideContent,
  type PrDetails,
  type PrFile,
  type PrReviewThread,
} from "@/shared/contracts";
import { writeFileAtomicAsync } from "@/shared/atomicFileAsync";
import { reviewGuideExcerpt } from "@/shared/reviewGuide";
import { splitUnifiedDiff } from "@/shared/reviewDiff";
import { msg } from "@/shared/messages";

export interface ReviewGuideSnapshot {
  headSha: string;
  details: PrDetails;
  files: PrFile[];
  diff: string;
  threads: PrReviewThread[];
}

export function reviewGuideFingerprint(snapshot: ReviewGuideSnapshot): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        snapshot.headSha,
        snapshot.details.baseBranch,
        snapshot.details.title,
        snapshot.details.body,
        snapshot.files,
        snapshot.diff,
        snapshot.threads.filter((thread) => !thread.isResolved && !thread.isOutdated),
      ]),
    )
    .digest("hex");
}

export function validateReviewGuide(
  content: ForgeReviewGuideContent,
  snapshot: ReviewGuideSnapshot,
) {
  const expected = new Set(snapshot.files.map((file) => file.path));
  const covered = new Set<string>();
  const patches = splitUnifiedDiff(snapshot.diff);
  for (const stop of content.stops) {
    for (const path of stop.files) {
      if (!expected.has(path)) throw new Error(msg("forge.guideInvalid"));
      covered.add(path);
    }
    for (const excerpt of stop.excerpts) {
      if (
        !stop.files.includes(excerpt.path) ||
        reviewGuideExcerpt(patches, excerpt) !== excerpt.text
      )
        throw new Error(msg("forge.guideInvalid"));
    }
  }
  if (covered.size !== expected.size) throw new Error(msg("forge.guideInvalid"));
}

// Guides are shared by authorized readers on this host. No credential or login is persisted.
const documentSchema = z.object({
  version: z.literal(1),
  guides: z.record(z.string(), forgeReviewGuideSchema),
});

export class ForgeReviewGuideStore {
  private readonly jobs = new Map<string, "generating" | "failed">();
  private pending = Promise.resolve();

  constructor(private readonly path: string) {}

  private key(input: ForgeGetPrReviewGuidePayload) {
    return JSON.stringify([
      input.forgeAccount.forge,
      input.forgeAccount.host,
      input.forgeRepository,
      input.prNumber,
    ]);
  }

  private async read() {
    try {
      return documentSchema.parse(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { version: 1 as const, guides: {} as z.infer<typeof documentSchema>["guides"] };
      throw error;
    }
  }

  async get(
    input: ForgeGetPrReviewGuidePayload,
    fingerprint: string,
  ): Promise<ForgePrReviewGuideResult> {
    await this.pending;
    const key = this.key(input);
    const guide = (await this.read()).guides[key] ?? null;
    return {
      status: this.jobs.get(key) ?? (guide ? "ready" : "empty"),
      guide,
      stale: guide !== null && guide.fingerprint !== fingerprint,
    };
  }

  async start(
    input: ForgeGetPrReviewGuidePayload,
    snapshot: ReviewGuideSnapshot,
    model: string,
    generate: () => Promise<ForgeReviewGuideContent>,
  ): Promise<ForgePrReviewGuideResult> {
    const key = this.key(input);
    const fingerprint = reviewGuideFingerprint(snapshot);
    const previous = await this.get(input, fingerprint);
    if (this.jobs.get(key) === "generating") return previous;
    this.jobs.set(key, "generating");
    void (async () => {
      try {
        const content = await generate();
        validateReviewGuide(content, snapshot);
        const save = this.pending.then(async () => {
          const document = await this.read();
          document.guides[key] = {
            ...content,
            version: 1,
            fingerprint,
            createdAt: new Date().toISOString(),
            model,
          };
          await writeFileAtomicAsync(this.path, JSON.stringify(document), {
            encoding: "utf8",
            mode: 0o600,
          });
        });
        this.pending = save.catch(() => {});
        await save;
        this.jobs.delete(key);
      } catch {
        this.jobs.set(key, "failed");
      }
    })();
    return { ...previous, status: "generating" };
  }
}
