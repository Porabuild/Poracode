import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSetupCliOptions, runSetup } from "./cliSetup";
import { defaultServerConfigPath } from "./serverConfig";

const mocks = vi.hoisted(() => ({
  prompt: vi.fn<typeof import("./cliPrompts").promptCli>(),
  authenticate: vi.fn<typeof import("./cliAdmin").runAdminCli>(),
}));
vi.mock("./cliPrompts", async (original) => ({
  ...(await original<typeof import("./cliPrompts")>()),
  promptCli: mocks.prompt,
}));
vi.mock("./cliAdmin", async (original) => ({
  ...(await original<typeof import("./cliAdmin")>()),
  runAdminCli: mocks.authenticate,
}));
const originalTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const roots: string[] = [];
let exitCode: typeof process.exitCode;
beforeEach(() => {
  exitCode = process.exitCode;
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
  for (const name of [
    "PORACODE_REMOTE_ACCESS_HOST",
    "PORACODE_REMOTE_ACCESS_PORT",
    "PORACODE_REMOTE_BIND_MODE",
    "PORACODE_REMOTE_TLS_CERT",
    "PORACODE_REMOTE_TLS_KEY",
    "PORACODE_REMOTE_RELAY_URL",
    "PORACODE_REMOTE_TRUSTED_PROXIES",
  ])
    vi.stubEnv(name, undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  mocks.prompt.mockReset();
  mocks.authenticate.mockReset();
  process.exitCode = exitCode;
  if (originalTty) Object.defineProperty(process.stdin, "isTTY", originalTty);
  else Reflect.deleteProperty(process.stdin, "isTTY");
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  mkdirSync("tmp", { recursive: true });
  const root = mkdtempSync(join(process.cwd(), "tmp", "cli-setup-"));
  roots.push(root);
  return { root, profile: join(root, "fresh-namespace") };
}
function configAnswers() {
  mocks.prompt.mockResolvedValueOnce("127.0.0.1").mockResolvedValueOnce("49155");
}
function output() {
  return vi
    .mocked(process.stdout.write)
    .mock.calls.map(([value]) => String(value))
    .join("");
}

describe("guided setup", () => {
  it.each([
    ["--start", "--no-start"],
    ["--no-start", "--provider", "fixture"],
    ["--open", "--no-open"],
    ["--no-start", "--open"],
    ["--skip-auth", "--wsl", "Selected Distro"],
    ["--method", "fixture-method"],
    ["--runtime", "fixture-runtime"],
    ["--json"],
    ["--config", " "],
    ["--wsl", "x".repeat(201)],
    ["--provider", "x".repeat(129)],
    ["--no-start", "--profile-env"],
    ["--skip-auth", "--profile", "work"],
    ["--profile-env", "--provider", "fixture"],
    ["--profile-env", "--wsl", "Selected Distro"],
    ["--profile", " "],
    ["--profile", "work", "--prompt-env", "BAD-NAME"],
    ["--prompt-env", "__proto__"],
    ["--prompt-env", "KEY", "--prompt-env", "KEY"],
    ["--profile", "work", "--new-profile", "other"],
    ["--driver", "fixture"],
    ["--new-profile", "work", "--driver", "fixture"],
    ["--new-profile", "work", "--prompt-env", "KEY"],
  ])("refuses invalid/conflicting choices before any interaction (%j)", (...args) => {
    expect(() => parseSetupCliOptions(args)).toThrow(Error);
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("saves configuration next to a fresh namespace without creating an owner", async () => {
    const { profile } = fixture();
    configAnswers();
    const start = vi.fn<Parameters<typeof runSetup>[2]>();
    await runSetup(profile, parseSetupCliOptions(["--no-start"]), start);
    expect(JSON.parse(readFileSync(defaultServerConfigPath(profile), "utf8"))).toEqual({
      host: "127.0.0.1",
      port: 49155,
    });
    expect(existsSync(profile)).toBe(false);
    expect(existsSync(`${profile}.host-v1`)).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(output()).toContain("No server was started");
    expect(output()).toContain('"view": "next-start"');
  });

  it("does not start by default or treat a mistyped answer as consent", async () => {
    const { profile } = fixture();
    const start = vi.fn<Parameters<typeof runSetup>[2]>();
    mocks.prompt.mockResolvedValueOnce("perhaps");
    await expect(runSetup(profile, parseSetupCliOptions([]), start)).rejects.toThrow(
      "Answer yes or no",
    );
    expect(existsSync(defaultServerConfigPath(profile))).toBe(false);
    expect(start).not.toHaveBeenCalled();
    mocks.prompt.mockResolvedValueOnce("");
    configAnswers();
    await runSetup(profile, parseSetupCliOptions([]), start);
    expect(start).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("does not treat a browser request as permission to start", async () => {
    const { profile } = fixture();
    mocks.prompt.mockResolvedValueOnce("no");
    configAnswers();
    const start = vi.fn<Parameters<typeof runSetup>[2]>();
    await runSetup(profile, parseSetupCliOptions(["--open"]), start);
    expect(existsSync(defaultServerConfigPath(profile))).toBe(true);
    expect(start).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(output()).toContain("No server was started");
  });

  it("does not write configuration when an intent prompt is cancelled", async () => {
    const { profile } = fixture();
    const cancelled = new Error("fixture input closed");
    mocks.prompt.mockResolvedValueOnce("yes").mockRejectedValueOnce(cancelled);
    const start = vi.fn<Parameters<typeof runSetup>[2]>();
    await expect(runSetup(profile, parseSetupCliOptions([]), start)).rejects.toBe(cancelled);
    expect(existsSync(defaultServerConfigPath(profile))).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("does not start or login after configuration validation fails", async () => {
    const { profile } = fixture();
    mocks.prompt.mockResolvedValueOnce("127.0.0.1").mockResolvedValueOnce("not-a-port");
    const start = vi.fn<Parameters<typeof runSetup>[2]>();
    await expect(
      runSetup(profile, parseSetupCliOptions(["--start", "--provider", "fixture"]), start),
    ).rejects.toThrow("Invalid server configuration");
    expect(existsSync(defaultServerConfigPath(profile))).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it.each([
    { flags: [], open: false },
    { flags: ["--open"], open: true },
    { flags: ["--no-open"], open: false },
  ])(
    "starts with the selected browser mode and authenticates the exact provider/runtime/WSL target afterward (%j)",
    async ({ flags, open }) => {
      const { root, profile } = fixture();
      const path = join(root, "explicit server.json");
      const lifetime = new AbortController();
      configAnswers();
      const start = vi.fn<Parameters<typeof runSetup>[2]>(
        async (configPath: string, requestedOpen: boolean) => {
          expect(configPath).toBe(path);
          expect(requestedOpen).toBe(open);
          expect(JSON.parse(readFileSync(configPath, "utf8")).port).toBe(49155);
          expect(mocks.authenticate).not.toHaveBeenCalled();
          return lifetime.signal;
        },
      );
      await runSetup(
        profile,
        parseSetupCliOptions([
          "--config",
          path,
          "--start",
          "--provider",
          "fixture",
          "--method",
          "fixture-method",
          "--runtime",
          "fixture-runtime",
          "--wsl",
          "Selected Distro",
          ...flags,
        ]),
        start,
      );
      expect(start).toHaveBeenCalledExactlyOnceWith(path, open);
      expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(profile, [
        "auth",
        "login",
        "fixture",
        "--method",
        "fixture-method",
        "--runtime",
        "fixture-runtime",
        "--wsl",
        "Selected Distro",
      ]);
      expect(output()).toContain("authentication flow completed");
      expect(lifetime.signal.aborted).toBe(false);
    },
  );

  it("keeps an explicit login opt-out and delegates provider selection to the existing auth interaction", async () => {
    const { profile } = fixture();
    const start = vi.fn<Parameters<typeof runSetup>[2]>(async () => new AbortController().signal);
    configAnswers();
    await runSetup(profile, parseSetupCliOptions(["--start", "--skip-auth"]), start);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(output()).toContain("authentication skipped");
    mocks.prompt.mockResolvedValueOnce("y").mockResolvedValueOnce("y");
    configAnswers();
    await runSetup(profile, parseSetupCliOptions([]), start);
    expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(profile, ["auth", "login"]);
  });

  it("does not login or claim a running server after a failed or cancelled startup", async () => {
    const { profile } = fixture();
    const refused = new Error("fixture existing owner refused");
    configAnswers();
    const start = vi.fn<Parameters<typeof runSetup>[2]>(async () => {
      throw refused;
    });
    await expect(
      runSetup(profile, parseSetupCliOptions(["--start", "--provider", "fixture"]), start),
    ).rejects.toBe(refused);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(output()).not.toContain("Server started in the foreground");
    configAnswers();
    await expect(
      runSetup(
        profile,
        parseSetupCliOptions(["--start", "--provider", "fixture"]),
        async () => undefined,
      ),
    ).rejects.toThrow("Startup was cancelled");
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("delegates guided profile environment setup without claiming account authentication", async () => {
    const { profile } = fixture();
    configAnswers();
    await runSetup(
      profile,
      parseSetupCliOptions(["--start", "--profile-env"]),
      async () => new AbortController().signal,
    );
    expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(profile, ["providers", "configure"]);
    expect(output()).toContain("Saved-profile configuration completed");
    expect(output()).toContain("authentication was not verified");
    expect(output()).not.toContain("authentication flow completed");
  });

  it("preserves an explicit profile ID and variable names through the existing sealed writer frontend", async () => {
    const { profile } = fixture();
    configAnswers();
    await runSetup(
      profile,
      parseSetupCliOptions([
        "--start",
        "--profile",
        "work",
        "--prompt-env",
        "FIXTURE_KEY",
        "--prompt-env",
        "FIXTURE_URL",
      ]),
      async () => new AbortController().signal,
    );
    expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(profile, [
      "providers",
      "configure",
      "work",
      "--prompt-env",
      "FIXTURE_KEY",
      "--prompt-env",
      "FIXTURE_URL",
    ]);
    expect(output()).not.toContain("authentication flow completed");
  });

  it("gives profile-specific retry guidance when sealed configuration fails", async () => {
    const { profile } = fixture();
    configAnswers();
    mocks.authenticate.mockRejectedValueOnce(new Error("fixture sealing refused"));
    await runSetup(
      profile,
      parseSetupCliOptions(["--start", "--profile-env"]),
      async () => new AbortController().signal,
    );
    expect(process.exitCode).toBe(1);
    expect(vi.mocked(process.stderr.write).mock.calls.flat().join(" ")).toContain(
      "retry providers configure",
    );
    expect(output()).not.toContain("Saved-profile configuration completed");
  });

  it("creates an explicitly requested profile through the existing add frontend with hidden values", async () => {
    const { profile } = fixture();
    configAnswers();
    await runSetup(
      profile,
      parseSetupCliOptions([
        "--start",
        "--new-profile",
        "work",
        "--driver",
        "cursor",
        "--prompt-env",
        "CURSOR_API_KEY",
      ]),
      async () => new AbortController().signal,
    );
    expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(profile, [
      "providers",
      "add",
      "work",
      "--driver",
      "cursor",
      "--prompt-env",
      "CURSOR_API_KEY",
    ]);
    expect(output()).toContain("authentication was not verified");
    expect(output()).not.toContain("authentication flow completed");
  });

  it("keeps the driver config file separate from server config and forwards the creation flags", async () => {
    const { profile, root } = fixture();
    const serverConfig = join(root, "server.json");
    const profileConfig = join(root, "profile.json");
    writeFileSync(profileConfig, JSON.stringify({ homeDir: "~/.fixture-profile" }));
    configAnswers();
    const start = vi.fn<Parameters<typeof runSetup>[2]>(async () => new AbortController().signal);
    await runSetup(
      profile,
      parseSetupCliOptions([
        "--start",
        "--config",
        serverConfig,
        "--new-profile",
        "work",
        "--driver",
        "codex",
        "--profile-config-file",
        profileConfig,
        "--prompt-env",
        "FIXTURE_KEY",
      ]),
      start,
    );
    expect(start).toHaveBeenCalledExactlyOnceWith(serverConfig, false);
    expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(profile, [
      "providers",
      "add",
      "work",
      "--driver",
      "codex",
      "--config-file",
      profileConfig,
      "--prompt-env",
      "FIXTURE_KEY",
    ]);
    expect(JSON.parse(readFileSync(serverConfig, "utf8"))).not.toHaveProperty("homeDir");
    expect(readFileSync(profileConfig, "utf8")).toBe(
      JSON.stringify({ homeDir: "~/.fixture-profile" }),
    );
  });

  it.each(["synthetic-private-invalid-json", '{"homeDir":7,"unused":"synthetic-private-value"}'])(
    "rejects malformed/driver-invalid profile config before setup writes, prompts or starts",
    async (body) => {
      const { profile, root } = fixture();
      const profileConfig = join(root, "profile.json");
      writeFileSync(profileConfig, body);
      const start = vi.fn<Parameters<typeof runSetup>[2]>(async () => new AbortController().signal);
      const error = await (async () =>
        runSetup(
          profile,
          parseSetupCliOptions([
            "--start",
            "--new-profile",
            "work",
            "--driver",
            "codex",
            "--profile-config-file",
            profileConfig,
            "--prompt-env",
            "FIXTURE_KEY",
          ]),
          start,
        ))().catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain("synthetic-private-");
      expect(mocks.prompt).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
      expect(mocks.authenticate).not.toHaveBeenCalled();
      expect(existsSync(defaultServerConfigPath(profile))).toBe(false);
    },
  );

  it("requires explicit creation for a profile config file and a driver known by the selected CLI", () => {
    expect(() =>
      parseSetupCliOptions(["--profile", "work", "--profile-config-file", "file.json"]),
    ).toThrow("requires --new-profile");
    expect(() =>
      parseSetupCliOptions([
        "--new-profile",
        "work",
        "--driver",
        "fixture-unknown",
        "--prompt-env",
        "KEY",
      ]),
    ).toThrow("does not define");
    expect(() =>
      parseSetupCliOptions(["--new-profile", "work", "--driver", "codex", "--prompt-env", "KEY"]),
    ).toThrow(Error);
  });

  it("reports failed auth without claiming success or stopping its explicit foreground owner", async () => {
    const { profile } = fixture();
    configAnswers();
    const lifetime = new AbortController();
    mocks.authenticate.mockRejectedValueOnce(new Error("fixture auth refused"));
    await runSetup(
      profile,
      parseSetupCliOptions(["--start", "--provider", "fixture"]),
      async () => lifetime.signal,
    );
    expect(process.exitCode).toBe(1);
    expect(lifetime.signal.aborted).toBe(false);
    expect(output()).not.toContain("authentication flow completed");
    expect(vi.mocked(process.stderr.write).mock.calls.flat().join(" ")).toContain(
      "foreground server remains running",
    );
  });

  it("does not report completed authentication after the owner begins shutdown", async () => {
    const { profile } = fixture();
    configAnswers();
    const lifetime = new AbortController();
    const shutdown = new Error("fixture owner shutdown");
    mocks.authenticate.mockImplementationOnce(async () => lifetime.abort(shutdown));
    await expect(
      runSetup(
        profile,
        parseSetupCliOptions(["--start", "--provider", "fixture"]),
        async () => lifetime.signal,
      ),
    ).rejects.toBe(shutdown);
    expect(output()).not.toContain("authentication flow completed");
  });

  it("refuses non-terminal execution before prompts, writes, startup or authentication", async () => {
    const { profile } = fixture();
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    const start = vi.fn<Parameters<typeof runSetup>[2]>();
    await expect(
      runSetup(profile, parseSetupCliOptions(["--start", "--skip-auth"]), start),
    ).rejects.toThrow("requires an interactive terminal");
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(existsSync(defaultServerConfigPath(profile))).toBe(false);
  });
});
