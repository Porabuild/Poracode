import { afterEach, describe, expect, it } from "vitest";
import { ControlServer, createMockControlPlane } from "./harness/controlServer.ts";
import { assertLoopbackHost } from "./harness/loopback.ts";
import { startLab } from "./helpers/testClient.ts";
import { WireLab } from "./harness/wireLab.ts";

describe("loopback-only binds", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;
  let lab: WireLab | undefined;
  let control: ControlServer | undefined;

  afterEach(async () => {
    await control?.stop();
    control = undefined;
    await lab?.stop();
    lab = undefined;
    await harness?.stop();
    harness = undefined;
  });

  it("rejects non-loopback bind hosts", () => {
    expect(() => assertLoopbackHost("0.0.0.0")).toThrow(/loopback-only/);
    expect(() => assertLoopbackHost("192.168.1.10")).toThrow(/loopback-only/);
    expect(assertLoopbackHost("127.0.0.1")).toBe("127.0.0.1");
    expect(assertLoopbackHost("::1")).toBe("::1");
  });

  it("refuses to start the control server on 0.0.0.0", async () => {
    harness = await startLab();
    control = new ControlServer(createMockControlPlane(harness.lab), {
      host: "0.0.0.0",
      port: 0,
      capability: harness.capability,
    });
    await expect(control.start()).rejects.toThrow(/loopback-only/);
  });

  it("refuses to start the wire lab on 0.0.0.0", async () => {
    lab = new WireLab({ host: "0.0.0.0", port: 0, allowEphemeralPort: true });
    await expect(lab.start()).rejects.toThrow(/loopback-only/);
  });
});
