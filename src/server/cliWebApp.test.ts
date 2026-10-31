import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openServerWebApp } from "./cliWebApp";

vi.mock("node:child_process", () => ({
  spawn: vi.fn<() => EventEmitter & { kill: () => boolean }>(() => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn<() => boolean>(() => true) });
    queueMicrotask(() => child.emit("close", 0));
    return child;
  }),
}));

function fixture() {
  return {
    server: {
      issueIndependentPairingGrant: vi.fn<
        () => {
          id: string;
          pairingUrl: string;
          localPairingUrl: string;
          expiresAt: string;
          scopes: ["session:read"];
          label: string;
        }
      >(() => ({
        id: "owned-grant",
        pairingUrl:
          "https://hosted.example/?host=https%3A%2F%2Fremote.example%2F#token=private-fixture-token&fp=fixture",
        localPairingUrl: "https://127.0.0.1:49200/#token=private-fixture-token&fp=fixture",
        expiresAt: "2099-01-01T00:00:00.000Z",
        scopes: ["session:read" as const],
        label: "Local web app",
      })),
      revokePairingCredentialById: vi.fn<() => boolean>(() => true),
    },
    info: {
      localHttpBaseUrl: "http://192.0.2.1:49200",
      loopbackHttpBaseUrl: "http://127.0.0.1:49200/base/",
    },
    signal: new AbortController().signal,
    explicit: false,
    platform: "linux" as const,
    env: { DISPLAY: ":1", PATH: "/usr/bin" },
    open: vi.fn<(url: string, signal: AbortSignal) => Promise<void>>().mockResolvedValue(undefined),
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("local web app handoff", () => {
  it("opens a separate operator grant on the actual local origin, preserving its base path", async () => {
    const input = fixture();
    expect(await openServerWebApp(input)).toBeUndefined();
    expect(input.server.issueIndependentPairingGrant).toHaveBeenCalledExactlyOnceWith({
      preset: "operator",
      label: "Local web app",
      ttlMs: 60_000,
    });
    expect(input.open).toHaveBeenCalledExactlyOnceWith(
      "http://127.0.0.1:49200/base/#token=private-fixture-token&fp=fixture",
      input.signal,
    );
    expect(input.server.revokePairingCredentialById).not.toHaveBeenCalled();
  });

  it("uses the local interface-specific listener when loopback is unavailable", async () => {
    const input = fixture();
    await openServerWebApp({
      ...input,
      info: { localHttpBaseUrl: "https://192.0.2.1:49200/prefix/" },
    });
    expect(input.open).toHaveBeenCalledWith(
      "https://192.0.2.1:49200/prefix/#token=private-fixture-token&fp=fixture",
      input.signal,
    );
  });

  it.each([{ SSH_CONNECTION: "fixture" }, { SSH_CLIENT: "fixture" }, { SSH_TTY: "fixture" }, {}])(
    "does not mint or spawn during automatic opening in a headless session (%j)",
    async (env) => {
      const input = fixture();
      expect(await openServerWebApp({ ...input, env })).toContain("headless session");
      expect(input.server.issueIndependentPairingGrant).not.toHaveBeenCalled();
      expect(input.open).not.toHaveBeenCalled();
    },
  );

  it("honors an explicit open request despite automatic session detection", async () => {
    const input = fixture();
    await openServerWebApp({ ...input, explicit: true, env: { SSH_CONNECTION: "fixture" } });
    expect(input.open).toHaveBeenCalledOnce();
  });

  it("revokes only the unused browser grant on opener failure and returns no private errors", async () => {
    const input = fixture();
    input.open.mockRejectedValue(new Error("private-fixture-token encoded launch failure"));
    const warning = await openServerWebApp(input);
    expect(warning).toContain("server is still running");
    expect(warning).not.toContain("private-fixture-token");
    expect(input.server.revokePairingCredentialById).toHaveBeenCalledExactlyOnceWith("owned-grant");
  });

  it("keeps grant issuance or revocation failures nonfatal and actionable", async () => {
    const input = fixture();
    input.server.issueIndependentPairingGrant.mockImplementationOnce(() => {
      throw new Error("private store error");
    });
    expect(await openServerWebApp(input)).toContain("server is still running");
    expect(input.open).not.toHaveBeenCalled();
    input.open.mockRejectedValue(new Error("private browser error"));
    input.server.revokePairingCredentialById.mockImplementationOnce(() => {
      throw new Error("private store error");
    });
    const warning = await openServerWebApp(input);
    expect(warning).toContain("Revocation");
    expect(warning).not.toContain("private store error");
  });

  it("refuses a cancelled handoff before minting and revokes after an in-flight cancellation", async () => {
    const input = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(openServerWebApp({ ...input, signal: controller.signal })).rejects.toThrow(Error);
    expect(input.server.issueIndependentPairingGrant).not.toHaveBeenCalled();
    const active = new AbortController();
    input.open.mockImplementation(async () => {
      active.abort();
    });
    await expect(openServerWebApp({ ...input, signal: active.signal })).rejects.toThrow(Error);
    expect(input.server.revokePairingCredentialById).toHaveBeenCalledExactlyOnceWith("owned-grant");
  });
});

describe("native browser dispatch", () => {
  it.each(["linux", "darwin", "win32"] as const)(
    "uses a signal-bound %s opener without passing host/provider secrets",
    async (platform) => {
      const { server, info, signal } = fixture();
      expect(
        await openServerWebApp({
          server,
          info,
          signal,
          platform,
          explicit: true,
          env: {
            DISPLAY: ":1",
            PATH: "/usr/bin",
            SystemRoot: "C:\\Windows",
            HOME: "/fixture",
            PORACODE_SECRET_STORAGE_KEY: "private-key",
            PROVIDER_TOKEN: "private-token",
            PORACODE_DEVICE_SIGNING_KEY: "private-signing-key",
            NODE_OPTIONS: "private-options",
            BROWSER: "untrusted-shell-text",
          },
        }),
      ).toBeUndefined();
      const [command, args, options] = vi.mocked(spawn).mock.calls[0] as unknown as [
        string,
        string[],
        { env: NodeJS.ProcessEnv },
      ];
      expect(spawn).toHaveBeenCalledWith(
        command,
        args,
        expect.objectContaining({ stdio: "ignore", windowsHide: true }),
      );
      expect(options.env).toEqual({
        DISPLAY: ":1",
        PATH: "/usr/bin",
        SystemRoot: "C:\\Windows",
        HOME: "/fixture",
      });
      expect(command).toBe(
        {
          win32: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
          darwin: "/usr/bin/open",
          linux: "xdg-open",
        }[platform],
      );
      expect(platform === "win32" ? args.slice(0, -1) : args).toEqual(
        platform === "win32"
          ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand"]
          : ["http://127.0.0.1:49200/base/#token=private-fixture-token&fp=fixture"],
      );
    },
  );

  it("encodes the Windows URL as data instead of PowerShell syntax", async () => {
    const { server, info, signal } = fixture();
    await openServerWebApp({
      server,
      info,
      signal,
      platform: "win32",
      explicit: true,
      env: { SystemRoot: "C:\\Windows" },
    });
    const args = vi.mocked(spawn).mock.calls[0]![1] as string[];
    const script = Buffer.from(args.at(-1)!, "base64").toString("utf16le");
    expect(script).toContain("Start-Process -FilePath");
    expect(script).not.toContain("private-fixture-token");
    const encodedUrl = script.match(/FromBase64String\('([^']+)'\)/u)![1]!;
    expect(Buffer.from(encodedUrl, "base64").toString()).toBe(
      "http://127.0.0.1:49200/base/#token=private-fixture-token&fp=fixture",
    );
  });

  it("joins the opener's close before retiring a cancelled grant", async () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn<() => boolean>(() => true) });
    vi.mocked(spawn).mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);
    const { server, info } = fixture();
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(controller.signal, "removeEventListener");
    const opening = openServerWebApp({
      server,
      info,
      signal: controller.signal,
      explicit: true,
      platform: "linux",
      env: {},
    });
    const rejected = opening.catch((error: unknown) => error);
    controller.abort();
    expect(child.kill).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(server.revokePairingCredentialById).not.toHaveBeenCalled();
    child.emit("close", null);
    expect(await rejected).toBeInstanceOf(Error);
    expect(server.revokePairingCredentialById).toHaveBeenCalledExactlyOnceWith("owned-grant");
    expect(removeAbortListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("handles opener errors without exposing private command text or retiring before close", async () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn<() => boolean>(() => true) });
    vi.mocked(spawn).mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);
    const { server, info } = fixture();
    const opening = openServerWebApp({
      server,
      info,
      signal: new AbortController().signal,
      explicit: true,
      platform: "linux",
      env: {},
    });
    child.emit("error", new Error("private-fixture-token spawn error"));
    await Promise.resolve();
    expect(server.revokePairingCredentialById).not.toHaveBeenCalled();
    child.emit("close", -2);
    const warning = await opening;
    expect(warning).toContain("server is still running");
    expect(warning).not.toContain("private-fixture-token");
    expect(server.revokePairingCredentialById).toHaveBeenCalledExactlyOnceWith("owned-grant");
  });

  it("requests retirement of a stalled opener after ten seconds and still joins close", async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), { kill: vi.fn<() => boolean>(() => true) });
    vi.mocked(spawn).mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);
    const { server, info } = fixture();
    const opening = openServerWebApp({
      server,
      info,
      signal: new AbortController().signal,
      explicit: true,
      platform: "linux",
      env: {},
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(child.kill).toHaveBeenCalledOnce();
    expect(server.revokePairingCredentialById).not.toHaveBeenCalled();
    child.emit("close", null);
    expect(await opening).toContain("server is still running");
    expect(server.revokePairingCredentialById).toHaveBeenCalledExactlyOnceWith("owned-grant");
  });
});
