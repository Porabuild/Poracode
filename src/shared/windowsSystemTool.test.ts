import { describe, expect, it } from "vitest";
import { windowsSystemTool } from "./windowsSystemTool";

describe("windowsSystemTool", () => {
  it("resolves System32 tools from SystemRoot, never from PATH", () => {
    expect(windowsSystemTool("whoami", { SystemRoot: "D:\\Win" })).toBe(
      "D:\\Win\\System32\\whoami.exe",
    );
    expect(windowsSystemTool("powershell", { SystemRoot: "D:\\Win" })).toBe(
      "D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
    expect(windowsSystemTool("icacls", {})).toBe("C:\\Windows\\System32\\icacls.exe");
  });
});
