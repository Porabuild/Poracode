import { describe, expect, it } from "vitest";
import { Globe } from "lucide-react";
import { groupMentionResults, type MentionEntry } from "./MentionPopover";

describe("groupMentionResults", () => {
  const entries: MentionEntry[] = [
    { type: "plugin", path: "browser-tools", name: "Browser", command: {} as never },
    { type: "mcp", path: "browser", name: "Browser", icon: Globe, enabled: true },
    { type: "mcp", path: "app-controls", name: "Terminal", icon: Globe, enabled: true },
    { type: "thread", path: "t1", name: "Fix launch", detail: "603efb25" },
    { type: "directory", path: "src", name: "src" },
    { type: "file", path: "src/index.ts", name: "index.ts" },
  ];

  it("splits entries into plugin/mcp/thread/file sections", () => {
    expect(groupMentionResults(entries).map((section) => section.key)).toEqual([
      "plugin",
      "mcp",
      "thread",
      "file",
    ]);
  });

  it("keeps each entry's flat index so keyboard navigation stays aligned", () => {
    const flatIndexes = groupMentionResults(entries).flatMap((section) =>
      section.items.map((item) => item.index),
    );
    expect(flatIndexes).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("groups directories together with files", () => {
    const fileSection = groupMentionResults(entries).at(-1);
    expect(fileSection?.items.map((item) => item.entry.name)).toEqual(["src", "index.ts"]);
  });

  it("returns no sections for an empty result list", () => {
    expect(groupMentionResults([])).toEqual([]);
  });
});
