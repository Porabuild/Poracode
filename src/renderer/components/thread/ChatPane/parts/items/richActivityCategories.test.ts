import { describe, expect, it } from "vitest";
import fixture from "../../../../../../../protocol/remote/v3/fixtures/rich-activity-categories.json";
import { categorizeItem } from "./toolCallCategorization";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeChatItem";

const categoryNames = {
  viewed: "view",
  searched: "search",
  edited: "edit",
  executed: "command",
  mcp: "mcp",
  other: "tool",
  thought: "thought",
} as const;

describe("canonical activity presentation shared by PWA, iOS and Android", () => {
  it("uses version one of the presentation-only fixture", () => expect(fixture.version).toBe(1));
  it.each(fixture.cases)("$name", (entry) => {
    expect(categoryNames[categorizeItem(entry.item as RuntimeChatItem)]).toBe(entry.category);
  });
});
