import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitReviewActionStoreKey, useGitReviewActionStore } from "./gitReviewActionStore";

function resetStore() {
  useGitReviewActionStore.setState({ panels: {} });
}

const { patch } = useGitReviewActionStore.getState();
const panels = () => useGitReviewActionStore.getState().panels;

describe("gitReviewActionStore", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it("keeps panel state keyed and isolated across keys", () => {
    patch("projA", { commitMessage: "feat: a", prTargetBranch: "main" });
    patch("projB", { commitMessage: "fix: b" });

    expect(panels()["projA"]?.commitMessage).toBe("feat: a");
    expect(panels()["projA"]?.prTargetBranch).toBe("main");
    expect(panels()["projB"]?.commitMessage).toBe("fix: b");
    // Writing one panel must not bleed into another.
    patch("projA", { commitMessage: "feat: a2" });
    expect(panels()["projB"]?.commitMessage).toBe("fix: b");
  });

  // The bug this store fixes: the git panel unmounts on project switch, so an
  // async action (which keeps running in the supervisor) resolved into a dead
  // component and its result/pending state was dropped. Routed through the
  // store, both are captured against the panel's key and are there on return.
  it("captures a generation result that resolves after the panel 'unmounts'", () => {
    // Panel A kicks off generation, then the user switches away (no reads).
    patch("projA", { isGenerating: true });
    expect(panels()["projA"]?.isGenerating).toBe(true);

    // While away, the user works in panel B — independent state.
    patch("projB", { commitMessage: "wip" });

    // Generation completes after the unmount and writes through the captured,
    // key-bound setter (this is what used to hit a dead component).
    patch("projA", { commitMessage: "feat: captured", isGenerating: false });

    // Back on panel A: the spinner is cleared and the message is waiting.
    expect(panels()["projA"]).toMatchObject({
      commitMessage: "feat: captured",
      isGenerating: false,
    });
    // Panel B was never disturbed.
    expect(panels()["projB"]?.commitMessage).toBe("wip");
  });

  it("preserves an in-flight commit/push spinner across a switch", () => {
    // Commit & Push uses both flags; both must survive the remount.
    patch("p", { isCommitting: true, isSyncing: true });
    // ...user switches away and back (re-read) — still pending.
    expect(panels()["p"]).toMatchObject({ isCommitting: true, isSyncing: true });
    // Operation finishes and clears them.
    patch("p", { isCommitting: false, isSyncing: false });
    expect(panels()["p"]).toMatchObject({ isCommitting: false, isSyncing: false });
  });

  it("tracks each in-flight action flag independently", () => {
    patch("p", { isMerging: true, isPullingFromSource: true, isCreatingPr: true });
    patch("p", { isMerging: false });
    expect(panels()["p"]).toMatchObject({
      isMerging: false,
      isPullingFromSource: true,
      isCreatingPr: true,
    });
  });

  it("skips no-op writes so subscribers don't re-render needlessly", () => {
    patch("p", { commitMessage: "x" });
    const before = panels();
    patch("p", { commitMessage: "x" }); // same value
    expect(panels()).toBe(before); // identical reference — no update
  });

  // A conflicted stash-pull records its stash commit here so the panel's
  // finish/abort merge actions can re-apply it later, even though the pull
  // ran from the dialog and the panel may remount in between.
  it("holds a pull stash commit across writers until the merge resolves", () => {
    patch("wt", { pullStashCommit: "a".repeat(40) });
    expect(panels()["wt"]?.pullStashCommit).toBe("a".repeat(40));
    patch("wt", { pullStashCommit: null });
    expect(panels()["wt"]?.pullStashCommit).toBeNull();
  });

  it("derives the same store key as the panel (statusKey ?? project.id)", () => {
    expect(gitReviewActionStoreKey("proj-1", "/path/to/worktree")).toBe("/path/to/worktree");
    expect(gitReviewActionStoreKey("proj-1", undefined)).toBe("proj-1");
  });

  it("leaves untouched keys referentially stable when another key changes", () => {
    patch("a", { commitMessage: "a" });
    patch("b", { commitMessage: "b" });
    const panelB = panels()["b"];
    patch("a", { commitMessage: "a2" });
    // 'b' object identity is preserved, so a selector on key 'b' won't re-render.
    expect(panels()["b"]).toBe(panelB);
  });
});
// @vitest-environment node
