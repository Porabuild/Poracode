import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runConfigure } from "./cliConfigure";
import { defaultServerConfigPath, resolveServeSettings } from "./serverConfig";

const roots: string[] = [];
function fixture() {
  mkdirSync("tmp", { recursive: true });
  const root = mkdtempSync(join(process.cwd(), "tmp", "cli-configure-"));
  roots.push(root);
  return { root, profile: join(root, "fresh-namespace") };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("CLI configuration administration", () => {
  it.each(["--show", "--effective", "--log-level"])(
    "does not expose or replace malformed private configuration (%s)",
    async (flag) => {
      const { profile } = fixture();
      const path = defaultServerConfigPath(profile),
        before = "PRIVATE";
      writeFileSync(path, before);
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const failure = await runConfigure(profile, [
        flag,
        ...(flag === "--log-level" ? ["debug"] : []),
        "--json",
      ]).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).not.toContain(before);
      expect((failure as Error).cause).toBeUndefined();
      expect(output).not.toHaveBeenCalled();
      expect(readFileSync(path, "utf8")).toBe(before);
      expect(existsSync(profile)).toBe(false);
    },
  );

  it("edits every existing field without creating a namespace or replacing unrelated settings", async () => {
    const { profile } = fixture();
    const path = defaultServerConfigPath(profile);
    writeFileSync(path, JSON.stringify({ host: "localhost", port: 0 }));
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runConfigure(profile, [
      "--bind-mode",
      "loopback",
      "--relay-url",
      "wss://relay.example.test/base",
      "--trusted-proxies",
      "127.0.0.1, 10.0.0.0/8",
      "--log-level",
      "debug",
      "--log-max-bytes",
      "131072",
      "--log-max-files",
      "3",
      "--shutdown-drain-deadline-ms",
      "5000",
      "--json",
    ]);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      host: "localhost",
      port: 0,
      bindMode: "loopback",
      relayUrl: "wss://relay.example.test/base",
      trustedProxies: ["127.0.0.1", "10.0.0.0/8"],
      logLevel: "debug",
      logMaxBytes: 131072,
      logMaxFiles: 3,
      shutdownDrainDeadlineMs: 5000,
    });
    expect(existsSync(profile)).toBe(false);
    expect(resolveServeSettings({ flags: {}, env: {}, defaultConfigPath: path })).toMatchObject({
      remoteAccessHost: "localhost",
      remoteAccessPort: 0,
      trustedProxies: "127.0.0.1,10.0.0.0/8",
      logMaxFiles: 3,
    });
  });

  it.each([
    ["--log-level", "verbose"],
    ["--log-max-bytes", "12"],
    ["--log-max-files", "0"],
    ["--shutdown-drain-deadline-ms", "soon"],
    ["--trusted-proxies", "127.0.0.1,,10.0.0.0/8"],
    ["--log-max-files", "2", "--unset", "logMaxFiles"],
  ])("preserves previous bytes on invalid edits (%j)", async (...args) => {
    const { profile } = fixture();
    const path = defaultServerConfigPath(profile),
      before = '{ "host": "localhost", "logMaxFiles": 4 }\n';
    writeFileSync(path, before);
    await expect(runConfigure(profile, args)).rejects.toThrow(Error);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("resolves this invocation's environment read-only and does not expose unrelated environment credentials", async () => {
    const { profile } = fixture();
    const path = defaultServerConfigPath(profile);
    const before = JSON.stringify({
      host: "localhost",
      port: 49153,
      logLevel: "debug",
      logMaxFiles: 8,
    });
    writeFileSync(path, before);
    for (const name of [
      "PORACODE_REMOTE_ACCESS_HOST",
      "PORACODE_REMOTE_ACCESS_PORT",
      "PORACODE_REMOTE_BIND_MODE",
      "PORACODE_REMOTE_TLS_CERT",
      "PORACODE_REMOTE_TLS_KEY",
      "PORACODE_LOG_LEVEL",
      "PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS",
    ])
      vi.stubEnv(name, undefined);
    vi.stubEnv("PORACODE_REMOTE_ACCESS_HOST", "127.0.0.9");
    vi.stubEnv("PORACODE_REMOTE_ACCESS_PORT", "0");
    vi.stubEnv("PORACODE_LOG_LEVEL", "WARN");
    vi.stubEnv("PORACODE_SECRET_STORAGE_KEY", "fixture-never-print-this-key");
    vi.stubEnv(
      "PORACODE_REMOTE_RELAY_URL",
      "wss://user:short-password@relay.example.test/base?token=short-token#short-fragment",
    );
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runConfigure(profile, ["--effective", "--json"]);
    const text = String(output.mock.calls[0]![0]);
    expect(JSON.parse(text)).toMatchObject({
      formatVersion: 1,
      view: "next-start",
      configPath: path,
      settings: { host: "127.0.0.9", port: 0, logLevel: "warn", logMaxFiles: 8 },
      sources: {
        host: "environment",
        port: "environment",
        logLevel: "environment",
        logMaxFiles: "config",
      },
    });
    expect(text).not.toContain("fixture-never-print-this-key");
    for (const value of ["short-password", "short-token", "short-fragment"])
      expect(text).not.toContain(value);
    expect(JSON.parse(text).settings.relayUrl).toContain("relay.example.test/base");
    expect(process.env.PORACODE_REMOTE_ACCESS_HOST).toBe("127.0.0.9");
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(existsSync(profile)).toBe(false);
  });

  it("retains in-namespace precedence and refuses future file fields without rewriting", async () => {
    const { profile } = fixture();
    mkdirSync(profile);
    const inside = join(profile, "poracode-server.json");
    const before = '{ "port": 12345, "futureSetting": true }\n';
    writeFileSync(inside, before);
    writeFileSync(`${profile}.server.json`, JSON.stringify({ port: 23456 }));
    expect(defaultServerConfigPath(profile)).toBe(inside);
    await expect(runConfigure(profile, ["--effective", "--json"])).rejects.toThrow("invalid");
    await expect(runConfigure(profile, ["--log-level", "debug"])).rejects.toThrow("invalid");
    expect(readFileSync(inside, "utf8")).toBe(before);
  });

  it.each([false, true])(
    "redacts saved relay credentials in inspection output without changing the file (JSON: %s)",
    async (json) => {
      const { profile } = fixture();
      const path = defaultServerConfigPath(profile);
      const before = JSON.stringify({
        port: 49153,
        relayUrl:
          "wss://fixture-user:fixture-password@relay.example.test/base?token=fixture-token&token=fixture-other&mode=fixture-mode#fixture-fragment",
      });
      writeFileSync(path, before);
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      await runConfigure(profile, ["--show", ...(json ? ["--json"] : [])]);
      const text = String(output.mock.calls[0]![0]);
      const result = JSON.parse(text);
      const displayed = new URL(result.config.relayUrl);
      expect(result.config.port).toBe(49153);
      expect(displayed.origin).toBe("wss://relay.example.test");
      expect(displayed.pathname).toBe("/base");
      expect(displayed.username).toBe("");
      expect(displayed.password).toBe("");
      expect(displayed.hash).toBe("");
      expect([...displayed.searchParams.values()]).toEqual(["[redacted]", "[redacted]"]);
      for (const value of [
        "fixture-user",
        "fixture-password",
        "fixture-token",
        "fixture-other",
        "fixture-mode",
        "fixture-fragment",
      ])
        expect(text).not.toContain(value);
      expect(readFileSync(path, "utf8")).toBe(before);
      expect(existsSync(profile)).toBe(false);
    },
  );

  it.each(["fixture-private-invalid", "data:text/plain,fixture-private-opaque"])(
    "hides unusable relay URLs in both configuration views (%s)",
    async (relayUrl) => {
      const { profile } = fixture();
      const path = defaultServerConfigPath(profile),
        before = JSON.stringify({ relayUrl });
      writeFileSync(path, before);
      vi.stubEnv("PORACODE_REMOTE_RELAY_URL", undefined);
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      for (const view of ["--show", "--effective"]) {
        output.mockClear();
        await runConfigure(profile, [view, "--json"]);
        const text = String(output.mock.calls[0]![0]);
        const result = JSON.parse(text);
        expect((view === "--show" ? result.config : result.settings).relayUrl).toBe(
          "[configured; invalid URL hidden]",
        );
        expect(text).not.toContain(relayUrl);
        expect(readFileSync(path, "utf8")).toBe(before);
      }
    },
  );

  it.each([
    ["--effective", "--port", "12345"],
    ["--effective", "--show"],
    ["--effective", "--unset", "port"],
  ])("does not save when a read-only view conflicts with edits (%j)", async (...args) => {
    const { profile } = fixture();
    await expect(runConfigure(profile, args)).rejects.toThrow(Error);
    expect(existsSync(defaultServerConfigPath(profile))).toBe(false);
    expect(existsSync(profile)).toBe(false);
  });
});
