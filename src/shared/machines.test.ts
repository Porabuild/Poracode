import { describe, expect, it } from "vitest";
import {
  agentEnvForLocation,
  agentEnvForStatus,
  agentEnvKey,
  localMachineKey,
  machineKey,
  machineKeyForLocation,
  machineKeySchema,
  parseMachineKey,
  type MachineRef,
} from "./machines";

describe("machineKey", () => {
  const cases: [MachineRef, string][] = [
    [{ host: "local", env: { kind: "native" } }, "local"],
    [{ host: "local", env: { kind: "wsl", distro: "Ubuntu" } }, "local/wsl:Ubuntu"],
    [{ host: "remote", desktopId: "desk-1", env: { kind: "native" } }, "remote:desk-1"],
    [
      { host: "remote", desktopId: "desk-1", env: { kind: "wsl", distro: "Debian" } },
      "remote:desk-1/wsl:Debian",
    ],
  ];

  it.each(cases)("round-trips %j", (ref, key) => {
    expect(machineKey(ref)).toBe(key);
    expect(parseMachineKey(key)).toEqual(ref);
    expect(machineKeySchema.safeParse(key).success).toBe(true);
  });

  it("keeps the historical env-key strings", () => {
    expect(agentEnvKey({ kind: "native" })).toBe("native");
    expect(agentEnvKey({ kind: "wsl", distro: "Ubuntu" })).toBe("wsl:Ubuntu");
  });

  it("rejects malformed keys", () => {
    for (const key of ["", "remote:", "local/wsl:", "desktop:x", "wsl:Ubuntu"]) {
      expect(parseMachineKey(key)).toBeUndefined();
      expect(machineKeySchema.safeParse(key).success).toBe(false);
    }
  });

  it("splits on the last /wsl: marker", () => {
    expect(parseMachineKey("remote:a/wsl:b/wsl:Ubuntu")).toEqual({
      host: "remote",
      desktopId: "a/wsl:b",
      env: { kind: "wsl", distro: "Ubuntu" },
    });
  });
});

describe("env derivation", () => {
  it("maps statuses to envs (windows and posix are host-native)", () => {
    expect(agentEnvForStatus({ envKind: "windows" })).toEqual({ kind: "native" });
    expect(agentEnvForStatus({ envKind: "posix" })).toEqual({ kind: "native" });
    expect(agentEnvForStatus({ envKind: "wsl", envDistro: "Ubuntu" })).toEqual({
      kind: "wsl",
      distro: "Ubuntu",
    });
    expect(agentEnvForStatus({ envKind: "wsl" })).toEqual({ kind: "native" });
  });

  it("maps locations to machine keys, honoring remote hosts", () => {
    expect(agentEnvForLocation({ kind: "windows" })).toEqual({ kind: "native" });
    expect(machineKeyForLocation({ kind: "windows", remoteServerId: undefined })).toBe("local");
    expect(machineKeyForLocation({ kind: "wsl", distro: "Ubuntu" })).toBe("local/wsl:Ubuntu");
    expect(machineKeyForLocation({ kind: "posix", remoteServerId: "desk-9" })).toBe(
      "remote:desk-9",
    );
    expect(localMachineKey({ kind: "wsl", distro: "Ubuntu" })).toBe("local/wsl:Ubuntu");
  });
});
