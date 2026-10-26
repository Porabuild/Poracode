import { msg } from "@/shared/messages";
import type {
  ForgePrLabelCandidatesResult,
  ForgePrReviewerCandidatesResult,
  ForgeRepository,
  ForgeReviewDraftComment,
  ForgeReviewerRef,
  PrLabel,
  PrReviewDecision,
} from "@/shared/contracts";
import { ForgeHttpError, type ForgeApi } from "./api";
import {
  GITLAB_AWARDS,
  gitlabAuthor,
  gitlabLabel,
  gitlabLabels,
  gitlabLinePosition,
  gitlabReviewers,
} from "./gitlabMetadata";
import {
  object,
  requiredNumber,
  requiredString,
  rows,
  str,
  unsupported,
  type ApiObject,
} from "./types";

// GitLab label, reviewer, award emoji, and draft-review writes for `GitLabReview`.

/** `project` is `projects/{id}`; `review` is that project's `merge_requests/{iid}` path. */
export interface GitLabTarget {
  api: ForgeApi;
  source: ForgeRepository;
  project: string;
  review: string;
}

const LABEL_PAGES = 3;
const REVIEWER_LIMIT = 50;

export async function gitlabLabelCandidates({
  api,
  project,
}: GitLabTarget): Promise<ForgePrLabelCandidatesResult> {
  const labels: PrLabel[] = [];
  const page = (n: number, size = 100) =>
    api.value(`${project}/labels?per_page=${size}&page=${n}&with_counts=false`);
  for (let n = 1; n <= LABEL_PAGES; n++) {
    const batch = rows(await page(n));
    labels.push(...gitlabLabels(batch));
    if (batch.length < 100) return { labels, truncated: false };
  }
  // A one-row probe past the bound tells whether more labels exist.
  return { labels, truncated: rows(await page(LABEL_PAGES * 100 + 1, 1)).length > 0 };
}

export async function gitlabSetLabels(
  { api, project, review }: GitLabTarget,
  add: string[],
  remove: string[],
) {
  // GitLab creates unknown names passed to `add_labels` and splits names on commas.
  if ([...add, ...remove].some((name) => name.includes(",")))
    throw new Error(msg("forge.labelUnknown"));
  const known = await Promise.all(
    add.map((name) =>
      api
        .json(`${project}/labels/${encodeURIComponent(name)}`)
        .then((label) => gitlabLabel(label)?.name === name)
        .catch((error: unknown) => {
          if (error instanceof ForgeHttpError && error.status === 404) return false;
          throw error;
        }),
    ),
  );
  if (known.includes(false)) throw new Error(msg("forge.labelUnknown"));
  await api.json(review, "PUT", {
    ...(add.length ? { add_labels: add.join(",") } : {}),
    ...(remove.length ? { remove_labels: remove.join(",") } : {}),
  });
}

export async function gitlabReviewerCandidates(
  { api, project }: GitLabTarget,
  query?: string,
): Promise<ForgePrReviewerCandidatesResult> {
  // One extra row reveals whether the bounded read was truncated.
  const q = new URLSearchParams({
    per_page: String(REVIEWER_LIMIT + 1),
    ...(query ? { query } : {}),
  });
  const members = rows(await api.value(`${project}/members/all?${q}`));
  return {
    reviewers: gitlabReviewers(
      members.slice(0, REVIEWER_LIMIT).filter((m) => !str(m.state) || str(m.state) === "active"),
    ),
    truncated: members.length > REVIEWER_LIMIT,
  };
}

export async function gitlabRequestReviewers(
  { api, source, review }: GitLabTarget,
  add: ForgeReviewerRef[],
  remove: ForgeReviewerRef[],
) {
  // GitLab has no group reviewers, and `reviewer_ids` replaces the whole list.
  if ([...add, ...remove].some((ref) => ref.team)) unsupported(source);
  const id = (value: string) => {
    if (!/^\d+$/.test(value)) throw new Error(msg("forge.responseInvalid"));
    return requiredNumber(Number(value));
  };
  const r = await api.json(review);
  // `reviewer_ids` replaces the whole list, so keep every current id — even rows
  // that carry no display name — rather than silently un-requesting them.
  const ids = new Set(
    rows(r.reviewers).map((row) => {
      const rowId = row.id;
      if (typeof rowId !== "number" || !Number.isFinite(rowId)) {
        throw new Error(msg("forge.responseInvalid"));
      }
      return rowId;
    }),
  );
  for (const ref of add) ids.add(id(ref.id));
  for (const ref of remove) ids.delete(id(ref.id));
  await api.json(review, "PUT", { reviewer_ids: [...ids] });
}

export async function gitlabReact(
  { api, source, review }: GitLabTarget,
  subjectId: string | undefined,
  content: string,
  reacted: boolean,
) {
  const name = GITLAB_AWARDS.get(content);
  if (!name) unsupported(source);
  const base = `${review}${subjectId ? `/notes/${encodeURIComponent(subjectId)}` : ""}/award_emoji`;
  const own = (await api.list(`${base}?per_page=100`)).find(
    (award) => str(award.name) === name && gitlabAuthor(award.user).login === source.account?.login,
  );
  if (reacted && !own) await api.json(base, "POST", { name });
  if (!reacted && own) await api.json(`${base}/${requiredNumber(own.id)}`, "DELETE");
}

/**
 * Creates one draft note per comment (and the body as a general draft note), then
 * approves, then publishes the drafts together. A failure before anything becomes
 * visible deletes the drafts this call created and rethrows.
 */
export async function gitlabSubmitDraft(
  { api, source, review }: GitLabTarget,
  input: {
    decision: PrReviewDecision;
    body: string;
    headSha: string;
    comments: ForgeReviewDraftComment[];
  },
) {
  if (input.decision === "request-changes") unsupported(source);
  const drafts = `${review}/draft_notes`;
  const [r, diffs, existing] = await Promise.all([
    api.json(review),
    // File diffs supply renamed paths and context-line numbers; without them a
    // comment anchors on its own side only.
    api.list(`${review}/diffs?per_page=100`).catch((): ApiObject[] => []),
    api.list(`${drafts}?per_page=100`),
  ]);
  const refs = object(r.diff_refs);
  if (str(refs.head_sha).toLowerCase() !== input.headSha.toLowerCase())
    throw new Error(msg("forge.reviewHeadChanged"));
  const shas = {
    base_sha: requiredString(refs.base_sha),
    start_sha: requiredString(refs.start_sha),
    head_sha: str(refs.head_sha),
  };
  const notes = [
    ...(input.body.trim() ? [{ note: input.body }] : []),
    ...input.comments.map((c) => {
      const file =
        diffs.find((d) => str(d.new_path) === c.path) ??
        diffs.find((d) => str(d.old_path) === c.path);
      // A multi-line range anchors on its last line: `line_range` needs GitLab line codes.
      return {
        note: c.body,
        position: {
          position_type: "text",
          ...shas,
          old_path: str(file?.old_path) || c.path,
          new_path: str(file?.new_path) || c.path,
          ...gitlabLinePosition(str(file?.diff), c.side, c.line),
        },
      };
    }),
  ];
  const created: number[] = [];
  const discard = (ids: number[]) =>
    Promise.allSettled(ids.map((id) => api.json(`${drafts}/${id}`, "DELETE")));
  const approved = input.decision === "approve";
  try {
    for (const note of notes)
      created.push(requiredNumber((await api.json(drafts, "POST", note)).id));
    if (approved) await api.json(`${review}/approve`, "POST", { sha: input.headSha });
  } catch (error) {
    await discard(created);
    throw error;
  }
  // Bulk publish also publishes the viewer's unrelated drafts; when any exist,
  // this review's drafts are published one by one instead.
  if (!existing.length) {
    try {
      await api.json(`${drafts}/bulk_publish`, "POST");
    } catch (error) {
      await discard(created);
      if (approved) throw new Error(msg("forge.reviewDraftPartial"), { cause: error });
      throw error;
    }
    return;
  }
  for (const [index, id] of created.entries()) {
    try {
      await api.json(`${drafts}/${id}/publish`, "PUT");
    } catch (error) {
      await discard(created.slice(index));
      if (index === 0 && !approved) throw error;
      throw new Error(msg("forge.reviewDraftPartial"), { cause: error });
    }
  }
}
