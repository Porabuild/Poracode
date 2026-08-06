import { describe, expect, it } from "vitest";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import {
  filterSyncedRemoteProjects,
  isRemoteProjectSynced,
  selectableRemoteProjects,
  withRemoteProjectSync,
} from "./projectSync";

const projects = [{ id: HOME_PROJECT_ID }, { id: "p1" }, { id: "p2" }] as const;

describe("isRemoteProjectSynced", () => {
  it("syncs anything the user has not excluded", () => {
    expect(isRemoteProjectSynced("p1", undefined)).toBe(true);
    expect(isRemoteProjectSynced("p1", [])).toBe(true);
    expect(isRemoteProjectSynced("p1", ["p2"])).toBe(true);
  });

  it("skips excluded projects", () => {
    expect(isRemoteProjectSynced("p1", ["p1"])).toBe(false);
  });

  it("never syncs the remote's built-in Home scope row", () => {
    expect(isRemoteProjectSynced(HOME_PROJECT_ID, undefined)).toBe(false);
  });
});

describe("filterSyncedRemoteProjects", () => {
  it("drops the Home scope row and excluded projects", () => {
    expect(filterSyncedRemoteProjects(projects, ["p2"])).toEqual([{ id: "p1" }]);
  });
});

describe("selectableRemoteProjects", () => {
  it("offers every real project regardless of exclusion", () => {
    expect(selectableRemoteProjects(projects)).toEqual([{ id: "p1" }, { id: "p2" }]);
  });
});

describe("withRemoteProjectSync", () => {
  it("records an exclusion", () => {
    expect(withRemoteProjectSync({}, "d1", "p1", false)).toEqual({ d1: ["p1"] });
  });

  it("prunes the server entry once nothing is excluded", () => {
    expect(withRemoteProjectSync({ d1: ["p1"] }, "d1", "p1", true)).toEqual({});
  });

  it("keeps other servers and other exclusions intact", () => {
    expect(withRemoteProjectSync({ d1: ["p1"], d2: ["p9"] }, "d1", "p2", false)).toEqual({
      d1: ["p1", "p2"],
      d2: ["p9"],
    });
  });

  it("returns the same object when nothing changes", () => {
    const current = { d1: ["p1"] };
    expect(withRemoteProjectSync(current, "d1", "p1", false)).toBe(current);
    expect(withRemoteProjectSync(current, "d1", "p2", true)).toBe(current);
  });
});
