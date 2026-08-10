import { describe, expect, it } from "vitest";
import { affectsShellProjection } from "./BackendDesktopServices";

describe("BackendDesktopServices projection invalidation", () => {
  it("never turns shell projection reads into another invalidation", () => {
    expect(affectsShellProjection("dbGetProjects")).toBe(false);
    expect(affectsShellProjection("dbGetThreads")).toBe(false);
    expect(affectsShellProjection("dbGetState")).toBe(false);
    expect(affectsShellProjection("dbUpsertProject")).toBe(true);
    expect(affectsShellProjection("dbUpsertThread")).toBe(true);
  });
});
