import { msg } from "@lingui/core/macro";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { i18n } from "@/renderer/i18n/i18n";
import { buildExperimentResponseTranscript } from "./experimentResponseTranscript";

/**
 * R1: the experiment judge reads candidate responses through the SAME bounded
 * runtime-items pages the transcript UI uses — never the unbounded raw
 * transcript read the generic passthrough used to misroute to the supervisor.
 * A walk that would exceed its page budget refuses typed, so judging can never
 * silently consume a truncated transcript as success; a completed walk that
 * genuinely finds zero chat messages builds the same empty response the local
 * read always produced (and the judged transcript carries the builder's own
 * explicit `[earlier chat truncated]` marker when the response exceeds the
 * prompt cap).
 */

const RESPONSE_PAGE_LIMIT = 500;
const RESPONSE_MAX_PAGES = 20;

export class ExperimentResponseTooLargeError extends Error {
  readonly threadId: string;

  constructor(threadId: string) {
    super(
      i18n._(
        msg`This candidate's response is too large to compare. Split the experiment or shorten the transcript.`,
      ),
    );
    this.name = "ExperimentResponseTooLargeError";
    this.threadId = threadId;
  }
}

export interface ExperimentRuntimeItemsPage {
  readonly items: readonly PersistedRuntimeItem[];
  readonly nextCursor: number | null;
}

export type ReadExperimentRuntimeItemsPage = (input: {
  readonly threadId: string;
  readonly limit: number;
  readonly beforePosition?: number;
}) => Promise<ExperimentRuntimeItemsPage>;

/** Pages one candidate thread newest→older to exhaustion and builds the
 * response transcript in the local read's ascending order. */
export async function readExperimentResponseTranscript(
  readPage: ReadExperimentRuntimeItemsPage,
  threadId: string,
): Promise<string> {
  const pages: PersistedRuntimeItem[][] = [];
  let beforePosition: number | undefined;
  do {
    if (pages.length >= RESPONSE_MAX_PAGES) {
      throw new ExperimentResponseTooLargeError(threadId);
    }
    const page = await readPage({
      threadId,
      limit: RESPONSE_PAGE_LIMIT,
      ...(beforePosition !== undefined ? { beforePosition } : {}),
    });
    pages.push([...page.items]);
    beforePosition = page.nextCursor ?? undefined;
  } while (beforePosition !== undefined);
  return buildExperimentResponseTranscript(pages.reverse().flat());
}
