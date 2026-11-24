import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ appShellEvaluations: 0 }));

// The app shell statically imports the main view, thread panes, and git review.
// Evaluating it is exactly what the quick-composer window must never pay for.
vi.mock("./app", () => {
  mocks.appShellEvaluations += 1;
  return { App: () => null };
});

describe("loadWindowRoot", () => {
  it("boots the quick-composer window without evaluating the app shell", async () => {
    const { loadWindowRoot } = await import("./windowRoot");
    const evaluations = mocks.appShellEvaluations;

    const root = await loadWindowRoot("quickComposer");
    const { App: QuickComposerRoot } = await import("./windowApps/QuickComposerWindowRoot");

    expect(mocks.appShellEvaluations).toBe(evaluations);
    expect(root.App).toBe(QuickComposerRoot);
  });

  it.each(["main", "sideChat", "thread", "browserExtract"] as const)(
    "boots the %s window from the app shell",
    async (windowKind) => {
      const { loadWindowRoot } = await import("./windowRoot");
      const root = await loadWindowRoot(windowKind);
      const appShell = await import("./app");

      expect(mocks.appShellEvaluations).toBeGreaterThan(0);
      expect(root.App).toBe(appShell.App);
    },
  );
});
