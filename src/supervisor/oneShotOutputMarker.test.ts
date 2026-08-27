import { describe, expect, it } from "vitest";
import {
  ONE_SHOT_OUTPUT_MARKER,
  markOneShotOutput,
  stripOneShotBanner,
} from "./oneShotOutputMarker";

const WSL_SPEC = {
  command: "C:\\Windows\\System32\\wsl.exe",
  args: [
    "-d",
    "Ubuntu",
    "--cd",
    "/home/demo/project",
    "--exec",
    "/bin/bash",
    "-l",
    "-i",
    "-c",
    "exec 'claude' '-p' 'title this'",
  ],
};

describe("markOneShotOutput", () => {
  it("prints the sentinel before the login-shell script runs", () => {
    const marked = markOneShotOutput(WSL_SPEC);
    expect(marked.args.at(-1)).toBe(
      `printf '%s\n' '${ONE_SHOT_OUTPUT_MARKER}'; exec 'claude' '-p' 'title this'`,
    );
    expect(marked.args.slice(0, -1)).toEqual(WSL_SPEC.args.slice(0, -1));
  });

  it("leaves non-shell specs untouched", () => {
    const spec = { command: "claude", args: ["-p", "title this"] };
    expect(markOneShotOutput(spec)).toEqual(spec);
  });
});

describe("stripOneShotBanner", () => {
  it("drops a cold-boot WSL MOTD printed before the command output", () => {
    const raw = [
      "Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.18.3-microsoft-standard-WSL2 x86_64)",
      "",
      " * Documentation:  https://help.ubuntu.com",
      "Last login: Wed Aug 27 09:12:03 2026",
      ONE_SHOT_OUTPUT_MARKER,
      "Fix WSL cold-boot thread titles",
      "",
    ].join("\n");
    expect(stripOneShotBanner(raw).trim()).toBe("Fix WSL cold-boot thread titles");
  });

  it("keeps output that echoes the sentinel earlier than the real one", () => {
    const raw = `noise ${ONE_SHOT_OUTPUT_MARKER} noise\n${ONE_SHOT_OUTPUT_MARKER}\nreal title`;
    expect(stripOneShotBanner(raw)).toBe("real title");
  });

  it("returns unmarked output unchanged", () => {
    expect(stripOneShotBanner("Fix the thing")).toBe("Fix the thing");
  });
});
