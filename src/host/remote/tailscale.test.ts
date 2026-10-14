import { describe, expect, it, vi } from "vitest";
import {
  buildTailscaleHttpsUrl,
  disableTailscaleServe,
  enableTailscaleServe,
  launchTailscaleApp,
  probeTailscaleStatus,
  type TailscaleLaunchDeps,
  type TailscaleRunner,
} from "./tailscale";

function runnerReturning(stdout: string): TailscaleRunner {
  return vi.fn<TailscaleRunner>(async () => ({ stdout, stderr: "" }));
}

function runnerThrowing(error: unknown): TailscaleRunner {
  return vi.fn<TailscaleRunner>(async () => {
    throw error;
  });
}

describe("probeTailscaleStatus", () => {
  it("reports running with MagicDNS name and HTTPS availability", async () => {
    const runner = runnerReturning(
      JSON.stringify({
        BackendState: "Running",
        Self: { DNSName: "my-machine.tailnet-1234.ts.net." },
        CertDomains: ["my-machine.tailnet-1234.ts.net"],
      }),
    );
    const status = await probeTailscaleStatus(runner);
    expect(status).toEqual({
      state: "running",
      dnsName: "my-machine.tailnet-1234.ts.net",
      httpsAvailable: true,
    });
    expect(runner).toHaveBeenCalledWith(["status", "--json"], expect.anything());
  });

  it("treats missing CertDomains as HTTPS unknown-but-try", async () => {
    const runner = runnerReturning(
      JSON.stringify({ BackendState: "Running", Self: { DNSName: "host.example.ts.net" } }),
    );
    const status = await probeTailscaleStatus(runner);
    expect(status).toMatchObject({ state: "running", httpsAvailable: true });
  });

  it("reports HTTPS unavailable when CertDomains is empty", async () => {
    const runner = runnerReturning(
      JSON.stringify({
        BackendState: "Running",
        Self: { DNSName: "host.example.ts.net" },
        CertDomains: [],
      }),
    );
    const status = await probeTailscaleStatus(runner);
    expect(status).toMatchObject({ state: "running", httpsAvailable: false });
  });

  it("reports not-running for a stopped backend", async () => {
    const runner = runnerReturning(JSON.stringify({ BackendState: "Stopped" }));
    expect(await probeTailscaleStatus(runner)).toEqual({ state: "not-running" });
  });

  it("reports needs-login when the daemon needs login", async () => {
    const runner = runnerReturning(JSON.stringify({ BackendState: "NeedsLogin" }));
    expect(await probeTailscaleStatus(runner)).toEqual({ state: "needs-login" });
  });

  it("reports needs-login when the daemon needs machine authorization", async () => {
    const runner = runnerReturning(JSON.stringify({ BackendState: "NeedsMachineAuth" }));
    expect(await probeTailscaleStatus(runner)).toEqual({ state: "needs-login" });
  });

  it("parses stopped JSON printed on stdout of a non-zero exit", async () => {
    const runner = runnerThrowing({
      code: 1,
      stdout: JSON.stringify({ BackendState: "Stopped" }),
      stderr: "Tailscale is stopped.",
    });
    expect(await probeTailscaleStatus(runner)).toEqual({ state: "not-running" });
  });

  it("reports not-installed on ENOENT", async () => {
    const runner = runnerThrowing(Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
    expect(await probeTailscaleStatus(runner)).toEqual({ state: "not-installed" });
  });

  it("reports error on malformed JSON", async () => {
    const runner = runnerReturning("not json at all");
    const status = await probeTailscaleStatus(runner);
    expect(status.state).toBe("error");
  });

  it("maps a connection failure message to not-running", async () => {
    const runner = runnerThrowing(new Error("failed to connect to local tailscaled"));
    expect(await probeTailscaleStatus(runner)).toEqual({ state: "not-running" });
  });
});

describe("enableTailscaleServe", () => {
  it("constructs the background HTTPS serve command", async () => {
    const runner = runnerReturning("");
    const result = await enableTailscaleServe(38987, runner);
    expect(result).toEqual({ ok: true });
    expect(runner).toHaveBeenCalledWith(
      ["serve", "--bg", "--https=443", "http://127.0.0.1:38987"],
      expect.anything(),
    );
  });

  it("propagates the CLI stderr message on failure", async () => {
    const runner = runnerThrowing({
      message: "command failed",
      stderr: "HTTPS is not enabled on your tailnet.",
    });
    const result = await enableTailscaleServe(38987, runner);
    expect(result).toEqual({ ok: false, message: "HTTPS is not enabled on your tailnet." });
  });
});

describe("disableTailscaleServe", () => {
  it("targets only the HTTPS 443 handler", async () => {
    const runner = runnerReturning("");
    await disableTailscaleServe(runner);
    expect(runner).toHaveBeenCalledWith(["serve", "--https=443", "off"], expect.anything());
  });

  it("swallows teardown failures", async () => {
    const runner = runnerThrowing(new Error("nothing to turn off"));
    await expect(disableTailscaleServe(runner)).resolves.toBeUndefined();
  });
});

describe("launchTailscaleApp", () => {
  function makeDeps(overrides: Partial<TailscaleLaunchDeps>): TailscaleLaunchDeps {
    return {
      platform: "darwin",
      run: vi.fn<TailscaleLaunchDeps["run"]>(async () => {}),
      spawnDetached: vi.fn<TailscaleLaunchDeps["spawnDetached"]>(() => {}),
      fileExists: vi.fn<TailscaleLaunchDeps["fileExists"]>(() => true),
      ...overrides,
    };
  }

  it("opens the macOS app and reports success", async () => {
    const run = vi.fn<TailscaleLaunchDeps["run"]>(async () => {});
    const result = await launchTailscaleApp(makeDeps({ platform: "darwin", run }));
    expect(result).toEqual({ ok: true });
    expect(run).toHaveBeenCalledWith("open", ["-a", "Tailscale"]);
  });

  it("reports failure with the message when the macOS app is missing", async () => {
    const run = vi.fn<TailscaleLaunchDeps["run"]>(async () => {
      throw new Error("Unable to find application named 'Tailscale'");
    });
    const result = await launchTailscaleApp(makeDeps({ platform: "darwin", run }));
    expect(result).toEqual({
      ok: false,
      message: "Unable to find application named 'Tailscale'",
    });
  });

  it("spawns the Windows GUI binary when it exists", async () => {
    const spawnDetached = vi.fn<TailscaleLaunchDeps["spawnDetached"]>(() => {});
    const result = await launchTailscaleApp(
      makeDeps({ platform: "win32", fileExists: () => true, spawnDetached }),
    );
    expect(result).toEqual({ ok: true });
    expect(spawnDetached).toHaveBeenCalledTimes(1);
  });

  it("reports not installed on Windows when the GUI binary is absent", async () => {
    const spawnDetached = vi.fn<TailscaleLaunchDeps["spawnDetached"]>(() => {});
    const result = await launchTailscaleApp(
      makeDeps({ platform: "win32", fileExists: () => false, spawnDetached }),
    );
    expect(result.ok).toBe(false);
    expect(spawnDetached).not.toHaveBeenCalled();
  });

  it("returns an actionable systemd message on Linux", async () => {
    const result = await launchTailscaleApp(makeDeps({ platform: "linux" }));
    expect(result).toEqual({
      ok: false,
      message: "Start the Tailscale daemon with: sudo systemctl start tailscaled",
    });
  });
});

describe("buildTailscaleHttpsUrl", () => {
  it("builds an https origin without a trailing slash and strips a trailing dot", () => {
    expect(buildTailscaleHttpsUrl("host.example.ts.net.")).toBe("https://host.example.ts.net");
    expect(buildTailscaleHttpsUrl("  host.example.ts.net  ")).toBe("https://host.example.ts.net");
  });
});
