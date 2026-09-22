import { describe, expect, it } from "vitest";
import { parseBootstrapBatchOutput } from "./probe";

describe("parseBootstrapBatchOutput", () => {
  const token = "__PORACODE_BOOTSTRAP_TEST__";

  it("ignores login-shell noise before and between framed commands", () => {
    const stdout = [
      "welcome from .bashrc",
      `${token}:0:start`,
      "x86_64",
      `${token}:0:end`,
      "profile footer",
      `${token}:1:start`,
      "/home/alice/.local/bin/node",
      `${token}:1:end`,
    ].join("\r\n");

    expect(parseBootstrapBatchOutput(stdout, token, 2)).toEqual([
      { ok: true, stdout: "x86_64" },
      { ok: true, stdout: "/home/alice/.local/bin/node" },
    ]);
  });

  it("keeps multiline command output inside its own frame", () => {
    const stdout = [`${token}:0:start`, "first", "second", `${token}:0:end`].join("\n");
    expect(parseBootstrapBatchOutput(stdout, token, 1)).toEqual([
      { ok: true, stdout: "first\nsecond" },
    ]);
  });

  it("fails closed for missing or incomplete frames", () => {
    expect(parseBootstrapBatchOutput("rc noise only", token, 2)).toEqual([
      { ok: false, stdout: "" },
      { ok: false, stdout: "" },
    ]);
    expect(parseBootstrapBatchOutput(`${token}:0:start\nvalue`, token, 1)).toEqual([
      { ok: false, stdout: "" },
    ]);
  });
});
