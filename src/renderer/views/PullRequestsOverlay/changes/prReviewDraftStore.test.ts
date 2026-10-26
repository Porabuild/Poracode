import { beforeEach, describe, expect, it } from "vitest";
import { currentDrafts, NO_REVIEW_DRAFTS, useReviewDraftStore } from "./prReviewDraftStore";

const draft = { path: "a.ts", side: "RIGHT", line: 3, body: "note", headSha: "aaaaaaa" } as const;

describe("review draft store", () => {
  beforeEach(() => useReviewDraftStore.setState({ byReview: {} }));

  it("adds, edits and deletes drafts per review", () => {
    const store = useReviewDraftStore.getState();
    const first = store.add("r#1", draft);
    store.add("r#2", { ...draft, body: "other review" });
    store.update("r#1", first, "edited");
    expect(useReviewDraftStore.getState().byReview["r#1"]).toEqual([
      { ...draft, id: first, body: "edited" },
    ]);
    expect(useReviewDraftStore.getState().byReview["r#2"]).toHaveLength(1);
    store.remove("r#1", first);
    expect(useReviewDraftStore.getState().byReview["r#1"]).toBeUndefined();
  });

  it("does not change state when nothing changes", () => {
    const store = useReviewDraftStore.getState();
    const id = store.add("r#1", draft);
    const before = useReviewDraftStore.getState().byReview;
    store.update("r#1", id, draft.body);
    store.remove("r#1", "missing");
    store.removeMany("r#1", ["missing"]);
    store.removeOutdated("r#1", draft.headSha);
    expect(useReviewDraftStore.getState().byReview).toBe(before);
  });

  it("tells current drafts from outdated ones and removes only the outdated", () => {
    const store = useReviewDraftStore.getState();
    store.add("r#1", draft);
    store.add("r#1", { ...draft, headSha: "bbbbbbb", body: "old" });
    const all = useReviewDraftStore.getState().byReview["r#1"] ?? NO_REVIEW_DRAFTS;
    expect(currentDrafts(all, "aaaaaaa").map((d) => d.body)).toEqual(["note"]);
    expect(currentDrafts(all, undefined)).toEqual([]);
    store.removeOutdated("r#1", "aaaaaaa");
    expect(useReviewDraftStore.getState().byReview["r#1"]?.map((d) => d.body)).toEqual(["note"]);
  });

  it("removes the drafts a submission carried", () => {
    const store = useReviewDraftStore.getState();
    const one = store.add("r#1", draft);
    store.add("r#1", { ...draft, body: "kept" });
    store.removeMany("r#1", [one]);
    expect(useReviewDraftStore.getState().byReview["r#1"]?.map((d) => d.body)).toEqual(["kept"]);
  });

  it("keeps drafts from another source for the same review number", () => {
    const store = useReviewDraftStore.getState();
    store.add("r#1@github.com/acct-a", draft);
    store.add("r#1@gitlab.example", { ...draft, body: "other host" });
    expect(useReviewDraftStore.getState().byReview["r#1@github.com/acct-a"]).toHaveLength(1);
    expect(useReviewDraftStore.getState().byReview["r#1@gitlab.example"]).toHaveLength(1);
    store.removeOutdated("r#1@gitlab.example", "bbbbbbb");
    expect(useReviewDraftStore.getState().byReview["r#1@github.com/acct-a"]).toHaveLength(1);
  });
});
