import { describe, expect, it } from "vitest";
import {
  applyServeSettingsToEnv,
  DEFAULT_LOG_LEVEL,
  DEFAULT_LOG_MAX_BYTES,
  DEFAULT_LOG_MAX_FILES,
  DEFAULT_SHUTDOWN_DRAIN_DEADLINE_MS,
  loadServerConfigFile,
  parseServeCliOptions,
  REMOTE_ACCESS_HOST_ENV,
  REMOTE_ACCESS_PORT_ENV,
  REMOTE_RELAY_URL_ENV,
  resolveServeSettings,
  SERVE_USAGE,
  SERVER_CONFIG_FILE_NAME,
} from "./serverConfig";

describe("parseServeCliOptions", () => {
  it("accepts bare invocation and the explicit serve keyword", () => {
    expect(parseServeCliOptions([])).toEqual({});
    expect(parseServeCliOptions(["serve"])).toEqual({});
  });

  it("parses host, port, and config flags", () => {
    expect(parseServeCliOptions(["--host", "0.0.0.0", "--port", "49200"])).toEqual({
      host: "0.0.0.0",
      port: 49200,
    });
    expect(parseServeCliOptions(["serve", "--config", "/tmp/p.json", "--port", "1"])).toEqual({
      config: "/tmp/p.json",
      port: 1,
    });
  });

  it("rejects unknown flags, missing values, and out-of-range ports", () => {
    expect(() => parseServeCliOptions(["--signal"])).toThrow(SERVE_USAGE);
    expect(() => parseServeCliOptions(["serve", "pair"])).toThrow(SERVE_USAGE);
    expect(() => parseServeCliOptions(["--host"])).toThrow(SERVE_USAGE);
    expect(() => parseServeCliOptions(["--port", "70000"])).toThrow(SERVE_USAGE);
    expect(() => parseServeCliOptions(["--port", "not-a-port"])).toThrow(SERVE_USAGE);
  });
});

describe("loadServerConfigFile", () => {
  const read = (text: string | undefined) => () => text;

  it("treats a missing file as no configuration", () => {
    expect(
      loadServerConfigFile({ path: "/profile/poracode-server.json", readText: read(undefined) }),
    ).toBeUndefined();
  });

  it("parses known fields and rejects unknown ones", () => {
    const file = loadServerConfigFile({
      path: "config.json",
      readText: read(JSON.stringify({ host: "127.0.0.1", port: 49200, bindMode: "tailnet" })),
    });
    expect(file).toMatchObject({ host: "127.0.0.1", port: 49200, bindMode: "tailnet" });

    expect(() =>
      loadServerConfigFile({
        path: "config.json",
        readText: read(JSON.stringify({ logLevle: "debug" })),
      }),
    ).toThrow(/invalid/i);
  });

  it("fails loudly on malformed JSON", () => {
    expect(() => loadServerConfigFile({ path: "config.json", readText: read("{oops") })).toThrow(
      /not valid JSON/u,
    );
  });
});

describe("resolveServeSettings", () => {
  const defaultConfigPath = `/profile/${SERVER_CONFIG_FILE_NAME}`;
  const read = (text: string | undefined) => () => text;

  it("applies built-in defaults with no flags, env, or file", () => {
    const settings = resolveServeSettings({
      flags: {},
      env: {},
      defaultConfigPath,
      readText: read(undefined),
    });
    expect(settings).toMatchObject({
      logLevel: DEFAULT_LOG_LEVEL,
      logMaxBytes: DEFAULT_LOG_MAX_BYTES,
      logMaxFiles: DEFAULT_LOG_MAX_FILES,
      shutdownDrainDeadlineMs: DEFAULT_SHUTDOWN_DRAIN_DEADLINE_MS,
    });
    expect(settings.configPath).toBeUndefined();
    expect(settings.remoteAccessHost).toBeUndefined();
    expect(settings.warnings).toEqual([]);
  });

  it("reads values from the config file", () => {
    const file = JSON.stringify({
      host: "127.0.0.1",
      port: 49201,
      relayUrl: "wss://relay.example.test/host",
      logLevel: "debug",
      logMaxBytes: 262144,
      logMaxFiles: 3,
      shutdownDrainDeadlineMs: 4000,
    });
    const settings = resolveServeSettings({
      flags: {},
      env: {},
      defaultConfigPath,
      readText: read(file),
    });
    expect(settings).toMatchObject({
      configPath: defaultConfigPath,
      remoteAccessHost: "127.0.0.1",
      remoteAccessPort: 49201,
      relayUrl: "wss://relay.example.test/host",
      logLevel: "debug",
      logMaxBytes: 262144,
      logMaxFiles: 3,
      shutdownDrainDeadlineMs: 4000,
    });
  });

  it("orders CLI flag over environment over config file", () => {
    const file = JSON.stringify({ host: "10.0.0.5", port: 50000 });
    // Config file supplies when nothing else does.
    const fromFile = resolveServeSettings({
      flags: {},
      env: {},
      defaultConfigPath,
      readText: read(file),
    });
    expect(fromFile.remoteAccessPort).toBe(50000);
    // Environment beats the file.
    const fromEnv = resolveServeSettings({
      flags: {},
      env: { [REMOTE_ACCESS_PORT_ENV]: "51000" },
      defaultConfigPath,
      readText: read(file),
    });
    expect(fromEnv.remoteAccessPort).toBe(51000);
    // Flag beats both.
    const fromFlag = resolveServeSettings({
      flags: { host: "127.0.0.2", port: 52000 },
      env: { [REMOTE_ACCESS_PORT_ENV]: "51000", [REMOTE_ACCESS_HOST_ENV]: "10.9.9.9" },
      defaultConfigPath,
      readText: read(file),
    });
    expect(fromFlag.remoteAccessHost).toBe("127.0.0.2");
    expect(fromFlag.remoteAccessPort).toBe(52000);
  });

  it("honors the documented log-level and drain-deadline environment variables", () => {
    const settings = resolveServeSettings({
      flags: {},
      env: { PORACODE_LOG_LEVEL: "WARN", PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS: "1500" },
      defaultConfigPath,
      readText: read(undefined),
    });
    expect(settings.logLevel).toBe("warn");
    expect(settings.shutdownDrainDeadlineMs).toBe(1500);
  });

  it("warns and falls back on invalid env values", () => {
    const settings = resolveServeSettings({
      flags: {},
      env: { PORACODE_LOG_LEVEL: "loud", PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS: "soon" },
      defaultConfigPath,
      readText: read(undefined),
    });
    expect(settings.logLevel).toBe(DEFAULT_LOG_LEVEL);
    expect(settings.shutdownDrainDeadlineMs).toBe(DEFAULT_SHUTDOWN_DRAIN_DEADLINE_MS);
    expect(settings.warnings.join("\n")).toMatch(/PORACODE_LOG_LEVEL/u);
    expect(settings.warnings.join("\n")).toMatch(/PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS/u);
  });

  it("clamps an extreme drain deadline and flags a partial TLS pair", () => {
    const clamped = resolveServeSettings({
      flags: {},
      env: { PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS: "99999999" },
      defaultConfigPath,
      readText: read(undefined),
    });
    expect(clamped.shutdownDrainDeadlineMs).toBe(120_000);

    const partialTls = resolveServeSettings({
      flags: {},
      env: {},
      defaultConfigPath,
      readText: read(JSON.stringify({ tlsCert: "/tmp/cert.pem" })),
    });
    expect(partialTls.tlsCert).toBe("/tmp/cert.pem");
    expect(partialTls.warnings.join("\n")).toMatch(/TLS material is incomplete/u);
  });
});

describe("applyServeSettingsToEnv", () => {
  it("sets flag-decided values unconditionally and config values only when unset", () => {
    const env: NodeJS.ProcessEnv = { [REMOTE_ACCESS_HOST_ENV]: "10.1.1.1" };
    const applied = applyServeSettingsToEnv(
      {
        remoteAccessHost: "127.0.0.9",
        remoteAccessPort: 49300,
        remoteBindMode: "tailnet",
        relayUrl: "wss://relay.example.test/host",
        logLevel: "info",
        logMaxBytes: DEFAULT_LOG_MAX_BYTES,
        logMaxFiles: DEFAULT_LOG_MAX_FILES,
        shutdownDrainDeadlineMs: DEFAULT_SHUTDOWN_DRAIN_DEADLINE_MS,
        warnings: [],
      },
      env,
    );
    // Flag-level host overrides the pre-existing env; the rest fill unset vars.
    expect(env[REMOTE_ACCESS_HOST_ENV]).toBe("127.0.0.9");
    expect(env[REMOTE_ACCESS_PORT_ENV]).toBe("49300");
    expect(env.PORACODE_REMOTE_BIND_MODE).toBe("tailnet");
    expect(env[REMOTE_RELAY_URL_ENV]).toBe("wss://relay.example.test/host");
    expect(applied).toContain(REMOTE_ACCESS_PORT_ENV);
    expect(applied).toContain("PORACODE_REMOTE_BIND_MODE");
  });

  it("never touches variables a field did not decide", () => {
    const env: NodeJS.ProcessEnv = {};
    applyServeSettingsToEnv(
      {
        logLevel: "info",
        logMaxBytes: DEFAULT_LOG_MAX_BYTES,
        logMaxFiles: DEFAULT_LOG_MAX_FILES,
        shutdownDrainDeadlineMs: DEFAULT_SHUTDOWN_DRAIN_DEADLINE_MS,
        warnings: [],
      },
      env,
    );
    expect(env).toEqual({});
  });
});
