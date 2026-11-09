import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServiceCliOptions } from "./serverService";
import { pairWhenReady, parseUpCliOptions, runUp, runUpCli } from "./cliUp";
import { describeUpReachability } from "./cliUpReachability";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** An installer-managed prefix with one self-contained release. */
function installedPrefix() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "poracode-up-")));
  roots.push(root);
  const prefix = join(root, "prefix");
  const release = join(prefix, "releases", "2.0.0");
  mkdirSync(join(release, "runtime"), { recursive: true });
  writeFileSync(join(release, "runtime", "node"), "");
  writeFileSync(
    join(release, "standalone.json"),
    JSON.stringify({
      formatVersion: 1,
      kind: "poracode-standalone-runtime",
      version: "2.0.0",
      target: "linux-x64",
      node: { version: "26.13.0", executable: "runtime/node" },
    }),
  );
  symlinkSync("releases/2.0.0", join(prefix, "current"));
  return { root, prefix, release, profile: join(root, "profile") };
}

function recorder() {
  const configured: (readonly string[])[] = [];
  const services: ServiceCliOptions["action"][] = [];
  const serviceCalls: ServiceCliOptions[] = [];
  const events: string[] = [];
  return {
    configured,
    services,
    serviceCalls,
    events,
    configure: async (_profile: string, args: readonly string[]) => {
      configured.push(args);
      events.push("configure");
    },
    service: async (_profile: string, options: ServiceCliOptions) => {
      services.push(options.action);
      serviceCalls.push(options);
      events.push(`service:${options.action}`);
    },
  };
}

/** Non-interactive deps with no detected addresses; override per test. */
const quiet = {
  interactive: false,
  tailnetAddress: () => undefined,
  lanAddress: () => undefined,
  ownerRunning: async () => false,
} as const;

describe("parseUpCliOptions", () => {
  it("accepts one reachability choice, a relay and service opt-out", () => {
    expect(parseUpCliOptions([])).toEqual({ service: true, pair: true });
    expect(
      parseUpCliOptions([
        "--lan",
        "--relay-url",
        "https://relay.example",
        "--no-service",
        "--no-pair",
      ]),
    ).toEqual({
      reachability: "lan",
      relayUrl: "https://relay.example",
      service: false,
      pair: false,
    });
    expect(() => parseUpCliOptions(["--lan", "--tailnet"])).toThrow(/Choose one/u);
    expect(parseUpCliOptions(["--relay-url", "wss://relay.example"])).toMatchObject({
      relayUrl: "wss://relay.example",
    });
    expect(parseUpCliOptions(["--relay-url", "https://relay.example"])).toMatchObject({
      relayUrl: "https://relay.example",
    });
    for (const bad of ["ws://relay", "http://relay", "not a url"]) {
      expect(() => parseUpCliOptions(["--relay-url", bad])).toThrow(/wss:\/\/ or https:\/\//u);
    }
    expect(() => parseUpCliOptions(["--public"])).toThrow(/Unknown up argument/u);
  });
});

describe.runIf(process.platform !== "win32")("runUp", () => {
  it("configures an encrypted LAN listener, installs and starts the service", async () => {
    const context = installedPrefix();
    const steps = recorder();
    const result = await runUp(
      { reachability: "lan", service: true, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        ensureTls: () => ({
          certPath: "/p/tls/server.crt",
          keyPath: "/p/tls/server.key",
          created: true,
        }),
        lingerEnabled: () => false,
        platform: "linux",
        ...quiet,
      },
    );
    expect(steps.configured).toEqual([
      [
        "--bind-mode",
        "lan",
        "--tls-cert",
        join(context.profile, "tls", "server.crt"),
        "--tls-key",
        join(context.profile, "tls", "server.key"),
      ],
    ]);
    expect(steps.services).toEqual(["install", "start"]);
    expect(result).toMatchObject({
      prefix: context.prefix,
      service: "installed-started",
      tlsCreated: true,
      reachability: "lan",
      reachable: true,
    });
    expect(result.notes.join("\n")).toMatch(/loginctl enable-linger/u);
  });

  it("fails non-interactively naming the flags when nothing is saved", async () => {
    const context = installedPrefix();
    const steps = recorder();
    let tlsCalls = 0;
    await expect(
      runUp(
        { service: true, pair: false },
        {
          profile: context.profile,
          releaseRoot: context.release,
          configure: steps.configure,
          service: steps.service,
          ensureTls: () => {
            tlsCalls += 1;
            return { certPath: "/p/tls/server.crt", keyPath: "/p/tls/server.key", created: true };
          },
          ...quiet,
        },
      ),
    ).rejects.toThrow(/--tailnet.*--lan.*--local-only.*Nothing was changed/u);
    expect(steps.configured).toEqual([]);
    expect(steps.services).toEqual([]);
    expect(tlsCalls).toBe(0);
    expect(existsSync(`${context.profile}.server.json`)).toBe(false);
  });

  it("keeps saved settings non-interactively: start a registered service, configure nothing", async () => {
    const context = installedPrefix();
    writeFileSync(`${context.profile}.server.json`, JSON.stringify({ bindMode: "tailnet" }));
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    const steps = recorder();
    const result = await runUp(
      { service: true, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        lingerEnabled: () => true,
        platform: "linux",
        ...quiet,
      },
    );
    expect(steps.configured).toEqual([]);
    expect(steps.services).toEqual(["start"]);
    expect(result.service).toBe("running");
    expect(result.reachability).toBe("tailnet");
  });

  it("does not rewrite settings when a flag repeats the saved choice", async () => {
    const context = installedPrefix();
    writeFileSync(`${context.profile}.server.json`, JSON.stringify({ bindMode: "tailnet" }));
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    const steps = recorder();
    const result = await runUp(
      { reachability: "tailnet", service: true, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        lingerEnabled: () => true,
        platform: "linux",
        ...quiet,
      },
    );
    expect(steps.configured).toEqual([]);
    expect(steps.services).toEqual(["start"]);
    expect(result.service).toBe("running");
  });

  it("asks for the reachability choice interactively and plans LAN with TLS", async () => {
    const context = installedPrefix();
    writeFileSync(`${context.profile}.server.json`, JSON.stringify({ bindMode: "tailnet" }));
    const steps = recorder();
    const seen: unknown[] = [];
    const result = await runUp(
      { service: true, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        ensureTls: () => ({
          certPath: "/p/tls/server.crt",
          keyPath: "/p/tls/server.key",
          created: true,
        }),
        lingerEnabled: () => true,
        platform: "linux",
        interactive: true,
        tailnetAddress: () => "100.64.0.7",
        lanAddress: () => "192.168.1.20",
        ownerRunning: async () => false,
        chooseReachability: async (input) => {
          seen.push(input);
          return "lan";
        },
      },
    );
    expect(seen).toEqual([
      {
        current: "tailnet",
        tailnetAddress: "100.64.0.7",
        lanAddress: "192.168.1.20",
      },
    ]);
    expect(steps.configured).toEqual([
      [
        "--bind-mode",
        "lan",
        "--tls-cert",
        join(context.profile, "tls", "server.crt"),
        "--tls-key",
        join(context.profile, "tls", "server.key"),
      ],
    ]);
    expect(result.tlsCreated).toBe(true);
    expect(result.reachability).toBe("lan");
    expect(result.reachable).toBe(true);
    expect(steps.services).toEqual(["install", "start"]);
  });

  it("keeps a saved custom TLS pair when LAN is re-chosen", async () => {
    const context = installedPrefix();
    writeFileSync(
      `${context.profile}.server.json`,
      JSON.stringify({
        bindMode: "lan",
        tlsCert: "/certs/custom.crt",
        tlsKey: "/certs/custom.key",
      }),
    );
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    const steps = recorder();
    let tlsCalls = 0;
    const result = await runUp(
      { reachability: "lan", service: true, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        ensureTls: () => {
          tlsCalls += 1;
          return { certPath: "/p/tls/server.crt", keyPath: "/p/tls/server.key", created: true };
        },
        lingerEnabled: () => true,
        platform: "linux",
        ...quiet,
      },
    );
    expect(steps.configured).toEqual([]);
    expect(tlsCalls).toBe(0);
    expect(steps.services).toEqual(["start"]);
    expect(result.service).toBe("running");
    expect(result.tlsCreated).toBe(false);
    expect(result.customTls).toBe(true);
    expect(describeUpReachability(result)).not.toMatch(/self-signed/u);
  });

  it("switches bind modes with a saved custom pair without touching TLS", async () => {
    const context = installedPrefix();
    writeFileSync(
      `${context.profile}.server.json`,
      JSON.stringify({
        bindMode: "tailnet",
        tlsCert: "/certs/custom.crt",
        tlsKey: "/certs/custom.key",
      }),
    );
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    const steps = recorder();
    let tlsCalls = 0;
    const result = await runUp(
      { reachability: "lan", service: true, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        ensureTls: () => {
          tlsCalls += 1;
          return { certPath: "/p/tls/server.crt", keyPath: "/p/tls/server.key", created: true };
        },
        lingerEnabled: () => true,
        platform: "linux",
        ...quiet,
      },
    );
    expect(steps.configured).toEqual([["--bind-mode", "lan"]]);
    expect(tlsCalls).toBe(0);
    expect(steps.services).toEqual(["restart"]);
    expect(result.service).toBe("restarted");
  });

  it("recreates missing profile TLS for a saved profile pair on LAN", async () => {
    const context = installedPrefix();
    writeFileSync(
      `${context.profile}.server.json`,
      JSON.stringify({
        bindMode: "lan",
        tlsCert: join(context.profile, "tls", "server.crt"),
        tlsKey: join(context.profile, "tls", "server.key"),
      }),
    );
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    const steps = recorder();
    let tlsCalls = 0;
    const result = await runUp(
      { reachability: "lan", service: true, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        ensureTls: () => {
          tlsCalls += 1;
          return { certPath: "/p/tls/server.crt", keyPath: "/p/tls/server.key", created: true };
        },
        lingerEnabled: () => true,
        platform: "linux",
        ...quiet,
      },
    );
    expect(steps.configured).toEqual([]);
    expect(tlsCalls).toBe(1);
    expect(steps.services).toEqual(["restart"]);
    expect(result.service).toBe("restarted");
    expect(result.tlsCreated).toBe(true);
  });

  it("never creates TLS when a saved LAN is kept without a new choice", async () => {
    const context = installedPrefix();
    writeFileSync(
      `${context.profile}.server.json`,
      JSON.stringify({
        bindMode: "lan",
        tlsCert: join(context.profile, "tls", "server.crt"),
        tlsKey: join(context.profile, "tls", "server.key"),
      }),
    );
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    const steps = recorder();
    let tlsCalls = 0;
    const result = await runUp(
      { service: true, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        ensureTls: () => {
          tlsCalls += 1;
          return { certPath: "/p/tls/server.crt", keyPath: "/p/tls/server.key", created: true };
        },
        lingerEnabled: () => true,
        platform: "linux",
        ...quiet,
      },
    );
    expect(steps.configured).toEqual([]);
    expect(tlsCalls).toBe(0);
    expect(steps.services).toEqual(["start"]);
    expect(result.service).toBe("running");
  });

  it("keeps a loopback saved host local and unreachable", async () => {
    const context = installedPrefix();
    writeFileSync(`${context.profile}.server.json`, JSON.stringify({ host: "127.0.0.1" }));
    const steps = recorder();
    const result = await runUp(
      { service: false, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        ...quiet,
      },
    );
    expect(result.reachability).toBe("custom");
    expect(result.reachable).toBe(false);
    expect(result.notes.join("\n")).toContain(
      "Your saved host 127.0.0.1 keeps the server on this machine",
    );
  });

  it("declines a restart confirmation before writing anything", async () => {
    const context = installedPrefix();
    writeFileSync(`${context.profile}.server.json`, JSON.stringify({ bindMode: "tailnet" }));
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    const steps = recorder();
    let tlsCalls = 0;
    let confirmCalls = 0;
    await expect(
      runUp(
        { reachability: "local", service: true, pair: false },
        {
          profile: context.profile,
          releaseRoot: context.release,
          configure: steps.configure,
          service: steps.service,
          ensureTls: () => {
            tlsCalls += 1;
            return { certPath: "/p/tls/server.crt", keyPath: "/p/tls/server.key", created: true };
          },
          lingerEnabled: () => true,
          platform: "linux",
          interactive: true,
          ownerRunning: async () => true,
          confirmRestart: async () => {
            confirmCalls += 1;
            return false;
          },
        },
      ),
    ).rejects.toThrow(/Nothing was changed/u);
    expect(confirmCalls).toBe(1);
    expect(steps.configured).toEqual([]);
    expect(steps.services).toEqual([]);
    expect(tlsCalls).toBe(0);
  });

  it("configures before restarting a registered service when confirmed", async () => {
    const context = installedPrefix();
    writeFileSync(`${context.profile}.server.json`, JSON.stringify({ bindMode: "tailnet" }));
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    const steps = recorder();
    const result = await runUp(
      { reachability: "local", service: true, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        lingerEnabled: () => true,
        platform: "linux",
        interactive: true,
        ownerRunning: async () => true,
        confirmRestart: async () => true,
      },
    );
    expect(steps.configured).toEqual([["--bind-mode", "loopback"]]);
    expect(steps.services).toEqual(["restart"]);
    expect(steps.events).toEqual(["configure", "service:restart"]);
    expect(result.service).toBe("restarted");
  });

  it("restarts non-interactively with a note about running agent turns", async () => {
    const context = installedPrefix();
    writeFileSync(`${context.profile}.server.json`, JSON.stringify({ bindMode: "tailnet" }));
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    const steps = recorder();
    let confirmCalls = 0;
    const result = await runUp(
      { reachability: "local", service: true, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        lingerEnabled: () => true,
        platform: "linux",
        interactive: false,
        ownerRunning: async () => true,
        confirmRestart: async () => {
          confirmCalls += 1;
          return true;
        },
      },
    );
    expect(confirmCalls).toBe(0);
    expect(steps.configured).toEqual([["--bind-mode", "loopback"]]);
    expect(steps.services).toEqual(["restart"]);
    expect(result.service).toBe("restarted");
    expect(result.notes.join("\n")).toMatch(/agent turns/u);
  });

  it("writes loopback for a fresh local choice and starts the registered service", async () => {
    const context = installedPrefix();
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    const steps = recorder();
    const result = await runUp(
      { reachability: "local", service: true, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        lingerEnabled: () => true,
        platform: "linux",
        ...quiet,
      },
    );
    expect(steps.configured).toEqual([["--bind-mode", "loopback"]]);
    expect(steps.services).toEqual(["start"]);
    expect(result.service).toBe("running");
    expect(result.reachability).toBe("local");
    expect(result.reachable).toBe(false);
  });

  it("warns that tailnet without Tailscale keeps the server local", async () => {
    const context = installedPrefix();
    const steps = recorder();
    const result = await runUp(
      { reachability: "tailnet", service: true, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        lingerEnabled: () => true,
        platform: "linux",
        ...quiet,
      },
    );
    expect(result.reachability).toBe("tailnet");
    expect(result.reachable).toBe(false);
    expect(result.notes.join("\n")).toMatch(
      new RegExp(`poracode service restart --prefix ${context.prefix}`, "u"),
    );
  });

  it("keeps the saved bind mode for --relay-url alone and reports only the relay host", async () => {
    const context = installedPrefix();
    const steps = recorder();
    const result = await runUp(
      {
        relayUrl: "https://user:pw@relay.example/x",
        service: false,
        pair: false,
      },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        ...quiet,
      },
    );
    expect(steps.configured).toEqual([["--relay-url", "https://user:pw@relay.example/x"]]);
    expect(result.service).toBe("skipped");
    expect(result.relayHost).toBe("relay.example");
    expect(result.reachable).toBe(true);
    expect(result.reachability).toBe("local");
  });

  it("reports a saved host as custom and notes the override", async () => {
    const context = installedPrefix();
    writeFileSync(`${context.profile}.server.json`, JSON.stringify({ host: "192.168.1.50" }));
    const steps = recorder();
    const result = await runUp(
      { reachability: "tailnet", service: false, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        configure: steps.configure,
        service: steps.service,
        ...quiet,
      },
    );
    expect(result.reachability).toBe("custom");
    expect(result.savedHost).toBe("192.168.1.50");
    expect(result.reachable).toBe(true);
    expect(result.notes.join("\n")).toMatch(/poracode configure --unset host/u);
  });

  it("saves tailnet and relay settings without a service when asked", async () => {
    const context = installedPrefix();
    const steps = recorder();
    const result = await runUp(
      { reachability: "tailnet", relayUrl: "https://relay.example", service: false, pair: false },
      {
        profile: context.profile,
        releaseRoot: context.release,
        ...steps,
        platform: "darwin",
        ...quiet,
      },
    );
    expect(steps.configured).toEqual([
      ["--bind-mode", "tailnet", "--relay-url", "https://relay.example"],
    ]);
    expect(steps.services).toEqual([]);
    expect(result.service).toBe("skipped");
  });

  it("saves settings without a service when no installer prefix exists", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "poracode-up-plain-")));
    roots.push(root);
    const releaseRoot = join(root, "runtime");
    mkdirSync(releaseRoot, { recursive: true });
    const steps = recorder();
    const result = await runUp(
      { reachability: "tailnet", service: true, pair: false },
      {
        profile: join(root, "profile"),
        releaseRoot,
        configure: steps.configure,
        service: steps.service,
        env: { PORACODE_INSTALL_DIR: join(root, "missing") },
        lingerEnabled: () => true,
        platform: "linux",
        ...quiet,
      },
    );
    expect(steps.configured).toEqual([["--bind-mode", "tailnet"]]);
    expect(steps.services).toEqual([]);
    expect(result.service).toBe("unavailable");
    expect(result.prefix).toBeUndefined();
    const notes = result.notes.join("\n");
    expect(notes).toMatch(/one-line installer/u);
    expect(notes).toMatch(/install\.sh/u);
    expect(notes).not.toMatch(/PORACODE_CHANNEL/u);
  });

  it("suggests the nightly installer one-liner for a nightly build", async () => {
    for (const platform of ["linux", "win32"] as const) {
      const root = realpathSync(mkdtempSync(join(tmpdir(), "poracode-up-nightly-")));
      roots.push(root);
      const releaseRoot = join(root, "runtime");
      mkdirSync(releaseRoot, { recursive: true });
      writeFileSync(
        join(releaseRoot, "standalone.json"),
        JSON.stringify({
          formatVersion: 1,
          kind: "poracode-standalone-runtime",
          version: "2.0.0-nightly.202611090222",
          target: "linux-x64",
          node: { version: "26.13.0", executable: "runtime/node" },
        }),
      );
      const steps = recorder();
      const result = await runUp(
        { reachability: "tailnet", service: true, pair: false },
        {
          profile: join(root, "profile"),
          releaseRoot,
          configure: steps.configure,
          service: steps.service,
          env: { PORACODE_INSTALL_DIR: join(root, "missing") },
          lingerEnabled: () => true,
          platform,
          ...quiet,
        },
      );
      expect(result.service).toBe("unavailable");
      const expected =
        platform === "win32"
          ? "$env:PORACODE_CHANNEL = 'nightly'; irm https://poracode.com/install.ps1 | iex"
          : "curl -fsSL https://poracode.com/install.sh | PORACODE_CHANNEL=nightly sh";
      expect(result.notes.join("\n")).toContain(expected);
    }
  });

  it("uses the one-line installer's prefix for the service from another install", async () => {
    const context = installedPrefix();
    const root = realpathSync(mkdtempSync(join(tmpdir(), "poracode-up-foreign-")));
    roots.push(root);
    const releaseRoot = join(root, "runtime");
    mkdirSync(releaseRoot, { recursive: true });
    const steps = recorder();
    const result = await runUp(
      { reachability: "tailnet", service: true, pair: false },
      {
        profile: join(root, "profile"),
        releaseRoot,
        configure: steps.configure,
        service: steps.service,
        env: { PORACODE_INSTALL_DIR: context.prefix },
        lingerEnabled: () => true,
        platform: "linux",
        ...quiet,
      },
    );
    expect(steps.configured).toEqual([["--bind-mode", "tailnet"]]);
    expect(steps.services).toEqual(["install", "start"]);
    expect(steps.serviceCalls.map((call) => call.prefix)).toEqual([context.prefix, context.prefix]);
    expect(result.service).toBe("installed-started");
    expect(result.prefix).toBe(context.prefix);
    expect(result.notes.join("\n")).toMatch(/Using the one-line installer's prefix/u);
  });
});

describe("pairWhenReady", () => {
  it("creates a pairing grant only once the service answers", async () => {
    const paired: string[] = [];
    const ready = await pairWhenReady({
      profile: "/profile",
      timeoutMs: 1_000,
      waitForOwner: async (profile, timeoutMs) => profile === "/profile" && timeoutMs === 1_000,
      pair: async (profile) => {
        paired.push(profile);
      },
    });
    expect(ready).toBe(true);
    expect(paired).toEqual(["/profile"]);
  });

  it("never creates a grant when the service did not answer", async () => {
    const paired: string[] = [];
    const ready = await pairWhenReady({
      profile: "/profile",
      waitForOwner: async () => false,
      pair: async (profile) => {
        paired.push(profile);
      },
    });
    expect(ready).toBe(false);
    expect(paired).toEqual([]);
  });
});

describe.runIf(process.platform !== "win32")("runUpCli pairing hints", () => {
  function cliOutput() {
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    return () => output.mock.calls.map((call) => String(call[0])).join("");
  }

  it("prints no pair or retry hint for a custom loopback host", async () => {
    const context = installedPrefix();
    writeFileSync(`${context.profile}.server.json`, JSON.stringify({ host: "127.0.0.1" }));
    const text = cliOutput();
    await runUpCli({ service: false, pair: true }, context.profile, context.release);
    const out = text();
    expect(out).toContain("keeps the server on this machine");
    expect(out).not.toContain("Pair a phone or browser");
    expect(out).not.toContain("To let your other devices connect");
  });

  it("prints the pair hint for a reachable custom host", async () => {
    const context = installedPrefix();
    writeFileSync(`${context.profile}.server.json`, JSON.stringify({ host: "192.168.1.50" }));
    const text = cliOutput();
    await runUpCli({ service: false, pair: true }, context.profile, context.release);
    expect(text()).toContain("Pair a phone or browser: poracode pairings create --qr");
  });
});
