import { msg } from "@/shared/messages";
import { randomUUID } from "node:crypto";
import {
  PR_REACTION_CONTENTS,
  type ForgePrLabelCandidatesResult,
  type ForgePrReviewerCandidatesResult,
  type ForgeReviewDraftComment,
  type ForgeReviewerRef,
  type PrAuthor,
  type PrLabel,
  type PrReaction,
  type PrReactionContent,
  type PrReviewDecision,
  type PrReviewer,
} from "@/shared/contracts";
import type { ForgeApi } from "./api";
import {
  assertHead,
  encodePath,
  labelFrom,
  num,
  object,
  requiredString,
  rows,
  str,
  type ApiObject,
} from "./types";

// GitCafe label, reviewer, reaction, draft-review, and single-commit diff
// operations. Every pull request write carries the read `expectedVersion`.

export function author(raw: unknown): PrAuthor {
  const r = object(raw);
  return {
    login: str(r.handle) || str(r.login) || str(r.actorId),
    ...(str(r.avatarUrl) ? { avatarUrl: str(r.avatarUrl) } : {}),
  };
}

export function labels(raw: unknown): PrLabel[] {
  return rows(raw).flatMap((r) => {
    const label = labelFrom(r);
    return label ? [label] : [];
  });
}

/** An assignment actor; `id` is the actor id that the reviewer list accepts. */
function reviewer(raw: ApiObject): PrReviewer | undefined {
  const actor = object(raw.actor);
  const id = str(raw.id) || str(actor.actorId);
  const login = str(raw.handle) || author(actor).login;
  if (!id || !login) return undefined;
  const name = str(raw.displayName) || str(actor.displayName),
    avatarUrl = str(raw.avatarUrl) || str(actor.avatarUrl);
  return { id, login, ...(name ? { name } : {}), ...(avatarUrl ? { avatarUrl } : {}) };
}

/** Reviewers stay listed after reviewing; only those without a live review are outstanding. */
export function requestedReviewers(raw: ApiObject[]): PrReviewer[] {
  return raw
    .filter((r) => !r.latestReview || Boolean(object(r.latestReview).dismissedAt))
    .flatMap((r) => reviewer(r) ?? []);
}

const EMOJI: Record<PrReactionContent, string> = {
  "+1": "\u{1F44D}",
  "-1": "\u{1F44E}",
  laugh: "\u{1F604}",
  hooray: "\u{1F389}",
  confused: "\u{1F615}",
  heart: "\u{2764}\u{FE0F}",
  rocket: "\u{1F680}",
  eyes: "\u{1F440}",
};
/** Variation selectors and skin tones do not change which reaction an emoji is. */
const bareEmoji = (value: string) => value.replace(/\u{FE0F}|\p{Emoji_Modifier}/gu, "");
function reactionContent(emoji: unknown): PrReactionContent | undefined {
  const e = object(emoji);
  if (e.kind !== "unicode") return undefined;
  const value = bareEmoji(str(e.value));
  return PR_REACTION_CONTENTS.find((content) => bareEmoji(EMOJI[content]) === value);
}
/** The reaction list belongs to one pull request, so its own subject needs no id. */
function subjectKey(subject: unknown): string {
  const s = object(subject);
  if (s.kind === "pull_request") return "";
  return s.kind === "pull_request_comment" ? str(s.id) : "-";
}

/** Reactions keyed by comment id; the description is keyed by `""`. */
export function reactionsBySubject(raw: ApiObject[]): Map<string, PrReaction[]> {
  const totals = new Map<string, Map<PrReactionContent, PrReaction>>();
  for (const r of raw) {
    const content = reactionContent(r.emoji);
    if (!content) continue;
    const key = subjectKey(r.subject);
    const subject = totals.get(key) ?? new Map<PrReactionContent, PrReaction>();
    const total = subject.get(content) ?? { content, count: 0, viewerReacted: false };
    total.count += num(r.count);
    if (str(r.viewerReactionId)) total.viewerReacted = true;
    subject.set(content, total);
    totals.set(key, subject);
  }
  return new Map(
    [...totals].map(([key, subject]) => [
      key,
      PR_REACTION_CONTENTS.flatMap((content) => subject.get(content) ?? []),
    ]),
  );
}

/** Renders one GitCafe file comparison as a git patch. */
export function filePatch(f: ApiObject, path: string): string {
  if (f.tooLarge === true || f.hunksOmitted === true) throw new Error(msg("forge.diffUnavailable"));
  const a = JSON.stringify(`a/${str(f.oldPath) || path}`),
    b = JSON.stringify(`b/${path}`);
  if (f.binary === true) return `diff --git ${a} ${b}\nBinary files ${a} and ${b} differ\n`;
  const hunks = rows(f.hunks)
    .map(
      (h) =>
        `@@ -${num(h.oldStart)},${num(h.oldLines)} +${num(h.newStart)},${num(h.newLines)} @@\n${rows(
          h.lines,
        )
          .map(
            (l) => `${str(l.origin)}${str(l.content)}${str(l.content).endsWith("\n") ? "" : "\n"}`,
          )
          .join("")}`,
    )
    .join("");
  return `diff --git ${a} ${b}\n--- ${f.status === "added" ? "/dev/null" : a}\n+++ ${f.status === "deleted" ? "/dev/null" : b}\n${hunks}`;
}

const PAGE_LIMIT = 3,
  MAX_REVIEWERS = 50,
  COMPARE_FILES = 64;

export class GitCafeMetadata {
  constructor(
    private readonly api: ForgeApi,
    private readonly repo: string,
  ) {}
  private path(number: number) {
    return `${this.repo}/pulls/${number}`;
  }
  /** At most `PAGE_LIMIT` cursor pages; `truncated` when the host has more. */
  private async pages(path: string) {
    const items: ApiObject[] = [];
    let after = "";
    for (let page = 0; page < PAGE_LIMIT; page++) {
      const r = await this.api.json(after ? `${path}&after=${encodeURIComponent(after)}` : path);
      items.push(...rows(r.items));
      after = str(r.next);
      if (!after) return { items, truncated: false };
    }
    return { items, truncated: true };
  }
  private currentLabels(number: number) {
    return this.api.list(`${this.path(number)}/labels?limit=100`, "items");
  }
  private reviewers(number: number) {
    return this.api.list(`${this.path(number)}/reviewers?limit=100`, "items");
  }
  private reactions(number: number) {
    return this.api.list(`${this.path(number)}/reactions/?limit=100`, "items");
  }

  /** Optional `details()` reads; each failed read leaves its field absent. */
  async read(number: number) {
    const optional = <T>(read: Promise<T>) => read.catch(() => undefined);
    const [labelRows, reviewerRows, reactionRows] = await Promise.all([
      optional(this.currentLabels(number)),
      optional(this.reviewers(number)),
      optional(this.reactions(number)),
    ]);
    return {
      ...(labelRows ? { labels: labels(labelRows) } : {}),
      ...(reviewerRows ? { requestedReviewers: requestedReviewers(reviewerRows) } : {}),
      ...(reactionRows ? { reactions: reactionsBySubject(reactionRows) } : {}),
    };
  }

  async labelCandidates(): Promise<ForgePrLabelCandidatesResult> {
    const { items, truncated } = await this.pages(`${this.repo}/labels?limit=100`);
    return { labels: labels(items), truncated };
  }
  async setLabels(number: number, add: string[], remove: string[]) {
    const [r, current, repository] = await Promise.all([
      this.api.json(this.path(number)),
      this.currentLabels(number),
      this.api.list(`${this.repo}/labels?limit=100`, "items"),
    ]);
    const ids = new Set(current.filter((l) => !remove.includes(str(l.name))).map((l) => str(l.id)));
    for (const name of add) {
      const found = repository.find((l) => str(l.name) === name);
      // A name the repository does not define is a stale client list, never a skip.
      if (!found) throw new Error(msg("forge.labelUnknown"));
      ids.add(requiredString(found.id));
    }
    await this.api.json(`${this.path(number)}/labels`, "PUT", {
      expectedVersion: num(r.version),
      labelIds: [...ids],
    });
  }

  /** Assignee candidates are the host's list of actors who may act on this review. */
  async reviewerCandidates(
    number: number,
    query?: string,
  ): Promise<ForgePrReviewerCandidatesResult> {
    const { items, truncated } = await this.pages(
      `${this.path(number)}/assignee-candidates?limit=100`,
    );
    const needle = query?.toLowerCase();
    const matches = items
      .flatMap((r) => reviewer(r) ?? [])
      .filter(
        (r) =>
          !needle ||
          r.login.toLowerCase().includes(needle) ||
          Boolean(r.name?.toLowerCase().includes(needle)),
      );
    return {
      reviewers: matches.slice(0, MAX_REVIEWERS),
      truncated: truncated || matches.length > MAX_REVIEWERS,
    };
  }
  /** The host replaces the whole reviewer set, so reviewers who already reviewed are kept. */
  async requestReviewers(number: number, add: ForgeReviewerRef[], remove: ForgeReviewerRef[]) {
    const [r, current] = await Promise.all([
      this.api.json(this.path(number)),
      this.reviewers(number),
    ]);
    const removed = new Set(remove.map((ref) => ref.id));
    const ids = new Set(current.map((c) => str(c.id)).filter((id) => id && !removed.has(id)));
    for (const ref of add) ids.add(ref.id);
    await this.api.json(`${this.path(number)}/reviewers`, "PUT", {
      expectedVersion: num(r.version),
      actorIds: [...ids],
    });
  }

  async react(number: number, subjectId: string | undefined, content: string, reacted: boolean) {
    const reaction = (PR_REACTION_CONTENTS as readonly string[]).includes(content)
      ? (content as PrReactionContent)
      : undefined;
    if (!reaction) throw new Error(msg("forge.responseInvalid"));
    const path = `${this.path(number)}/reactions/`;
    if (reacted) {
      const subject = subjectId
        ? { kind: "pull_request_comment", id: subjectId }
        : { kind: "pull_request", id: requiredString((await this.api.json(this.path(number))).id) };
      await this.api.json(path, "POST", {
        subject,
        emoji: { kind: "unicode", value: EMOJI[reaction] },
      });
      return;
    }
    // Removal needs the viewer's own reaction id, which only the list reports.
    const own = (await this.reactions(number)).filter(
      (r) =>
        subjectKey(r.subject) === (subjectId ?? "") &&
        reactionContent(r.emoji) === reaction &&
        str(r.viewerReactionId),
    );
    for (const r of own)
      await this.api.json(`${path}${encodeURIComponent(str(r.viewerReactionId))}`, "DELETE");
  }

  /**
   * Saves the viewer's review draft pinned to `headSha`, adds every comment, and
   * publishes it with the decision in one review. Nothing is visible to others
   * until the publish succeeds; a draft this call wrote is discarded on failure.
   */
  async submitDraft(
    number: number,
    input: {
      decision: PrReviewDecision;
      body: string;
      headSha: string;
      comments: ForgeReviewDraftComment[];
    },
  ) {
    const path = this.path(number);
    const [r, status, saved] = await Promise.all([
      this.api.json(path),
      this.api.json(`${path}/status`),
      this.api.json(`${path}/review-draft/`),
    ]);
    const existing = object(saved.draft);
    // A host draft with its own comments was started elsewhere; publishing it
    // would post comments this review never showed.
    if (rows(existing.comments).length) throw new Error(msg("forge.reviewDraftExists"));
    const commitOid = assertHead(str(r.headOid), input.headSha),
      verdict = input.decision === "request-changes" ? "request_changes" : input.decision,
      pullVersion = num(r.version);
    const draft = await this.api.json(`${path}/review-draft/`, "PUT", {
      expected: str(existing.id) ? { id: str(existing.id), version: num(existing.version) } : null,
      verdict,
      body: input.body,
      commitOid,
      baseOid: assertHead(str(status.baseOid)),
      expectedPullVersion: pullVersion,
    });
    let expected = { id: requiredString(draft.id), version: num(draft.version) };
    try {
      for (const c of input.comments) {
        const side = c.side === "LEFT" ? "left" : "right";
        const added = await this.api.json(`${path}/review-draft/comments`, "POST", {
          body: c.body,
          path: c.path,
          subjectType: "line",
          line: c.line,
          side,
          ...(c.startLine !== undefined ? { startLine: c.startLine, startSide: side } : {}),
          commitOid,
          expected,
        });
        const next = object(added.draft);
        expected = { id: requiredString(next.id), version: num(next.version) };
      }
      await this.api.json(`${path}/reviews`, "POST", {
        verdict,
        body: input.body,
        commitOid,
        expectedVersion: pullVersion,
        draft: expected,
        requestId: randomUUID(),
      });
    } catch (error) {
      await this.api.json(`${path}/review-draft/`, "DELETE", { expected }).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Compares the commit with its first parent. A cross-fork review's commits live
   * in the source repository, which the comparison reads instead.
   */
  async commitDiff(number: number, oid: string) {
    const r = await this.api.json(this.path(number));
    const fork = object(r.sourceRepo);
    const repo =
      r.isCrossFork === true && str(fork.owner) && str(fork.name)
        ? `repos/${encodePath(`${str(fork.owner)}/${str(fork.name)}`)}`
        : this.repo;
    const commit = await this.api.json(`${repo}/commit?${new URLSearchParams({ oid })}`);
    const parent = Array.isArray(commit.parents) ? str(commit.parents[0]) : "";
    // A root commit has no parent to compare against.
    if (!parent) throw new Error(msg("forge.diffUnavailable"));
    const range = { base: parent, baseOid: parent, head: oid, headOid: oid };
    const files = await this.api.list(
      `${repo}/compare?${new URLSearchParams({ ...range, limit: "500" })}`,
      "items",
    );
    const patches = new Map<string, ApiObject>();
    for (let i = 0; i < files.length; i += COMPARE_FILES) {
      const result = await this.api.json(`${repo}/compare/files`, "POST", {
        ...range,
        paths: files.slice(i, i + COMPARE_FILES).map((f) => str(f.path)),
      });
      for (const f of rows(result.items)) patches.set(str(f.path), f);
    }
    return files
      .map((f) => {
        const path = str(f.path),
          patch = patches.get(path);
        if (!patch) throw new Error(msg("forge.diffUnavailable"));
        return filePatch(patch, path);
      })
      .join("");
  }
}
