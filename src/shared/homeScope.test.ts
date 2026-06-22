import { describe, it, expect } from "vitest";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME, isHomeProjectId, isHomeProject } from "./homeScope";

describe("homeScope constants", () => {
  it("HOME_PROJECT_ID has expected value", () => {
    expect(HOME_PROJECT_ID).toBe("__lightcode_home__");
  });

  it("HOME_PROJECT_NAME has expected value", () => {
    expect(HOME_PROJECT_NAME).toBe("Home");
  });
});

describe("isHomeProjectId", () => {
  it("returns true for the home project id", () => {
    expect(isHomeProjectId("__lightcode_home__")).toBe(true);
  });

  it("returns false for a different id", () => {
    expect(isHomeProjectId("other-project")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isHomeProjectId(undefined)).toBe(false);
  });
});

describe("isHomeProject", () => {
  it("returns true for a project with the home id", () => {
    expect(isHomeProject({ id: "__lightcode_home__" })).toBe(true);
  });

  it("returns false for a project with a different id", () => {
    expect(isHomeProject({ id: "some-other-project" })).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isHomeProject(undefined)).toBe(false);
  });
});
