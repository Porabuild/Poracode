import { describe, expect, it } from "vitest";
import {
  composerSeedQueue,
  mergePendingComposerSeeds,
  remapProjectRecord,
  remapProjectView,
} from "./projectReferences";

describe("project reference repair", () => {
  it("rewrites project draft panes while preserving their suffix", () => {
    const view = remapProjectView(
      {
        kind: "thread",
        panes: ["draft:duplicate#pane-1", "thread-1"],
        paneLayout: {
          kind: "split",
          axis: "vertical",
          children: [
            { kind: "leaf", paneId: "draft:duplicate#pane-1", slotId: "slot-a" },
            { kind: "leaf", paneId: "thread-1" },
          ],
        },
      },
      new Map([["duplicate", "canonical"]]),
    );

    expect(view).toEqual({
      kind: "thread",
      panes: ["draft:canonical#pane-1", "thread-1"],
      paneLayout: {
        kind: "split",
        axis: "vertical",
        children: [
          { kind: "leaf", paneId: "draft:canonical#pane-1", slotId: "slot-a" },
          { kind: "leaf", paneId: "thread-1" },
        ],
      },
    });
  });

  it("moves duplicate-keyed state and merges an empty canonical value", () => {
    const result = remapProjectRecord(
      { canonical: "", duplicate: "unsent" },
      new Map([["duplicate", "canonical"]]),
      (canonical, duplicate) => canonical || duplicate,
    );

    expect(result).toEqual({ canonical: "unsent" });
  });

  it("queues every pending insertion with its own skill metadata", () => {
    const first = { text: "first", nonce: 1 };
    const second = {
      text: "/skill second",
      nonce: 2,
      bindLeadingSkill: true,
      leadingSkillPluginId: "plugin-2",
    };
    const third = { text: "third", nonce: 3 };
    const merged = mergePendingComposerSeeds(mergePendingComposerSeeds(first, second), third);
    expect(composerSeedQueue(merged)).toEqual([{ ...first, nonce: 4 }, second, third]);
  });
});
