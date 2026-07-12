import { describe, expect, it } from "vitest";
import {
  applyAcpRegistryNpxArgsOverride,
  buildNpxPrefetchArgs,
  isNpxCacheCorruptionError,
} from "./acpRegistryNpx";

describe("applyAcpRegistryNpxArgsOverride", () => {
  it("uses Droid's direct ACP mode instead of the broken daemon wrapper", () => {
    expect(
      applyAcpRegistryNpxArgsOverride("factory-droid", ["exec", "--output-format", "acp-daemon"]),
    ).toEqual(["exec", "--output-format", "acp"]);
  });

  it("leaves other registry commands unchanged", () => {
    const args = ["exec", "--output-format", "acp-daemon"];
    expect(applyAcpRegistryNpxArgsOverride("other-agent", args)).toBe(args);
  });
});

describe("buildNpxPrefetchArgs", () => {
  it("uses exec --help for subcommand CLIs like Factory Droid", () => {
    expect(
      buildNpxPrefetchArgs({
        package: "droid@0.129.0",
        args: ["exec", "--output-format", "acp-daemon"],
      }),
    ).toEqual(["-y", "droid@0.129.0", "exec", "--help"]);
  });

  it("appends --help after registry args for flat CLIs", () => {
    expect(buildNpxPrefetchArgs({ package: "codex-acp@1.0.0" })).toEqual([
      "-y",
      "codex-acp@1.0.0",
      "--help",
    ]);
  });
});

describe("isNpxCacheCorruptionError", () => {
  it("detects broken npx cache ENOENT errors", () => {
    expect(
      isNpxCacheCorruptionError(
        new Error("Command failed: ... npm-cache\\_npx\\259b204fadbcbdfc\\package.json ENOENT"),
      ),
    ).toBe(true);
    expect(isNpxCacheCorruptionError(new Error("command not found"))).toBe(false);
  });
});
