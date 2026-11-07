import {
  PR_REACTION_CONTENTS,
  type ForgeReviewDraftComment,
  type ForgeReviewerRef,
  type PrAuthor,
  type PrLabel,
  type PrReaction,
  type PrReviewDecision,
  type PrReviewer,
  type PrTimelineEvent,
} from "@/shared/contracts";
import type { ForgeApi } from "./api";
import { labelFrom, num, object, rows, str, type ApiObject } from "./types";

// Gitea/Forgejo API-v1 label, reviewer, reaction, timeline, and review payload mapping.

/** Title prefixes Gitea and Forgejo treat as work in progress by default. */
export const WIP_TITLE = /^(?:\[wip\]|wip:)\s*/i;
/** An operator can configure further prefixes such as "Draft:"; the host reports whether one matched. */
export const READY_TITLE = /^(?:\[wip\]|wip:|draft:)\s*/i;
/** The host's own draft flag wins over title prefixes, which only a default install shares. */
export function isDraft(pull: ApiObject): boolean {
  return typeof pull.draft === "boolean" ? pull.draft : WIP_TITLE.test(str(pull.title));
}
/** Repository labels are read in pages of this size, at most this many pages. */
const LABEL_PAGE = 50;
const LABEL_PAGES = 3;

/** Hosts clamp `limit`, so the first page's size is the real page size; a shorter page is last. */
export async function repoLabels(
  api: ForgeApi,
  repo: string,
): Promise<{ raw: ApiObject[]; truncated: boolean }> {
  const raw: ApiObject[] = [];
  let size = 0;
  for (let page = 1; ; page++) {
    const batch = rows(await api.value(`${repo}/labels?limit=${LABEL_PAGE}&page=${page}`));
    if (page > LABEL_PAGES) return { raw, truncated: batch.length > 0 };
    raw.push(...batch);
    size ||= batch.length;
    if (!batch.length || batch.length < size) return { raw, truncated: false };
  }
}

export function reviewEvent(decision: PrReviewDecision) {
  return decision === "approve"
    ? "APPROVED"
    : decision === "request-changes"
      ? "REQUEST_CHANGES"
      : "COMMENT";
}
/** Positions are file line numbers; a multi-line range anchors at its last line. */
export function draftComment(c: ForgeReviewDraftComment) {
  return {
    path: c.path,
    body: c.body,
    ...(c.side === "LEFT" ? { old_position: c.line } : { new_position: c.line }),
  };
}
export function reviewerBody(requested: ForgeReviewerRef[]) {
  return {
    reviewers: requested.filter((ref) => !ref.team).map((ref) => ref.id),
    team_reviewers: requested.filter((ref) => ref.team).map((ref) => ref.id),
  };
}

export function author(raw: unknown): PrAuthor {
  const r = object(raw);
  return { login: str(r.login), ...(str(r.avatar_url) ? { avatarUrl: str(r.avatar_url) } : {}) };
}

export function label(raw: unknown): PrLabel | undefined {
  return labelFrom(raw);
}
export function labels(raw: unknown): PrLabel[] {
  return rows(raw).flatMap((r) => label(r) ?? []);
}

/** `id` is the username or team name that `requested_reviewers` accepts. */
export function reviewer(raw: unknown): PrReviewer | undefined {
  const r = object(raw);
  const login = str(r.login);
  if (!login) return undefined;
  return {
    id: login,
    login,
    ...(str(r.full_name) ? { name: str(r.full_name) } : {}),
    ...(str(r.avatar_url) ? { avatarUrl: str(r.avatar_url) } : {}),
  };
}
export function teamReviewer(raw: unknown): PrReviewer | undefined {
  const name = str(object(raw).name);
  return name ? { id: name, login: name, team: true } : undefined;
}
/** A review row of this state is a pending review request, not a submitted review. */
export const REQUEST_ROW = "REQUEST_REVIEW";
/**
 * The host keeps listing a reviewer under `requested_reviewers` after they review. The review
 * rows say whether the newest row for that user or team is still the request.
 */
export function requestedReviewers(pull: ApiObject, reviewRows: ApiObject[]): PrReviewer[] {
  const latest = new Map<string, string>();
  for (const row of reviewRows.toSorted((a, b) => num(a.id) - num(b.id))) {
    const user = str(object(row.user).login);
    const team = str(object(row.team).name);
    if (user || team) latest.set(user ? `user:${user}` : `team:${team}`, str(row.state));
  }
  const pending = (key: string) => (latest.get(key) ?? REQUEST_ROW) === REQUEST_ROW;
  return [
    ...rows(pull.requested_reviewers).flatMap((r) =>
      pending(`user:${str(r.login)}`) ? (reviewer(r) ?? []) : [],
    ),
    ...rows(pull.requested_reviewers_teams).flatMap((r) =>
      pending(`team:${str(r.name)}`) ? (teamReviewer(r) ?? []) : [],
    ),
  ];
}

/** Gitea lists one row per user reaction; names outside the shared set are dropped. */
export function reactions(raw: ApiObject[], viewer: string | undefined): PrReaction[] {
  const totals = new Map<string, PrReaction>();
  for (const r of raw) {
    const content = str(r.content);
    if (!(PR_REACTION_CONTENTS as readonly string[]).includes(content)) continue;
    const total = totals.get(content) ?? { content, count: 0, viewerReacted: false };
    total.count++;
    if (viewer && str(object(r.user).login) === viewer) total.viewerReacted = true;
    totals.set(content, total);
  }
  return PR_REACTION_CONTENTS.flatMap((content) => totals.get(content) ?? []);
}

function refs(from: string | undefined, to: string | undefined) {
  return { ...(from ? { fromRef: from } : {}), ...(to ? { toRef: to } : {}) };
}

function timelineEvent(r: ApiObject): PrTimelineEvent | undefined {
  const id = num(r.id) ? String(num(r.id)) : str(r.id);
  if (!id) return undefined;
  const base = {
    id,
    createdAt: str(r.created_at),
    ...(str(object(r.user).login) ? { actor: author(r.user) } : {}),
  };
  switch (str(r.type)) {
    case "close":
      return { ...base, kind: "closed" };
    case "reopen":
      return { ...base, kind: "reopened" };
    case "merge_pull":
      return { ...base, kind: "merged" };
    case "label": {
      // Gitea stores "1" as the body of an added label and an empty body on removal.
      const value = label(r.label);
      return value
        ? { ...base, kind: str(r.body) === "1" ? "labeled" : "unlabeled", label: value }
        : undefined;
    }
    case "review_request": {
      const value = reviewer(r.assignee) ?? teamReviewer(r.assignee_team);
      return value
        ? {
            ...base,
            kind: r.removed_assignee === true ? "review-request-removed" : "review-requested",
            reviewer: value,
          }
        : undefined;
    }
    case "change_title": {
      const from = str(r.old_title),
        to = str(r.new_title);
      // A work-in-progress prefix toggle is how these hosts mark drafts.
      if (from.replace(WIP_TITLE, "") === to.replace(WIP_TITLE, "")) {
        const wasDraft = WIP_TITLE.test(from),
          nowDraft = WIP_TITLE.test(to);
        if (wasDraft !== nowDraft) return { ...base, kind: nowDraft ? "draft" : "ready" };
      }
      return { ...base, kind: "renamed", ...refs(from, to) };
    }
    case "change_target_branch":
      return { ...base, kind: "base-changed", ...refs(str(r.old_ref), str(r.new_ref)) };
    case "pull_push": {
      // Ordinary pushes are already listed as commits; only force pushes are events.
      let push: ApiObject;
      try {
        push = object(JSON.parse(str(r.body)));
      } catch {
        return undefined;
      }
      if (push.is_force_push !== true) return undefined;
      // A force push records exactly [old head, new head].
      const [from, to] = Array.isArray(push.commit_ids) ? push.commit_ids.map(str) : [];
      return { ...base, kind: "force-pushed", ...refs(from, to) };
    }
    default:
      // Comments, reviews, commit references, and bookkeeping rows (milestones,
      // assignees, time tracking) carry no host-authored text worth a system row.
      return undefined;
  }
}

/** The timeline feed never includes the opening itself, so it is prepended. */
export function timeline(raw: ApiObject[], opened: PrTimelineEvent[]): PrTimelineEvent[] {
  return [...opened, ...raw.flatMap((r) => timelineEvent(r) ?? [])];
}
