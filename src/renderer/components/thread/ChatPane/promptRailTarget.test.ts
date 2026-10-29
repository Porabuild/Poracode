import { describe, expect, it } from "vitest";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import {
  buildRailPrompts,
  findActivePromptPosition,
  isPromptTurnInView,
  nextLoadedIndexAfter,
  selectUserPromptIndexes,
  stripMarkdownForPreview,
  tickScale,
  windowRailPositions,
} from "./promptRailTarget";

describe("findActivePromptPosition", () => {
  it("picks the nearest prompt at or above the first visible row", () => {
    expect(findActivePromptPosition([0, 4, 9], 0)).toBe(0);
    expect(findActivePromptPosition([0, 4, 9], 3)).toBe(0);
    expect(findActivePromptPosition([0, 4, 9], 4)).toBe(1);
    expect(findActivePromptPosition([0, 4, 9], 12)).toBe(2);
  });

  it("falls back to the first prompt above all of them and the last before measuring", () => {
    expect(findActivePromptPosition([2, 5], 0)).toBe(0);
    expect(findActivePromptPosition([2, 5], null)).toBe(1);
  });
});

describe("windowRailPositions", () => {
  it("shows every position when they fit", () => {
    expect(windowRailPositions(5, 2, 8)).toEqual({ start: 0, end: 5 });
  });

  it("keeps the active position centered and clamps at both ends", () => {
    expect(windowRailPositions(30, 15, 10)).toEqual({ start: 10, end: 20 });
    expect(windowRailPositions(30, 1, 10)).toEqual({ start: 0, end: 10 });
    expect(windowRailPositions(30, 29, 10)).toEqual({ start: 20, end: 30 });
  });
});

describe("isPromptTurnInView", () => {
  const promptIndexes = [0, 4, 9];

  it("is true when any row of the turn is visible", () => {
    expect(isPromptTurnInView(promptIndexes, 0, { first: 2, last: 3 }, 12)).toBe(true);
    expect(isPromptTurnInView(promptIndexes, 1, { first: 2, last: 5 }, 12)).toBe(true);
    expect(isPromptTurnInView(promptIndexes, 2, { first: 11, last: 11 }, 12)).toBe(true);
  });

  it("is false for turns entirely above or below the viewport", () => {
    expect(isPromptTurnInView(promptIndexes, 0, { first: 4, last: 6 }, 12)).toBe(false);
    expect(isPromptTurnInView(promptIndexes, 2, { first: 4, last: 8 }, 12)).toBe(false);
    expect(isPromptTurnInView(promptIndexes, 0, null, 12)).toBe(false);
  });
});

describe("tickScale", () => {
  const rest = { isActive: false, isInView: false };

  it("magnifies around the hovered tick and falls back to rest beyond it", () => {
    const scale = (position: number) => tickScale({ position, hoveredPosition: 5, ...rest });
    expect(scale(5)).toBe(1);
    expect(scale(4)).toBe(scale(6));
    expect(scale(4)).toBeLessThan(1);
    expect(scale(3)).toBeLessThan(scale(4));
    expect(scale(0)).toBeLessThan(scale(3));
  });

  it("widens the active and in-view ticks when nothing is hovered", () => {
    const at = (state: { isActive: boolean; isInView: boolean }) =>
      tickScale({ position: 1, hoveredPosition: null, ...state });
    expect(at({ isActive: true, isInView: true })).toBeGreaterThan(
      at({ isActive: false, isInView: true }),
    );
    expect(at({ isActive: false, isInView: true })).toBeGreaterThan(at(rest));
  });
});

describe("stripMarkdownForPreview", () => {
  it("drops syntax markers but keeps link labels and snake_case names", () => {
    expect(
      stripMarkdownForPreview(
        [
          "## Done",
          "",
          "- fixed **parse_value** in [the parser](https://x.dev)",
          "> `ok`",
          "```ts",
          "const a = 1;",
          "```",
        ].join("\n"),
      ),
    ).toBe("Done fixed parse_value in the parser ok const a = 1;");
  });
});

describe("buildRailPrompts", () => {
  const entries = [
    { kind: "item" as const, id: "u3" },
    { kind: "item" as const, id: "a3" },
    { kind: "item" as const, id: "u4" },
  ];
  const loaded = [0, 2];

  it("shows the loaded prompts alone without a host index", () => {
    expect(buildRailPrompts(null, entries, loaded)).toEqual([
      { id: "u3", loadedIndex: 0, text: "" },
      { id: "u4", loadedIndex: 2, text: "" },
    ]);
  });

  it("puts the host's older prompts before the loaded ones, in order", () => {
    const prompts = buildRailPrompts(
      {
        prompts: [
          { itemId: "u1", position: 0, text: "one" },
          { itemId: "u2", position: 2, text: "two" },
          { itemId: "u3", position: 4, text: "three" },
          { itemId: "u4", position: 6, text: "four" },
        ],
        truncated: false,
      },
      entries,
      loaded,
    );
    expect(prompts.map((prompt) => [prompt.id, prompt.loadedIndex, prompt.text])).toEqual([
      ["u1", null, "one"],
      ["u2", null, "two"],
      ["u3", 0, "three"],
      ["u4", 2, "four"],
    ]);
  });

  it("keeps loaded prompts the index has not seen yet and drops unreachable unloaded ones", () => {
    const prompts = buildRailPrompts(
      {
        prompts: [
          { itemId: "u2", position: 2, text: "two" },
          { itemId: "u3", position: 4, text: "three" },
          { itemId: "hidden", position: 5, text: "never loadable" },
        ],
        truncated: false,
      },
      entries,
      loaded,
    );
    expect(prompts.map((prompt) => prompt.id)).toEqual(["u2", "u3", "u4"]);
  });

  it("treats every indexed prompt as older when nothing is loaded yet", () => {
    const prompts = buildRailPrompts(
      { prompts: [{ itemId: "u1", position: 0, text: "one" }], truncated: false },
      [],
      [],
    );
    expect(prompts).toEqual([{ id: "u1", loadedIndex: null, text: "one" }]);
  });
});

describe("with prompts that are not loaded", () => {
  it("picks the nearest loaded prompt as active", () => {
    expect(findActivePromptPosition([null, null, 0, 4], 1)).toBe(2);
    expect(findActivePromptPosition([null, null, 0, 4], 4)).toBe(3);
  });

  it("falls back to the first loaded prompt above all of them", () => {
    expect(findActivePromptPosition([null, null, 3, 6], 1)).toBe(2);
  });

  it("never reports an unloaded prompt as in view", () => {
    expect(isPromptTurnInView([null, 0, 4], 0, { first: 0, last: 9 }, 10)).toBe(false);
    expect(isPromptTurnInView([null, 0, 4], 1, { first: 0, last: 2 }, 10)).toBe(true);
  });
});

describe("nextLoadedIndexAfter", () => {
  it("skips unloaded prompts and reports none past the last one", () => {
    expect(nextLoadedIndexAfter([null, 0, null, 4], 0)).toBe(0);
    expect(nextLoadedIndexAfter([null, 0, null, 4], 1)).toBe(4);
    expect(nextLoadedIndexAfter([null, 0, null, 4], 3)).toBeUndefined();
  });
});

describe("selectUserPromptIndexes", () => {
  const item = (type: string) => ({ type, state: "completed", payload: {}, streams: {} });
  const stateWith = (items: Record<string, unknown>) =>
    ({ runtimeItemsByIdByThread: { t: items } }) as unknown as AppStoreState;
  // A fresh timeline per test: results are remembered per timeline array.
  const makeEntries = () => [
    { kind: "item" as const, id: "u1" },
    { kind: "item" as const, id: "a1" },
    { kind: "item" as const, id: "u2" },
  ];

  it("returns the same array for the same timeline once every item is known", () => {
    const entries = makeEntries();
    const state = stateWith({
      u1: item("user_message"),
      a1: item("assistant_message"),
      u2: item("user_message"),
    });
    const first = selectUserPromptIndexes(state, "t", entries);
    expect(first).toEqual([0, 2]);
    expect(selectUserPromptIndexes(state, "t", entries)).toBe(first);
  });

  it("does not remember a result while an entry's item has not arrived", () => {
    const entries = makeEntries();
    const partial = stateWith({ u1: item("user_message"), a1: item("assistant_message") });
    expect(selectUserPromptIndexes(partial, "t", entries)).toEqual([0]);

    const complete = stateWith({
      u1: item("user_message"),
      a1: item("assistant_message"),
      u2: item("user_message"),
    });
    expect(selectUserPromptIndexes(complete, "t", entries)).toEqual([0, 2]);
  });
});
