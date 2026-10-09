import { describe, expect, it } from "vitest";
import { resolveHostFilePath } from "./resolveHostFilePath";

describe("resolveHostFilePath", () => {
  it("joins relative paths for Windows projects", () => {
    expect(
      resolveHostFilePath("docs/a.pdf", {
        kind: "windows",
        path: "C:\\repo",
      }),
    ).toBe("C:\\repo\\docs\\a.pdf");
  });

  it("maps WSL relative paths to UNC", () => {
    expect(
      resolveHostFilePath("docs/a.pdf", {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/me/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
      }),
    ).toBe("\\\\wsl.localhost\\Ubuntu\\home\\me\\repo\\docs\\a.pdf");
  });

  it("maps WSL linux absolute paths to UNC", () => {
    expect(
      resolveHostFilePath("/home/me/repo/docs/a.pdf", {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/me/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
      }),
    ).toBe("\\\\wsl.localhost\\Ubuntu\\home\\me\\repo\\docs\\a.pdf");
  });

  it("leaves host UNC paths unchanged for WSL projects", () => {
    const unc = "\\\\wsl.localhost\\Ubuntu\\home\\me\\doc.pdf";
    expect(
      resolveHostFilePath(unc, {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/me/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
      }),
    ).toBe(unc);
  });
});
