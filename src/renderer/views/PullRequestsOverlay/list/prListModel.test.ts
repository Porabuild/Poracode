import { describe, expect, it } from "vitest";
import type { Project, PullRequestSummary } from "@/shared/contracts";
import {
  DEFAULT_PR_LIST_FILTERS,
  filterAndSortEntries,
  findReferencedEntry,
  groupEntries,
  labelUsage,
  mergeReadinessRank,
  parsePrQuery,
  pullRequestKey,
  type PullRequestEntry,
} from "./prListModel";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "posix", path: "/work/poracode" },
  createdAt: "2026-07-13T10:00:00.000Z",
};

function entry(
  number: number,
  overrides: {
    pr?: Partial<PullRequestSummary["pr"]>;
    summary?: Partial<Omit<PullRequestSummary, "pr">>;
    project?: Project;
  } = {},
): PullRequestEntry {
  return {
    project: overrides.project ?? project,
    summary: {
      pr: {
        number,
        state: "open",
        title: `Change ${number}`,
        url: `https://github.com/example/poracode/pull/${number}`,
        baseBranch: "master",
        isDraft: false,
        viewerDidAuthor: false,
        updatedAt: `2026-07-${String(10 + number).padStart(2, "0")}T10:00:00.000Z`,
        ...overrides.pr,
      },
      headBranch: `change-${number}`,
      author: { login: "reviewer" },
      additions: number * 10,
      deletions: number,
      repository: "example/poracode",
      reviewRequested: false,
      ...overrides.summary,
    },
  };
}

const filters = DEFAULT_PR_LIST_FILTERS;
const accountKey = () => undefined;
const run = (entries: PullRequestEntry[], query = "", sort: "updated" | "readiness" = "updated") =>
  filterAndSortEntries(entries, { query, filters, sort, accountKey }).map(
    (item) => item.summary.pr.number,
  );

describe("parsePrQuery", () => {
  it("splits qualifiers from free text and keeps quoted values together", () => {
    expect(parsePrQuery('fix label:"needs review" author:@Leon is:draft label:bug')).toEqual({
      text: ["fix"],
      labels: ["needs review", "bug"],
      authors: ["leon"],
      draft: true,
    });
  });

  it("treats unknown qualifiers as text", () => {
    expect(parsePrQuery("repo:poracode")).toMatchObject({ text: ["repo:poracode"] });
  });
});

describe("filterAndSortEntries", () => {
  const entries = [
    entry(1, { summary: { labels: [{ name: "bug" }], author: { login: "ada" } } }),
    entry(2, { pr: { isDraft: true }, summary: { labels: [{ name: "feature" }] } }),
    entry(3, { pr: { reviewDecision: "APPROVED", checksStatus: "SUCCESS" } }),
  ];

  it("sorts by recency by default, newest first", () => {
    expect(run(entries)).toEqual([3, 2, 1]);
  });

  it("sorts by merge readiness, then recency", () => {
    expect(run(entries, "", "readiness")).toEqual([3, 1, 2]);
  });

  it("matches text across title, branch, author, labels and number", () => {
    expect(run(entries, "ada")).toEqual([1]);
    expect(run(entries, "change-2")).toEqual([2]);
    expect(run(entries, "#3")).toEqual([3]);
    expect(run(entries, "feature")).toEqual([2]);
  });

  it("applies qualifiers and structured filters together", () => {
    expect(run(entries, "label:bug")).toEqual([1]);
    expect(run(entries, "author:ada")).toEqual([1]);
    expect(run(entries, "is:draft")).toEqual([2]);
    expect(
      filterAndSortEntries(entries, {
        query: "",
        filters: { ...filters, review: "approved" },
        sort: "updated",
        accountKey,
      }).map((item) => item.summary.pr.number),
    ).toEqual([3]);
    expect(
      filterAndSortEntries(entries, {
        query: "",
        filters: { ...filters, hiddenProjectIds: new Set([project.id]) },
        sort: "updated",
        accountKey,
      }),
    ).toEqual([]);
  });
});

describe("mergeReadinessRank", () => {
  it("puts mergeable reviews first and finished or draft reviews last", () => {
    const rank = (pr: Partial<PullRequestSummary["pr"]>) =>
      mergeReadinessRank(entry(1, { pr }).summary);
    expect(rank({ mergeStateStatus: "CLEAN" })).toBeLessThan(rank({ checksStatus: "PENDING" }));
    expect(rank({ checksStatus: "FAILURE" })).toBeLessThan(rank({ mergeable: "CONFLICTING" }));
    expect(rank({ isDraft: true })).toBeLessThan(rank({ state: "merged" }));
  });
});

describe("groupEntries", () => {
  it("separates authored, review-requested and other reviews", () => {
    const groups = groupEntries([
      entry(1, { pr: { viewerDidAuthor: true } }),
      entry(2, { summary: { reviewRequested: true } }),
      entry(3),
    ]);
    expect(groups.authored.map((item) => item.summary.pr.number)).toEqual([1]);
    expect(groups.reviewing.map((item) => item.summary.pr.number)).toEqual([2]);
    expect(groups.others.map((item) => item.summary.pr.number)).toEqual([3]);
  });
});

describe("labelUsage", () => {
  it("counts labels across rows, most used first", () => {
    expect(
      labelUsage([
        entry(1, { summary: { labels: [{ name: "bug", color: "ff0000" }, { name: "ui" }] } }),
        entry(2, { summary: { labels: [{ name: "ui" }] } }),
      ]),
    ).toEqual([
      { name: "ui", count: 2 },
      { name: "bug", color: "ff0000", count: 1 },
    ]);
  });
});

describe("findReferencedEntry", () => {
  const entries = [entry(1), entry(2)];

  it("finds a review by number or by its canonical url", () => {
    expect(findReferencedEntry("#2", entries)).toBe(entries[1]);
    expect(findReferencedEntry("https://github.com/example/poracode/pull/1/", entries)).toBe(
      entries[0],
    );
    expect(findReferencedEntry("https://GitHub.com/example/poracode/pull/1", entries)).toBe(
      entries[0],
    );
  });

  it("reports an ambiguous number and ignores unknown or non-web references", () => {
    const other = entry(2, {
      project: { ...project, id: "project-2" },
      pr: { url: "https://git.example/other/pull/2" },
    });
    expect(findReferencedEntry("#2", [...entries, other])).toBe("ambiguous");
    expect(findReferencedEntry("#9", entries)).toBeUndefined();
    expect(findReferencedEntry("file:///etc/passwd", entries)).toBeUndefined();
    expect(findReferencedEntry("fix the bug", entries)).toBeUndefined();
  });
});

describe("pullRequestKey", () => {
  it("is stable per host repository and number, and falls back to the project", () => {
    expect(pullRequestKey(undefined, "project-1", 5)).toBe("project:project-1#5");
  });
});
