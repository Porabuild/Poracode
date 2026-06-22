import { describe, it, expect } from "vitest";
import { isDraftPaneId, makeDraftPaneId, parseDraftProjectId } from "./paneId";

describe("isDraftPaneId", () => {
  it("returns true for draft-prefixed id", () => {
    expect(isDraftPaneId("draft:proj1#abc123")).toBe(true);
  });

  it("returns false for non-draft id", () => {
    expect(isDraftPaneId("thread:abc123")).toBe(false);
  });

  it("returns true for draft prefix without separator", () => {
    expect(isDraftPaneId("draft:proj1")).toBe(true);
  });
});

describe("makeDraftPaneId", () => {
  it("produces a string starting with draft: prefix", () => {
    const id = makeDraftPaneId("myProject");
    expect(id.startsWith("draft:")).toBe(true);
  });

  it("contains the project id", () => {
    const id = makeDraftPaneId("myProject");
    expect(id).toContain("myProject");
  });

  it("contains a # separator", () => {
    const id = makeDraftPaneId("myProject");
    expect(id).toContain("#");
  });

  it("generates unique ids", () => {
    const id1 = makeDraftPaneId("proj");
    const id2 = makeDraftPaneId("proj");
    expect(id1).not.toBe(id2);
  });
});

describe("parseDraftProjectId", () => {
  it("returns projectId from a valid draft pane id", () => {
    expect(parseDraftProjectId("draft:myProject#suffix123")).toBe("myProject");
  });

  it("returns undefined for non-draft id", () => {
    expect(parseDraftProjectId("thread:abc")).toBeUndefined();
  });

  it("returns the full rest when no # separator", () => {
    expect(parseDraftProjectId("draft:projectOnly")).toBe("projectOnly");
  });

  it("handles empty project id", () => {
    expect(parseDraftProjectId("draft:#suffix")).toBe("");
  });
});
