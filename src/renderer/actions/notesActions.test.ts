import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { newThreadFromText } from "./notesActions";

const openNewThread = vi.hoisted(() => vi.fn<(projectId?: string) => void>());
vi.mock("./threadActions", () => ({ openNewThread }));

beforeEach(() => {
  openNewThread.mockReset();
  useAppStore.setState({ pendingComposerSeeds: {} });
  window.lightcode = {} as typeof window.lightcode;
});

describe("newThreadFromText", () => {
  it("seeds the composer with trimmed text and opens a new thread", () => {
    newThreadFromText("p1", "  fix the flaky test  ");
    expect(useAppStore.getState().pendingComposerSeeds["p1"]?.text).toBe("fix the flaky test");
    expect(openNewThread).toHaveBeenCalledWith("p1");
  });

  it("bumps the nonce on repeated seeds so the consumer re-fires", () => {
    newThreadFromText("p1", "first");
    const firstNonce = useAppStore.getState().pendingComposerSeeds["p1"]!.nonce;
    newThreadFromText("p1", "second");
    const seed = useAppStore.getState().pendingComposerSeeds["p1"]!;
    expect(seed.text).toBe("second");
    expect(seed.nonce).toBeGreaterThan(firstNonce);
  });

  it("ignores blank text", () => {
    newThreadFromText("p1", "   ");
    expect(useAppStore.getState().pendingComposerSeeds["p1"]).toBeUndefined();
    expect(openNewThread).not.toHaveBeenCalled();
  });
});
