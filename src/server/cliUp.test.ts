import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ServiceCliOptions } from "./serverService";
import { pairWhenReady, parseUpCliOptions, runUp } from "./cliUp";

const roots: string[] = [];
afterEach(() => {
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
  return {
    configured,
    services,
    serviceCalls,
    configure: async (_profile: string, args: readonly string[]) => {
      configured.push(args);
    },
    service: async (_profile: string, options: ServiceCliOptions) => {
      services.push(options.action);
      serviceCalls.push(options);
    },
  };
}

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
      },
    );
    expect(steps.configured).toEqual([
      ["--bind-mode", "lan", "--tls-cert", "/p/tls/server.crt", "--tls-key", "/p/tls/server.key"],
    ]);
    expect(steps.services).toEqual(["install", "start"]);
    expect(result).toMatchObject({
      prefix: context.prefix,
      service: "installed-started",
      tlsCreated: true,
    });
    expect(result.notes.join("\n")).toMatch(/loginctl enable-linger/u);
  });

  it("restarts a registered service and never touches settings it was not asked to", async () => {
    const context = installedPrefix();
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
      },
    );
    expect(steps.configured).toEqual([]);
    expect(steps.services).toEqual(["restart"]);
    expect(result.notes).toEqual([]);
  });

  it("saves tailnet and relay settings without a service when asked", async () => {
    const context = installedPrefix();
    const steps = recorder();
    const result = await runUp(
      { reachability: "tailnet", relayUrl: "https://relay.example", service: false, pair: false },
      { profile: context.profile, releaseRoot: context.release, ...steps, platform: "darwin" },
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
      },
    );
    expect(steps.configured).toEqual([["--bind-mode", "tailnet"]]);
    expect(steps.services).toEqual([]);
    expect(result.service).toBe("unavailable");
    expect(result.prefix).toBeUndefined();
    const notes = result.notes.join("\n");
    expect(notes).toMatch(/one-line installer/u);
    expect(notes).toMatch(/install\.sh/u);
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
