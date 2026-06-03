import { describe, expect, it } from "vitest";
import { buildMentionResults } from "./MentionInput";

describe("buildMentionResults", () => {
  const fileResults = [{ type: "file" as const, path: "README.md", name: "README.md" }];

  it("shows Browser when typing an empty @ mention", () => {
    expect(buildMentionResults(fileResults, "", true)).toEqual([
      { type: "browser", path: "browser", name: "Browser" },
      ...fileResults,
    ]);
  });

  it("shows Browser when the query matches browser", () => {
    expect(buildMentionResults(fileResults, "browser", true)).toEqual([
      { type: "browser", path: "browser", name: "Browser" },
      ...fileResults,
    ]);
  });

  it("does not show Browser until the composer allows it", () => {
    expect(buildMentionResults(fileResults, "browser", false)).toEqual(fileResults);
  });

  it("shows Computer Use when enabled and the query matches", () => {
    expect(buildMentionResults(fileResults, "computer", false, true)).toEqual([
      { type: "computer_use", path: "computer", name: "Computer Use" },
      ...fileResults,
    ]);
  });

  it("shows Browser before Computer Use for an empty @ mention", () => {
    expect(buildMentionResults(fileResults, "", true, true)).toEqual([
      { type: "browser", path: "browser", name: "Browser" },
      { type: "computer_use", path: "computer", name: "Computer Use" },
      ...fileResults,
    ]);
  });
});
