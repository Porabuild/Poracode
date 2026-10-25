import { msg } from "@/shared/messages";
import type {
  ForgeEditPrPayload,
  ForgeEditPrCommentPayload,
  ForgePrLabelCandidatesResult,
  ForgePrReviewerCandidatesResult,
  ForgeRepository,
  ForgeReviewDraftComment,
  ForgeReviewerRef,
  GhCreatePrPayload,
  GhGetPrDetailsResult,
  PrAuthor,
  PrCheck,
  PrComment,
  PrData,
  PrFile,
  PrLabel,
  PrMergeMethod,
  PrReviewDecision,
  PrReviewThread,
  PrTimelineEvent,
  PullRequestSummary,
} from "@/shared/contracts";

/** Bound to one repository and one credential. Failed actions never change either. */
export interface ForgeReviewAdapter {
  source: ForgeRepository;
  list(state: "open" | "all" | "closed" | "merged", branch?: string): Promise<PullRequestSummary[]>;
  details(number: number): Promise<GhGetPrDetailsResult>;
  files(number: number): Promise<PrFile[]>;
  diff(number: number): Promise<string>;
  checks(number: number): Promise<PrCheck[]>;
  threads(number: number): Promise<PrReviewThread[]>;
  create(input: GhCreatePrPayload): Promise<PrData>;
  edit(input: ForgeEditPrPayload): Promise<void>;
  comment(number: number, body: string): Promise<PrComment>;
  editComment?(input: ForgeEditPrCommentPayload): Promise<void>;
  review(number: number, decision: PrReviewDecision, body: string): Promise<void>;
  merge(number: number, method: PrMergeMethod, expectedHeadSha?: string): Promise<void>;
  setState(number: number, state: "closed" | "open" | "ready" | "draft"): Promise<void>;
  updateBranch(number: number, rebase: boolean): Promise<void>;
  // Optional operations; the service checks the matching capability before calling.
  labelCandidates?(): Promise<ForgePrLabelCandidatesResult>;
  setLabels?(number: number, add: string[], remove: string[]): Promise<void>;
  reviewerCandidates?(number: number, query?: string): Promise<ForgePrReviewerCandidatesResult>;
  requestReviewers?(
    number: number,
    add: ForgeReviewerRef[],
    remove: ForgeReviewerRef[],
  ): Promise<void>;
  commitDiff?(number: number, commit: string): Promise<string>;
  /** `subjectId` is a comment id; absent reacts to the review description. */
  react?(
    number: number,
    subjectId: string | undefined,
    content: string,
    reacted: boolean,
  ): Promise<void>;
  /** Anchors are on `headSha`, which the service has already confirmed is current. */
  submitDraft?(
    number: number,
    input: {
      decision: PrReviewDecision;
      body: string;
      headSha: string;
      comments: ForgeReviewDraftComment[];
    },
  ): Promise<void>;
}

export type ApiObject = Record<string, unknown>;
export function object(value: unknown): ApiObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ApiObject) : {};
}
export function rows(value: unknown): ApiObject[] {
  return Array.isArray(value) ? value.map(object) : [];
}
export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
export function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
export function requiredString(value: unknown): string {
  const result = str(value);
  if (!result) throw new Error(msg("forge.responseInvalid"));
  return result;
}
export function requiredNumber(value: unknown): number {
  const result = num(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new Error(msg("forge.responseInvalid"));
  return result;
}
export function encodePath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

export function normalizedCheck(name: string, status: string, url?: string): PrCheck {
  const value = status.toLowerCase();
  const conclusion = ["success", "successful", "succeeded", "passed", "approved"].includes(value)
    ? "SUCCESS"
    : ["failure", "failed", "error", "errored", "rejected", "broken"].includes(value)
      ? "FAILURE"
      : ["cancelled", "canceled", "stopped"].includes(value)
        ? "CANCELLED"
        : ["skipped", "not_applicable"].includes(value)
          ? "SKIPPED"
          : "";
  return { name, state: conclusion ? "COMPLETED" : "PENDING", conclusion, ...(url ? { url } : {}) };
}
export function checksStatus(checks: PrCheck[]): string | undefined {
  if (!checks.length) return undefined;
  if (checks.some((c) => ["FAILURE", "CANCELLED"].includes(c.conclusion))) return "FAILURE";
  return checks.some((c) => c.state !== "COMPLETED") ? "PENDING" : "SUCCESS";
}
export function assertHead(actual: string | undefined, expected?: string): string {
  if (!actual || (expected && actual.toLowerCase() !== expected.toLowerCase())) {
    throw new Error(msg("forge.headChanged"));
  }
  return actual;
}
/** Host label colors arrive as `#rrggbb`, `rrggbb`, or not at all; anything else is dropped. */
export function labelColor(value: unknown): string | undefined {
  const color = str(value).replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : undefined;
}

/** Maps one host label row (`{ name, color, description }`) to `PrLabel`. */
export function labelFrom(raw: unknown): PrLabel | undefined {
  const r = object(raw);
  const name = str(r.name);
  if (!name) return undefined;
  const color = labelColor(r.color);
  return {
    name,
    ...(color ? { color } : {}),
    ...(str(r.description) ? { description: str(r.description) } : {}),
  };
}

/**
 * Lifecycle events derived from review timestamps, for hosts without an event
 * feed. A host with real events uses those instead of this fallback.
 */
export function lifecycleEvents(details: {
  createdAt?: string | undefined;
  author?: PrAuthor | undefined;
  mergedAt?: string | null | undefined;
  mergedBy?: PrAuthor | null | undefined;
  closedAt?: string | null | undefined;
}): PrTimelineEvent[] {
  const events: PrTimelineEvent[] = [];
  if (details.createdAt)
    events.push({
      id: "opened",
      kind: "opened",
      createdAt: details.createdAt,
      ...(details.author ? { actor: details.author } : {}),
    });
  if (details.mergedAt)
    events.push({
      id: "merged",
      kind: "merged",
      createdAt: details.mergedAt,
      ...(details.mergedBy ? { actor: details.mergedBy } : {}),
    });
  else if (details.closedAt)
    events.push({ id: "closed", kind: "closed", createdAt: details.closedAt });
  return events;
}

export function unsupported(source: ForgeRepository): never {
  throw new Error(msg("forge.unsupported", { forge: source.forge }));
}
