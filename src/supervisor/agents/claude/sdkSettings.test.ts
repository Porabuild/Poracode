import { expect, it } from "vitest";
import { claudeSdkSettingsEnv } from "./sdkSettings";

it("applies PowerShell only to native Windows SDK execution", () => {
  const values = { usePowershellTool: true, noFlicker: false };
  const windows = { kind: "windows", path: "C:\\project" } as const;
  expect(claudeSdkSettingsEnv(windows, values)).toEqual({
    CLAUDE_CODE_USE_POWERSHELL_TOOL: "1",
    CLAUDE_CODE_SCROLL_SPEED: "5",
  });
  expect(
    claudeSdkSettingsEnv(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/project",
        uncPath: "\\\\wsl$\\Ubuntu\\project",
      },
      values,
    ),
  ).toEqual({ CLAUDE_CODE_SCROLL_SPEED: "5" });
});
