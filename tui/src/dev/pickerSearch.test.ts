import { expect, test } from "bun:test";
import { createRoot, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { createPickerFilter } from "../../opencode/packages/tui/src/util/fuzzy-search";
import { stringWidth } from "../../opencode/packages/tui/src/util/string-width.node";

test("picker search retains every match and rebuilds its snapshot when options change", () => {
  createRoot((dispose) => {
    try {
      const [query, setQuery] = createSignal("");
      const [rows, setRows] = createStore(
        Array.from({ length: 16 }, (_, i) => ({ title: `Project ${i}` })),
      );
      let listReads = 0;
      const results = createPickerFilter(
        () => {
          listReads++;
          return rows;
        },
        query,
        ["title"],
      );
      expect(results()).toBe(rows);
      const beforeSearch = listReads;
      setQuery("proj");
      expect(results()).toHaveLength(16);
      const built = listReads;
      expect(built).toBeGreaterThan(beforeSearch);
      setQuery("project");
      expect(results()).toHaveLength(16);
      expect(listReads).toBe(built);
      setRows(0, "title", "poracode.queries.list");
      expect(results()).toHaveLength(15);
      setQuery("acd");
      expect(results().map((row) => row.title)).toEqual(["poracode.queries.list"]);
      setQuery("");
      expect(results()).toBe(rows);
    } finally {
      dispose();
    }
  });
});

test("the Node width fallback distinguishes text and emoji presentation", () => {
  for (const [text, columns] of [
    ["plain", 5],
    ["©", 1],
    ["©️", 2],
    ["✈", 1],
    ["✈️", 2],
    ["👩‍💻", 2],
    ["🇲🇹", 2],
    ["1️⃣", 2],
    ["e\u0301", 1],
    ["가", 2],
    ["\x1b[31m©\x1b[0m", 1],
  ] as const)
    expect(stringWidth(text)).toBe(columns);
});
