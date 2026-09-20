import { describe, expect, it, vi } from "vitest";
import { notifyProjectThreadDataChanged, onProjectThreadDataChanged } from "./projectThreadChanges";

describe("projectThreadChanges", () => {
  it("notifies active subscribers", () => {
    const listener = vi.fn<() => void>();
    const unsubscribe = onProjectThreadDataChanged(listener);

    notifyProjectThreadDataChanged();
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    notifyProjectThreadDataChanged();
    expect(listener).toHaveBeenCalledOnce();
  });
});
