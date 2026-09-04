import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { HelperComputerUseDriver, HelperUnavailableError } from "./helper";

const fixturePath = fileURLToPath(new URL("./__fixtures__/fakeHelper.cjs", import.meta.url));
const drivers: HelperComputerUseDriver[] = [];

function createDriver(protocol = 1, extraEnv: NodeJS.ProcessEnv = {}): HelperComputerUseDriver {
  const driver = new HelperComputerUseDriver({
    binaryPath: process.execPath,
    stateDir: ".",
    spawn: () =>
      spawn(process.execPath, [fixturePath], {
        env: { ...process.env, FAKE_HELPER_PROTOCOL: String(protocol), ...extraEnv },
      }),
  });
  drivers.push(driver);
  return driver;
}

afterEach(() => {
  for (const driver of drivers.splice(0)) driver.dispose();
});

describe("HelperComputerUseDriver", () => {
  it("handshakes lazily and forwards delivery modes", async () => {
    const driver = createDriver();
    await expect(driver.describeStatus()).resolves.toMatchObject({
      backend: "helper",
      helper: { protocolVersion: 1, helperVersion: "fixture" },
      capabilities: { backgroundPointer: true },
    });
    await expect(
      driver.click({ window: { app: "fixture", id: 1 }, x: 2, y: 3 }),
    ).resolves.toMatchObject({
      ok: true,
      delivery: { delivered: "background", route: "message" },
    });
    await expect(
      driver.click({
        window: { app: "fixture", id: 1 },
        x: 2,
        y: 3,
        mode: "foreground",
      }),
    ).resolves.toMatchObject({
      ok: true,
      delivery: { delivered: "foreground", route: "input" },
    });
  });

  it("passes through structured refusals and element results", async () => {
    const driver = createDriver();
    await expect(
      driver.click({ window: { app: "fixture", id: 1 }, x: -1, y: 3 }),
    ).resolves.toMatchObject({
      ok: false,
      refused: { code: "background_unavailable", reason: "fixture refusal" },
    });
    await expect(
      driver.findElements({ window: { app: "fixture", id: 1 }, role: "button" }),
    ).resolves.toMatchObject({
      snapshotId: "s1",
      elements: [{ id: "s1:0", role: "button" }],
    });
  });

  it("rejects a protocol mismatch with a stable degradation code", async () => {
    const error = await createDriver(2)
      .describeStatus()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HelperUnavailableError);
    expect(error).toMatchObject({ code: "protocol_mismatch" });
  });

  it("classifies a helper exit during hello as a handshake failure", async () => {
    const error = await createDriver(1, { FAKE_HELPER_EXIT_ON_HELLO: "1" })
      .describeStatus()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HelperUnavailableError);
    expect(error).toMatchObject({ code: "handshake_failed" });
  });
});
