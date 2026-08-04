import type { PrComment, PrReviewThread } from "@/shared/contracts";
import { mapPrComment } from "./githubMappers";

export const PR_REVIEW_THREADS_QUERY = `
  query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $endCursor) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            comments(first: 100) {
              nodes {
                id
                author { login avatarUrl }
                body
                createdAt
                url
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

export function parsePrReviewThreads(output: string): PrReviewThread[] {
  return output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => mapPrReviewThread(JSON.parse(line)))
    .filter((thread): thread is PrReviewThread => thread !== null);
}

function mapPrReviewThread(raw: unknown): PrReviewThread | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id : "";
  if (!id) return null;
  const commentsValue =
    value.comments && typeof value.comments === "object"
      ? (value.comments as Record<string, unknown>)
      : {};
  const comments = Array.isArray(commentsValue.nodes)
    ? commentsValue.nodes
        .map(mapPrComment)
        .filter((comment): comment is PrComment => comment !== null)
    : [];
  return {
    id,
    isResolved: value.isResolved === true,
    isOutdated: value.isOutdated === true,
    ...(typeof value.path === "string" ? { path: value.path } : {}),
    ...(typeof value.line === "number" ? { line: value.line } : {}),
    comments,
  };
}
