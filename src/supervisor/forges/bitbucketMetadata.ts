import type {
  ForgeReviewDraftComment,
  PrAuthor,
  PrReviewer,
  PrTimelineEvent,
} from "@/shared/contracts";
import type { ForgeApi } from "./api";
import { lifecycleEvents, object, rows, str, type ApiObject } from "./types";

// Bitbucket Cloud user, reviewer, activity, and inline-anchor mapping. Bitbucket
// has no pull request labels or reactions. Its activity feed carries full pull
// request snapshots, so lifecycle events come from comparing consecutive ones.

export function author(raw: unknown): PrAuthor {
  const r = object(raw);
  return {
    login: str(r.uuid) || str(r.nickname) || str(r.display_name),
    ...(str(object(object(r.links).avatar).href)
      ? { avatarUrl: str(object(object(r.links).avatar).href) }
      : {}),
  };
}

/** The signed-in login is the account's username or uuid; pull request users carry nickname and uuid. */
export function isUser(raw: unknown, login: string | undefined): boolean {
  const r = object(raw);
  return Boolean(login) && [r.uuid, r.nickname, r.account_id, r.username].some((v) => v === login);
}

/** `id` is the braced uuid the pull request `reviewers` list takes. */
export function reviewer(raw: unknown): PrReviewer | undefined {
  const r = object(raw),
    id = str(r.uuid),
    avatar = str(object(object(r.links).avatar).href);
  if (!id) return undefined;
  return {
    id,
    login: str(r.nickname) || id,
    ...(str(r.display_name) ? { name: str(r.display_name) } : {}),
    ...(avatar ? { avatarUrl: avatar } : {}),
  };
}

/** Reviewers who have neither approved nor requested changes yet. */
export function outstandingReviewers(pr: ApiObject): ApiObject[] {
  const decided = new Set(
    rows(pr.participants)
      .filter((p) => p.approved === true || str(p.state))
      .map((p) => str(object(p.user).uuid)),
  );
  return rows(pr.reviewers).filter((r) => str(r.uuid) && !decided.has(str(r.uuid)));
}

/** Reads at most `pages` pages of a paginated `values` response. */
export async function boundedPages(
  api: ForgeApi,
  path: string,
  pages: number,
): Promise<{ values: ApiObject[]; truncated: boolean }> {
  const values: ApiObject[] = [];
  let next: string | undefined = path;
  for (let page = 0; next && page < pages; page++) {
    const body: ApiObject = await api.json(next);
    values.push(...rows(body.values));
    next = str(body.next) || undefined;
  }
  return { values, truncated: Boolean(next) };
}

const STATE_EVENTS: Record<string, string> = {
  MERGED: "merged",
  DECLINED: "closed",
  SUPERSEDED: "closed",
  OPEN: "reopened",
};
const branch = (side: unknown) => str(object(object(side).branch).name);

// Snapshot `author` is not documented as the acting user, so derived events carry
// no actor except the final merge or decline, which `closed_by` identifies.
function changes(before: ApiObject, after: ApiObject, index: number): PrTimelineEvent[] {
  const createdAt = str(after.date),
    events: PrTimelineEvent[] = [];
  const add = (kind: string, extra: Partial<PrTimelineEvent> = {}, key = "") =>
    events.push({ id: `activity-${index}-${kind}${key}`, kind, createdAt, ...extra });
  const [fromState, toState] = [str(before.state), str(after.state)];
  if (fromState && toState && fromState !== toState && STATE_EVENTS[toState])
    add(STATE_EVENTS[toState]);
  if (typeof before.draft === "boolean" && typeof after.draft === "boolean")
    if (before.draft !== after.draft) add(after.draft ? "draft" : "ready");
  const [fromTitle, toTitle] = [str(before.title), str(after.title)];
  if (fromTitle && toTitle && fromTitle !== toTitle)
    add("renamed", { fromRef: fromTitle, toRef: toTitle });
  const [fromBase, toBase] = [branch(before.destination), branch(after.destination)];
  if (fromBase && toBase && fromBase !== toBase)
    add("base-changed", { fromRef: fromBase, toRef: toBase });
  if (Array.isArray(before.reviewers) && Array.isArray(after.reviewers)) {
    const ids = (list: unknown) => new Set(rows(list).map((r) => str(r.uuid)));
    const [had, has] = [ids(before.reviewers), ids(after.reviewers)];
    for (const r of rows(after.reviewers)) {
      const value = reviewer(r);
      if (value && !had.has(value.id)) add("review-requested", { reviewer: value }, `-${value.id}`);
    }
    for (const r of rows(before.reviewers)) {
      const value = reviewer(r);
      if (value && !has.has(value.id))
        add("review-request-removed", { reviewer: value }, `-${value.id}`);
    }
  }
  return events;
}

/**
 * `activity` is the newest-first feed. Comments, approvals, and change requests
 * have their own arrays; only `update` snapshots become events.
 */
export function timeline(pr: ApiObject, activity: ApiObject[]): PrTimelineEvent[] {
  const events = lifecycleEvents({ createdAt: str(pr.created_on), author: author(pr.author) });
  const updates = activity
    .map((entry) => object(entry.update))
    .filter((u) => !Number.isNaN(Date.parse(str(u.date))))
    .reverse()
    .sort((a, b) => Date.parse(str(a.date)) - Date.parse(str(b.date)));
  updates.forEach((u, index) => {
    if (index) events.push(...changes(updates[index - 1]!, u, index));
  });
  const closer = author(pr.closed_by);
  const final = events.findLast((e) => e.kind === "merged" || e.kind === "closed");
  if (final && closer.login && STATE_EVENTS[str(pr.state)] === final.kind) final.actor = closer;
  return events;
}

/** Bitbucket anchors a RIGHT-side line with `to` and a LEFT-side line with `from`. */
export function inlineAnchor(comment: ForgeReviewDraftComment): ApiObject {
  const [line, start] = comment.side === "LEFT" ? ["from", "start_from"] : ["to", "start_to"];
  return {
    path: comment.path,
    [line]: comment.line,
    ...(comment.startLine !== undefined && comment.startLine < comment.line
      ? { [start]: comment.startLine }
      : {}),
  };
}
