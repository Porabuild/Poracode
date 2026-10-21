import { randomUUID } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import type { McpOAuthService } from "./McpOAuthService";
import type { PluginAccountService } from "../plugins/PluginAccountService";
import { McpAuthenticationService } from "./McpAuthenticationService";
import type { ControlMcpAuthenticationPayload } from "@/shared/contracts/mcpAuthentication";

function fixture() {
  const oauth = {
    beginForCredential: vi
      .fn<McpOAuthService["beginForCredential"]>()
      .mockResolvedValue({ status: "authorized" }),
    wait: vi.fn<McpOAuthService["wait"]>().mockResolvedValue({ status: "authorized" }),
    retireAuthentication: vi
      .fn<McpOAuthService["retireAuthentication"]>()
      .mockResolvedValue(undefined),
  };
  const plugins = { manage: vi.fn<PluginAccountService["manage"]>() };
  return { service: new McpAuthenticationService({ oauth, plugins }), oauth, plugins };
}
function start(
  operationId = randomUUID(),
): Extract<ControlMcpAuthenticationPayload, { action: "start" }> {
  return {
    version: 1,
    action: "start",
    operationId,
    target: {
      scope: "saved-user",
      server: {
        id: "tools",
        name: "Tools",
        description: "",
        enabled: true,
        timeoutMs: 30_000,
        transport: { type: "http", url: "https://issuer.invalid/mcp", headers: {} },
      },
    },
  };
}

it("returns completed status with the exact target and rejects operation replay", async () => {
  const { service, oauth } = fixture();
  const input = start();
  expect(await service.control(input)).toMatchObject({
    action: "start",
    operationId: input.operationId,
    target: { scope: "saved-user", serverId: "tools" },
    authorization: { status: "authorized" },
  });
  expect(
    await service.control({
      version: 1,
      action: "wait",
      operationId: input.operationId,
      target: { scope: "saved-user", serverId: "tools" },
    }),
  ).toMatchObject({ action: "wait", authorization: { status: "authorized" } });
  await expect(service.control(input)).rejects.toThrow("already used");
  expect(oauth.beginForCredential).toHaveBeenCalledOnce();
  expect(oauth.retireAuthentication).toHaveBeenCalledOnce();
});

it("refuses future or extended envelopes and unknown waits before any discovery", async () => {
  const { service, oauth, plugins } = fixture();
  for (const input of [
    { ...start(), version: 2 },
    { ...start(), credentialKey: "not-allowed" },
    {
      version: 1,
      action: "wait",
      operationId: randomUUID(),
      target: { scope: "saved-user", serverId: "tools" },
    },
  ]) {
    await expect(service.control(input as ControlMcpAuthenticationPayload)).rejects.toThrow(
      /Invalid|Unrecognized|target did not match/u,
    );
  }
  expect(oauth.beginForCredential).not.toHaveBeenCalled();
  expect(plugins.manage).not.toHaveBeenCalled();
});

it("handles cancellation overtaking start preparation and repeated cancellation", async () => {
  const { service, oauth } = fixture();
  const input = start();
  const cancel = { version: 1, action: "cancel", operationId: input.operationId } as const;
  expect(await service.control(cancel)).toMatchObject({ cancelled: true });
  expect(await service.control(cancel)).toMatchObject({ cancelled: true });
  await expect(service.control(input)).rejects.toThrow("already used");
  expect(oauth.beginForCredential).not.toHaveBeenCalled();
  const raced = start();
  const beginning = service.control(raced);
  await service.control({ ...cancel, operationId: raced.operationId });
  expect(await beginning).toMatchObject({ authorization: { status: "error" } });
  expect(oauth.beginForCredential).not.toHaveBeenCalled();
});

it("joins held discovery and retirement before acknowledging cancellation", async () => {
  const { service, oauth } = fixture();
  const entered = Promise.withResolvers<AbortSignal>();
  const discovery = Promise.withResolvers<{ status: "error"; message: string }>();
  const retirement = Promise.withResolvers<void>();
  oauth.beginForCredential.mockImplementation(async (_server, _key, signal) => {
    entered.resolve(signal!);
    return discovery.promise;
  });
  oauth.retireAuthentication.mockReturnValue(retirement.promise);
  const input = start();
  let started = false;
  let canceled = false;
  const beginning = service.control(input).then((result) => {
    started = true;
    return result;
  });
  const signal = await entered.promise;
  const canceling = service
    .control({ version: 1, action: "cancel", operationId: input.operationId })
    .then((result) => {
      canceled = true;
      return result;
    });
  try {
    expect(signal.aborted).toBe(true);
    await setImmediate();
    expect(started).toBe(false);
    expect(canceled).toBe(false);
    discovery.resolve({ status: "error", message: "Canceled" });
    await setImmediate();
    expect(started).toBe(false);
    expect(canceled).toBe(false);
  } finally {
    discovery.resolve({ status: "error", message: "Canceled" });
    retirement.resolve();
    await canceling;
    await beginning;
    await service.dispose();
  }
});

it("keeps held browser authentication owned through wait, cancel and shutdown", async () => {
  const { service, oauth } = fixture();
  const flowId = randomUUID();
  const completed = Promise.withResolvers<{ status: "authorized" }>();
  oauth.beginForCredential.mockResolvedValue({
    status: "redirect",
    flowId,
    authorizationUrl: "https://issuer.invalid/authorize?state=fixture",
  });
  oauth.wait.mockReturnValue(completed.promise);
  const input = start();
  expect(await service.control(input)).toMatchObject({ authorization: { status: "redirect" } });
  const waiting = service.control({
    version: 1,
    action: "wait",
    operationId: input.operationId,
    target: { scope: "saved-user", serverId: "tools" },
  });
  let disposed = false;
  const disposing = service.dispose().then(() => {
    disposed = true;
  });
  try {
    await setImmediate();
    expect(disposed).toBe(false);
    expect(oauth.beginForCredential.mock.calls[0]![2]!.aborted).toBe(true);
  } finally {
    completed.resolve({ status: "authorized" });
    await disposing;
  }
  expect(await waiting).toMatchObject({ authorization: { status: "error" } });
  await expect(service.control(start())).rejects.toThrow("shutting down");
  expect(oauth.wait).toHaveBeenCalledWith({ flowId });
});

it("routes plugin account creation and re-login through the plugin service without a caller key", async () => {
  const { service, oauth, plugins } = fixture();
  const accountId = randomUUID();
  plugins.manage.mockResolvedValue({
    accounts: [],
    accountId,
    authorization: { status: "authorized" },
  });
  for (const existing of [false, true]) {
    const input = {
      version: 1,
      action: "start",
      operationId: randomUUID(),
      target: {
        scope: "plugin-service",
        pluginName: "notes",
        serverName: "tools",
        label: "Work",
        ...(existing ? { accountId } : {}),
      },
    } as const;
    expect(await service.control(input)).toMatchObject({
      target: { scope: "plugin-service", pluginName: "notes", serverName: "tools", accountId },
      authorization: { status: "authorized" },
    });
    expect(plugins.manage).toHaveBeenLastCalledWith(
      {
        action: "begin",
        pluginName: "notes",
        serverName: "tools",
        label: "Work",
        ...(existing ? { accountId } : {}),
      },
      expect.any(AbortSignal),
    );
  }
  expect(oauth.beginForCredential).not.toHaveBeenCalled();
});

it("joins resources after a plugin metadata failure without exposing its private error", async () => {
  const { service, plugins, oauth } = fixture();
  const retirement = Promise.withResolvers<void>();
  plugins.manage.mockRejectedValue(new Error("private endpoint or credential material"));
  oauth.retireAuthentication.mockReturnValue(retirement.promise);
  let settled = false;
  const beginning = service
    .control({
      version: 1,
      action: "start",
      operationId: randomUUID(),
      target: { scope: "plugin-service", pluginName: "notes", serverName: "tools", label: "Work" },
    })
    .then((result) => {
      settled = true;
      return result;
    });
  try {
    await setImmediate();
    expect(settled).toBe(false);
  } finally {
    retirement.resolve();
  }
  const result = await beginning;
  expect(result).toMatchObject({ authorization: { status: "error" } });
  expect(JSON.stringify(result)).not.toContain("private endpoint");
});

it("retains failed retirement for an explicit retry before shutdown can finish", async () => {
  const { service, oauth } = fixture();
  oauth.retireAuthentication.mockRejectedValue(new Error("Retirement unconfirmed"));
  const input = start();
  await expect(service.control(input)).rejects.toThrow("Retirement unconfirmed");
  await expect(service.dispose()).rejects.toThrow("Retirement unconfirmed");
  oauth.retireAuthentication.mockResolvedValue(undefined);
  await expect(
    service.control({ version: 1, action: "cancel", operationId: input.operationId }),
  ).resolves.toMatchObject({ cancelled: true });
  await service.dispose();
});

it("late cancellation never reports a completed operation authenticated again", async () => {
  const { service } = fixture();
  const input = start();
  await service.control(input);
  await service.control({ version: 1, action: "cancel", operationId: input.operationId });
  expect(
    await service.control({
      version: 1,
      action: "wait",
      operationId: input.operationId,
      target: { scope: "saved-user", serverId: "tools" },
    }),
  ).toMatchObject({ authorization: { status: "error" } });
});

it("does not disclose SDK endpoint or token-grant error text", async () => {
  const { service, oauth } = fixture();
  oauth.beginForCredential.mockResolvedValue({
    status: "error",
    message: "https://issuer.invalid/mcp?api_key=fixture-private-value rejected",
  });
  expect(JSON.stringify(await service.control(start()))).not.toContain("fixture-private-value");
});

it("refuses a mismatched wait without canceling the actual account", async () => {
  const { service, oauth } = fixture();
  const completed = Promise.withResolvers<{ status: "authorized" }>();
  oauth.beginForCredential.mockResolvedValue({
    status: "redirect",
    flowId: randomUUID(),
    authorizationUrl: "https://issuer.invalid/authorize",
  });
  oauth.wait.mockReturnValue(completed.promise);
  const input = start();
  await service.control(input);
  try {
    await expect(
      service.control({
        version: 1,
        action: "wait",
        operationId: input.operationId,
        target: { scope: "saved-user", serverId: "other" },
      }),
    ).rejects.toThrow("target did not match");
    expect(oauth.beginForCredential.mock.calls[0]![2]!.aborted).toBe(false);
    expect(oauth.retireAuthentication).not.toHaveBeenCalled();
  } finally {
    completed.resolve({ status: "authorized" });
    await service.dispose();
  }
});

it("bounds completed receipts without evicting any of eight live operations", async () => {
  const { service, oauth } = fixture();
  oauth.beginForCredential.mockImplementation(async (_server, _key, signal) => {
    await new Promise<void>((resolve) =>
      signal!.addEventListener("abort", () => resolve(), { once: true }),
    );
    return { status: "error", message: "Canceled" };
  });
  const starts = Array.from({ length: 8 }, () => service.control(start()));
  try {
    await setImmediate();
    for (let index = 0; index < 150; index++)
      await service.control({ version: 1, action: "cancel", operationId: randomUUID() });
    expect(oauth.beginForCredential.mock.calls.every((call) => !call[2]!.aborted)).toBe(true);
    await expect(service.control(start())).rejects.toThrow("Too many active");
  } finally {
    await service.dispose();
    await Promise.all(starts);
  }
});
