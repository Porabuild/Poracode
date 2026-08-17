import { describe, it, expect } from "vitest";
import {
  HOME_PROJECT_ID,
  HOME_PROJECT_NAME,
  isHomeProjectId,
  isHomeProject,
  isHomeScopeLocation,
} from "./homeScope";

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

describe("isHomeScopeLocation", () => {
  it("treats the user home directory as Home scope", () => {
    expect(isHomeScopeLocation({ kind: "windows", path: "C:\\Users\\me" })).toBe(true);
    expect(isHomeScopeLocation({ kind: "posix", path: "/home/me" })).toBe(true);
    expect(
      isHomeScopeLocation({
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/me",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me",
      }),
    ).toBe(true);
  });

  it("does not treat a repo under home as Home scope", () => {
    expect(isHomeScopeLocation({ kind: "windows", path: "C:\\Users\\me\\Documents" })).toBe(false);
    expect(isHomeScopeLocation({ kind: "windows", path: "C:\\repo" })).toBe(false);
    expect(isHomeScopeLocation({ kind: "posix", path: "/home/me/src/app" })).toBe(false);
  });
});
