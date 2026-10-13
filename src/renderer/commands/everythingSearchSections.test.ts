import { describe, expect, it, vi } from "vitest";
import { buildEverythingSearchSections } from "./everythingSearchSections";
import type { AppCommand } from "./registry";

vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ platform: "darwin" }) }));
const input: Parameters<typeof buildEverythingSearchSections>[0] = {
  category: "all",
  query: "",
  projects: new Map(),
  threads: [],
  commands: [],
  actions: [],
  settings: [],
  files: [],
  labels: {
    threads: "Threads",
    commands: "Commands",
    actions: "Actions",
    settings: "Settings",
    files: "Files",
  },
  resolve: (message) => (typeof message === "string" ? message : String(message.message)),
  keybindings: [],
};
const commands: AppCommand[] = Array.from({ length: 20 }, (_, index) => ({
  id: `command.${index}`,
  title: `Command ${index}`,
  group: "Poracode",
  run: vi.fn<() => void>(),
}));

describe("search result sections", () => {
  it("shows counts and a selectable expansion result without losing matches in category view", () => {
    const all = buildEverythingSearchSections({
      ...input,
      commands: commands.map((item) => ({ item, score: 1 })),
    }).find((section) => section.category === "commands")!;
    expect(all.total).toBe(20);
    expect(all.results).toHaveLength(6);
    expect(all.results.at(-1)).toMatchObject({ kind: "more", category: "commands" });
    const expanded = buildEverythingSearchSections({
      ...input,
      commands: commands.map((item) => ({ item, score: 1 })),
      category: "commands",
    })[0]!;
    expect(expanded.results).toHaveLength(20);
    expect(expanded.results.every((result) => result.kind === "command")).toBe(true);
  });

  it("puts the group with the most relevant match first", () => {
    const sections = buildEverythingSearchSections({
      ...input,
      query: "theme",
      commands: [
        {
          item: {
            id: "appearance",
            title: "Open appearance",
            group: "Poracode",
            keywords: ["theme"],
            run: vi.fn<() => void>(),
          },
          score: 96,
        },
      ],
      settings: [
        {
          section: "appearance",
          anchor: "appearance.mode",
          title: "Theme",
          snippet: null,
          score: 440,
        },
      ],
    });
    expect(sections[0]?.category).toBe("settings");
  });
});
