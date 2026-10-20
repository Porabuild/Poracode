import { msg } from "@/shared/messages";
import type {
  ForgeEditPrPayload,
  ForgeEditPrCommentPayload,
  ForgeRepository,
  GhCreatePrPayload,
  GhGetPrDetailsResult,
  PrCheck,
  PrComment,
  PrData,
  PrFile,
  PrMergeMethod,
  PrReviewDecision,
  PrReviewThread,
  PullRequestSummary,
} from "@/shared/contracts";

/** Bound to one repository and one credential. Failed actions never change either. */
export interface ForgeReviewAdapter {
  source: ForgeRepository;
  list(state: "open" | "all", branch?: string): Promise<PullRequestSummary[]>;
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
  setState(number: number, state: "closed" | "open" | "ready"): Promise<void>;
  updateBranch(number: number, rebase: boolean): Promise<void>;
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
export function unsupported(source: ForgeRepository): never {
  throw new Error(msg("forge.unsupported", { forge: source.forge }));
}
