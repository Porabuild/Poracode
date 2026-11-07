import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { spawn as spawnPty, type IPty } from "node-pty";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentCapabilitySchema, type AgentStatus } from "@/shared/contracts/agent";
import { HostProviderAuth, type AdminSupervisorCall } from "./hostProviderAuth";

const closing: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closing.splice(0).reverse()) await close();
});

function provider(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind: "fixture:isolated",
    label: "Fixture",
    installed: true,
    envKind: process.platform === "win32" ? "windows" : "posix",
    authState: "missing",
    capabilities: agentCapabilitySchema.parse({}),
    loginCommand: "fixture login",
    authMethods: [
      {
        id: "device",
        type: "terminal",
        name: "Device",
        env: { FIXTURE_ACCOUNT: "isolated-account" },
      },
    ],
    ...overrides,
  };
}

describe("provider CLI authentication supervisor routing", () => {
  it("joins an in-flight discovery and refuses a late shell after disposal", async () => {
    const discovered = Promise.withResolvers<unknown>();
    const call = vi.fn<AdminSupervisorCall>(async () => (await discovered.promise) as never);
    const auth = new HostProviderAuth(call);
    const login = auth.login({ action: "auth-login", agentKind: "fixture:isolated" });
    const rejected = login.then(
      () => new Error("Unexpected login success"),
      (error: unknown) => error as Error,
    );
    const disposed = auth.dispose();
    discovered.resolve({ windows: [provider()], wsl: [], fromCache: false });
    expect((await rejected).message).toContain("shutting down");
    await disposed;
    expect(call).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    "handles bounded login output with an initial read: %s",
    async (initialRead) => {
      let data = "$ ";
      let fromCursor = 0;
      let toCursor = data.length;
      let exited = false;
      let marker = "";
      const call = vi.fn<AdminSupervisorCall>(async (name, payload) => {
        if (name === "refreshAgentStatuses")
          return { windows: [provider()], wsl: [], fromCache: false } as never;
        if (name === "readTerminalSnapshot")
          return {
            generation: "fixture",
            data,
            fromCursor,
            toCursor,
            processState: exited ? "exited" : "running",
            terminalSize: null,
          } as never;
        if (name === "writeTerminal") {
          const encoded = /[A-Za-z0-9+/=]{80,}/u.exec((payload as { data: string }).data)?.[0];
          if (!encoded) throw new Error("Missing encoded login script");
          marker = /__poracode_auth_[a-z0-9-]+__/u.exec(
            Buffer.from(encoded, "base64").toString("utf8"),
          )![0];
          data = `${marker}\nStarted\n`;
          toCursor = data.length;
        }
        if (name === "closeThreadConfirmed") return { confirmed: true } as never;
        return undefined as never;
      });
      const auth = new HostProviderAuth(call);
      closing.push(() => auth.dispose());
      const started = await auth.login({ action: "auth-login", agentKind: "fixture:isolated" });
      if (!("sessionId" in started)) throw new Error("Expected terminal login");
      const first = initialRead ? await auth.read(started.sessionId, 0) : { cursor: 0 };
      let truncatedError: unknown;
      if (!initialRead) {
        data = "x".repeat(200_000);
        fromCursor = 100;
        toCursor = fromCursor + data.length;
        await auth.read(started.sessionId, 0).catch((error: unknown) => {
          truncatedError = error;
        });
      }
      const full = `${marker}\nStarted\n${"x".repeat(200_100)}\n${marker}:exit:0\n`;
      data = full.slice(-200_000);
      toCursor = full.length;
      fromCursor = toCursor - data.length;
      exited = true;
      const last = await auth.read(started.sessionId, first.cursor);
      expect(
        truncatedError instanceof Error && truncatedError.message.includes("terminal buffer"),
      ).toBe(!initialRead);
      expect(last).toMatchObject({ finished: true, exitCode: 0 });
      expect(last.data).toContain("x".repeat(100));
      expect(last.data).not.toContain(":exit:");
      await auth.close(started.sessionId);
    },
  );
  it("preserves the selected environment on the distinct cancellable ACP request", async () => {
    const status = provider({
      envKind: "wsl",
      envDistro: "Ubuntu",
      authMethods: [{ id: "oauth", name: "OAuth" }],
    });
    const call = vi.fn<AdminSupervisorCall>(
      async (name) =>
        (name === "refreshAgentStatuses"
          ? { windows: [], wsl: [status], fromCache: false }
          : undefined) as never,
    );
    const auth = new HostProviderAuth(call);
    closing.push(() => auth.dispose());
    expect(
      await auth.login({
        action: "auth-login",
        agentKind: status.kind,
        methodId: "oauth",
        wslDistro: "Ubuntu",
      }),
    ).toEqual({ authenticated: true });
    expect(call).toHaveBeenCalledWith("controlAcpAuthentication", {
      version: 1,
      action: "start",
      operationId: expect.any(String),
      agentKind: status.kind,
      methodId: "oauth",
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });
    expect(call.mock.calls.some(([name]) => name === "startShell")).toBe(false);
  });

  it.each(["caller", "dispose"])(
    "joins ACP cancellation and refuses late success after %s cancellation",
    async (trigger) => {
      const entered = Promise.withResolvers<void>();
      const authenticated = Promise.withResolvers<void>();
      const retired = Promise.withResolvers<void>();
      const controller = new AbortController();
      const status = provider({ authMethods: [{ id: "oauth", name: "OAuth" }] });
      const call = vi.fn<AdminSupervisorCall>(async (name, payload) => {
        if (name === "refreshAgentStatuses")
          return { windows: [status], wsl: [], fromCache: false } as never;
        if (name === "controlAcpAuthentication") {
          if ((payload as { action: string }).action === "start") {
            entered.resolve();
            await authenticated.promise;
          } else await retired.promise;
          return undefined as never;
        }
        throw new Error(`Unexpected fixture request: ${name}`);
      });
      const auth = new HostProviderAuth(call);
      const context = {
        signal: controller.signal,
        assertActive: () => controller.signal.throwIfAborted(),
      };
      let finished = false;
      const login = auth.login({ action: "auth-login", agentKind: status.kind }, context).then(
        () => {
          finished = true;
          return "unexpected success";
        },
        (error: unknown) => {
          finished = true;
          return error;
        },
      );
      await entered.promise;
      const disposed = trigger === "dispose" ? auth.dispose() : undefined;
      if (trigger === "caller") controller.abort(new Error("Fixture caller cancelled"));
      await vi.waitFor(() =>
        expect(
          call.mock.calls.filter(
            ([name, payload]) =>
              name === "controlAcpAuthentication" &&
              (payload as { action: string }).action === "cancel",
          ),
        ).toHaveLength(1),
      );
      authenticated.resolve();
      await Promise.resolve();
      expect(finished).toBe(false);
      retired.resolve();
      expect(await login).toBeInstanceOf(Error);
      await disposed;
      await auth.dispose();
      const requests = call.mock.calls
        .filter(([name]) => name === "controlAcpAuthentication")
        .map(([, payload]) => payload as { action: string; operationId: string });
      expect(requests.map((request) => request.action)).toEqual(["start", "cancel"]);
      expect(requests[1]!.operationId).toBe(requests[0]!.operationId);
      expect(call.mock.calls.some(([name]) => name === "authenticateAcpAgent")).toBe(false);
    },
  );

  it("refuses an old supervisor without falling back to uncancellable authentication", async () => {
    const call = vi.fn<AdminSupervisorCall>(async (name) => {
      if (name === "refreshAgentStatuses")
        return {
          windows: [provider({ authMethods: [{ id: "oauth", name: "OAuth" }] })],
          wsl: [],
          fromCache: false,
        } as never;
      throw new Error("Unknown supervisor operation");
    });
    const auth = new HostProviderAuth(call);
    closing.push(() => auth.dispose());
    await expect(
      auth.login({ action: "auth-login", agentKind: "fixture:isolated" }),
    ).rejects.toThrow("Unknown supervisor operation");
    expect(call.mock.calls.map(([name]) => name)).toEqual([
      "refreshAgentStatuses",
      "controlAcpAuthentication",
    ]);
  });

  it("refuses a runtime whose independent credentials do not use the provider login", async () => {
    const status = provider({
      runtimeVariants: {
        sdk: {
          presentationMode: "gui",
          installed: true,
          authState: "missing",
          authUsesProviderLogin: false,
          capabilities: agentCapabilitySchema.parse({}),
        },
      },
    });
    const call = vi.fn<AdminSupervisorCall>(
      async () => ({ windows: [status], wsl: [], fromCache: false }) as never,
    );
    const auth = new HostProviderAuth(call);
    closing.push(() => auth.dispose());
    await expect(
      auth.login({ action: "auth-login", agentKind: status.kind, runtime: "sdk" }),
    ).rejects.toThrow("separate credentials");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it.runIf(process.platform === "win32")(
    "drives a real Windows PTY login with isolated account env, stdin, completion and cleanup",
    async () => {
      const status = provider({
        loginCommand:
          "Write-Output ('Open https://example.test/device for ' + $env:FIXTURE_ACCOUNT); $poracodeFixtureCode = Read-Host 'Code'; if ($poracodeFixtureCode -ne '1234') { throw 'Incorrect fixture code' }; Write-Output 'Authorized'",
      });
      let pty: IPty | undefined;
      let output = "";
      let exited = false;
      const generation = randomUUID();
      const exitedPromise = Promise.withResolvers<void>();
      const call = vi.fn<AdminSupervisorCall>(async (name, payload) => {
        if (name === "refreshAgentStatuses")
          return { windows: [status], wsl: [], fromCache: false } as never;
        if (name === "startShell") {
          pty = spawnPty("powershell.exe", ["-NoLogo", "-NoProfile"], {
            cols: 160,
            rows: 30,
            env: Object.fromEntries(
              Object.entries(process.env).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
              ),
            ),
          });
          pty.onData((chunk) => {
            output += chunk;
          });
          pty.onExit(() => {
            exited = true;
            exitedPromise.resolve();
          });
          return undefined as never;
        }
        if (name === "writeTerminal") {
          pty!.write((payload as { data: string }).data);
          return undefined as never;
        }
        if (name === "readTerminalSnapshot")
          return {
            data: output,
            generation,
            fromCursor: 0,
            toCursor: output.length,
            processState: exited ? "exited" : "running",
            terminalSize: null,
          } as never;
        if (name === "closeThreadConfirmed") {
          if (!exited) pty?.kill();
          await exitedPromise.promise;
          return { confirmed: true } as never;
        }
        throw new Error(`Unexpected fixture call: ${name}`);
      });
      const auth = new HostProviderAuth(call);
      closing.push(async () => {
        await auth.dispose();
        if (!exited) {
          pty?.kill();
          await exitedPromise.promise;
        }
      });
      const started = await auth.login({ action: "auth-login", agentKind: status.kind });
      expect(call).toHaveBeenCalledWith(
        "startShell",
        expect.objectContaining({ windowsShellRuntime: "powershell", startInHome: true }),
      );
      expect(started).toHaveProperty("sessionId");
      if (!("sessionId" in started)) throw new Error("Expected a terminal login");
      let result = await auth.read(started.sessionId, 0);
      for (let attempt = 0; attempt < 100 && !result.data.includes("Code:"); attempt += 1) {
        await delay(50);
        result = await auth.read(started.sessionId, 0);
      }
      expect(result.data).toContain("Open https://example.test/device for isolated-account");
      expect(result.data).not.toContain("FromBase64String");
      expect(result.data).not.toContain("$env:FIXTURE_ACCOUNT");
      await auth.write(started.sessionId, "1234\r");
      for (let attempt = 0; attempt < 100 && !result.finished; attempt += 1) {
        await delay(50);
        result = await auth.read(started.sessionId, 0);
      }
      expect(result).toMatchObject({
        finished: true,
        exitCode: 0,
        data: expect.stringContaining("Authorized"),
      });
      await exitedPromise.promise;
      await auth.close(started.sessionId);
      expect(exited).toBe(true);
      await expect(auth.write(started.sessionId, "later")).rejects.toThrow("expired");
    },
  );
});
