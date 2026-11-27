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

  const VALID_UDID = "A1B2C3D4-1234-4ABC-8DEF-0123456789AB";

  it("accepts an exact --ios-hid-udid UUID in mock mode and preserves lab-label", () => {
    const env = { [CONTROL_CAPABILITY_ENV]: "capability-fixture" };
    const options = parseCliOptions(
      [
        "--mode",
        "mock",
        "--slot",
        "1",
        "--ios-hid-udid",
        VALID_UDID,
        "--lab-label",
        "Keyboard Lab",
      ],
      env,
    );
    expect(options.iosHidUdid).toBe(VALID_UDID);
    expect(options.labLabel).toBe("Keyboard Lab");
  });

  it("rejects --ios-hid-udid in real mode and any non-exact UUID", () => {
    const env = { [CONTROL_CAPABILITY_ENV]: "capability-fixture" };
    expect(() =>
      parseCliOptions(["--mode", "real", "--slot", "1", "--ios-hid-udid", VALID_UDID], env),
    ).toThrow(/ios-hid-udid/);
    for (const bad of [
      "not-a-uuid",
      "A1B2C3D4-1234-4ABC-8DEF-0123456789A",
      "{A1B2C3D4-1234-4ABC-8DEF-0123456789AB}",
      "A1B2C3D412344ABC8DEF0123456789AB",
      "true",
    ]) {
      expect(() =>
        parseCliOptions(["--mode", "mock", "--slot", "1", "--ios-hid-udid", bad], env),
      ).toThrow(/ios-hid-udid|UUID/);
    }
  });

  it("leaves iosHidUdid unset and existing options unchanged when the arg is absent", () => {
    const env = { [CONTROL_CAPABILITY_ENV]: "capability-fixture" };
    const options = parseCliOptions(["--mode", "mock", "--slot", "1"], env);
    expect(options.iosHidUdid).toBeUndefined();
    expect(options.mode).toBe("mock");
  });

  it("threads a supervisor-provided socket root only when iosHidUdid is set", () => {
    const env = {
      [CONTROL_CAPABILITY_ENV]: "capability-fixture",
      NATIVE_E2E_IOS_HID_SOCKET_ROOT: "/tmp/pora-supervisor-hid",
    };
    const withUdid = parseCliOptions(
      ["--mode", "mock", "--slot", "1", "--ios-hid-udid", VALID_UDID],
      env,
    );
    expect(withUdid.iosHidUdid).toBe(VALID_UDID);
    expect(withUdid.iosHidSocketRoot).toBe("/tmp/pora-supervisor-hid");
    const withoutUdid = parseCliOptions(["--mode", "mock", "--slot", "1"], env);
    expect(withoutUdid.iosHidSocketRoot).toBeUndefined();
    const emptyRoot = parseCliOptions(
      ["--mode", "mock", "--slot", "1", "--ios-hid-udid", VALID_UDID],
      { ...env, NATIVE_E2E_IOS_HID_SOCKET_ROOT: "" },
    );
    expect(emptyRoot.iosHidSocketRoot).toBeUndefined();
  });
});
