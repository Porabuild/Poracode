import { describe, expect, it } from "vitest";
import { validateWindowsLaunchAppInput } from "./launchAppValidation";

describe("validateWindowsLaunchAppInput", () => {
  it("allows app aliases, drive paths, and shell AppsFolder targets", () => {
    expect(() => validateWindowsLaunchAppInput("calc")).not.toThrow();
    expect(() =>
      validateWindowsLaunchAppInput(String.raw`C:\Windows\System32\notepad.exe`),
    ).not.toThrow();
    expect(() =>
      validateWindowsLaunchAppInput(
        String.raw`shell:AppsFolder\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App`,
      ),
    ).not.toThrow();
  });

  it("rejects URL/protocol handlers and UNC paths", () => {
    expect(() => validateWindowsLaunchAppInput("ms-settings:privacy")).toThrow(
      "URL schemes are not allowed",
    );
    expect(() => validateWindowsLaunchAppInput("mailto:test@example.com")).toThrow(
      "URL schemes are not allowed",
    );
    expect(() => validateWindowsLaunchAppInput("https://example.com")).toThrow(
      "URL schemes are not allowed",
    );
    expect(() => validateWindowsLaunchAppInput(String.raw`\\server\share\tool.exe`)).toThrow(
      "UNC paths are not allowed",
    );
    expect(() => validateWindowsLaunchAppInput(String.raw`.\tool.exe`)).toThrow(
      "Relative paths are not allowed",
    );
    for (const app of [
      "notepad.exe\0ignored",
      "C:\\Windows\\notepad.exe\0ignored",
      "shell:AppsFolder\\Calculator\0ignored",
    ]) {
      expect(() => validateWindowsLaunchAppInput(app)).toThrow("app is required");
    }
  });
});
