import { describe, expect, it } from "vitest";
import { CONTROL_CAPABILITY_ENV } from "./harness/constants.ts";
import { parseCliOptions } from "./harness/cli.ts";
import { NATIVE_E2E_PORT_BASE } from "./harness/versions.ts";

describe("native-e2e CLI options", () => {
  it("takes ports from PORACODE_NATIVE_E2E_SLOT and refuses invented capability", () => {
    expect(() => parseCliOptions(["--mode", "mock", "--slot", "1"], {})).toThrow(
      /NATIVE_E2E_CONTROL_CAPABILITY/,
    );
    const options = parseCliOptions(["--mode", "mock", "--slot", "1"], {
      [CONTROL_CAPABILITY_ENV]: "capability-fixture",
    });
    expect(options.mode).toBe("mock");
    expect(options.slot.appHost).toBe(NATIVE_E2E_PORT_BASE + 8);
    expect(options.slot.control).toBe(NATIVE_E2E_PORT_BASE + 9);
    expect(options.capability).toBe("capability-fixture");
  });

  it("rejects explicit host or control ports", () => {
    const env = { [CONTROL_CAPABILITY_ENV]: "capability-fixture" };
    expect(() => parseCliOptions(["--mode", "mock", "--host-port", "49152"], env)).toThrow(
      /PORACODE_NATIVE_E2E_SLOT/,
    );
    expect(() =>
      parseCliOptions(["--mode", "mock"], { ...env, NATIVE_E2E_HOST_PORT: "49152" }),
    ).toThrow(/PORACODE_NATIVE_E2E_SLOT/);
  });
});
