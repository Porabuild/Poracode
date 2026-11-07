import { randomBytes, randomUUID } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { normalizeSharedSettings } from "@/shared/settings";
import { controlMcpAuthenticationPayloadSchema } from "@/shared/contracts/mcpAuthentication";
import { administerIntegrationLogin } from "./hostIntegrationLogin";
import { selectMcpAuthenticationTarget } from "./hostIntegrationAccounts";
import type { AdminSupervisorCall } from "./hostProviderAuth";

function fixture() {
  const settings = normalizeSharedSettings({
    mcpServers: [
      {
        id: "tools",
        name: "Tools",
        transport: {
          type: "http",
          url: "https://issuer.invalid/mcp",
          headers: { "X-Fixture-Private": "not-for-cli-output" },
        },
      },
    ],
  });
  const key = randomBytes(32);
  const controller = new AbortController();
  const accountId = randomUUID();
  const context = {
    signal: controller.signal,
    assertActive: () => controller.signal.throwIfAborted(),
  };
  const reply = (name: string, input: unknown): unknown => {
    if (name === "getMcpOauthStatus") return { authenticatedUrls: ["https://issuer.invalid/mcp"] };
    if (name === "pluginAccounts")
      return {
        accounts: [
          {
            id: accountId,
            pluginName: "notes",
            serverName: "tools",
            label: "Work",
            selected: true,
            status: "connected",
            scopes: ["read"],
          },
        ],
      };
    if (name !== "controlMcpAuthentication") throw new Error("Unexpected fixture procedure");
    const payload = controlMcpAuthenticationPayloadSchema.parse(input);
    if (payload.action === "cancel")
      return { version: 1, operationId: payload.operationId, action: "cancel", cancelled: true };
    const target =
      payload.action === "wait"
        ? payload.target
        : payload.target.scope === "saved-user"
          ? { scope: "saved-user", serverId: payload.target.server.id }
          : {
              scope: "plugin-service",
              pluginName: payload.target.pluginName,
              serverName: payload.target.serverName,
              accountId: payload.target.accountId ?? accountId,
            };
    return {
      version: 1,
      operationId: payload.operationId,
      action: payload.action,
      target,
      authorization: { status: "authorized" },
    };
  };
  const call = vi.fn<AdminSupervisorCall>(async (name, payload) => reply(name, payload) as never);
  const options = {
    call,
    readSettings: () => settings,
    revisionKey: key,
    assertCanPersistSecrets: vi.fn<() => void>(),
  };
  const start = () =>
    ({
      action: "mcp-auth-start",
      operationId: randomUUID(),
      serverId: "tools",
      expectedServerRevision: selectMcpAuthenticationTarget(settings.mcpServers, "tools", key)
        .serverRevision,
    }) as const;
  return { settings, controller, accountId, context, call, options, start, reply };
}

it("delegates saved-user login with its exact definition while exposing only public identity", async () => {
  const f = fixture();
  const input = f.start();
  const result = await administerIntegrationLogin(input, f.context, f.options);
  expect(result).toMatchObject({
    version: 1,
    action: "start",
    target: { scope: "saved-user", serverId: "tools" },
    authorization: { status: "authorized" },
  });
  expect(JSON.stringify(result)).not.toContain("not-for-cli-output");
  expect(JSON.stringify(result)).not.toContain("issuer.invalid");
  expect(f.call.mock.calls[0]).toMatchObject([
    "controlMcpAuthentication",
    {
      action: "start",
      target: {
        scope: "saved-user",
        server: {
          id: "tools",
          transport: { headers: { "X-Fixture-Private": "not-for-cli-output" } },
        },
      },
    },
  ]);
});

it("binds browser waiting to the same operation and target", async () => {
  const f = fixture();
  const started = f.start();
  await administerIntegrationLogin(started, f.context, f.options);
  await administerIntegrationLogin({ ...started, action: "mcp-auth-wait" }, f.context, f.options);
  expect(
    f.call.mock.calls.some(
      ([name, input]) =>
        name === "controlMcpAuthentication" &&
        controlMcpAuthenticationPayloadSchema.parse(input).action === "wait",
    ),
  ).toBe(true);
});

it("refuses stale definitions and manual Authorization before discovery", async () => {
  const f = fixture();
  const input = f.start();
  f.settings.mcpServers[0]!.name = "Changed";
  await expect(administerIntegrationLogin(input, f.context, f.options)).rejects.toThrow(
    "definition changed",
  );
  expect(f.call).not.toHaveBeenCalled();
  const server = f.settings.mcpServers[0]!;
  if (server.transport.type === "stdio") throw new Error("Expected HTTP fixture");
  server.transport.headers.Authorization = "manual-fixture";
  await expect(administerIntegrationLogin(f.start(), f.context, f.options)).rejects.toThrow(
    "Authorization header",
  );
  expect(f.call).not.toHaveBeenCalled();
});

it("cancels an existing operation when its reviewed definition changes before wait", async () => {
  const f = fixture();
  const input = f.start();
  f.settings.mcpServers[0]!.name = "Changed";
  await expect(
    administerIntegrationLogin({ ...input, action: "mcp-auth-wait" }, f.context, f.options),
  ).rejects.toThrow("definition changed");
  expect(f.call).toHaveBeenCalledExactlyOnceWith("controlMcpAuthentication", {
    version: 1,
    operationId: input.operationId,
    action: "cancel",
  });
});

it("refuses definition changes after an asynchronous start and confirms cancellation", async () => {
  const f = fixture();
  const input = f.start();
  f.call.mockImplementation(async (name, payload) => {
    if (
      name === "controlMcpAuthentication" &&
      controlMcpAuthenticationPayloadSchema.parse(payload).action === "start"
    )
      f.settings.mcpServers[0]!.name = "Changed";
    return f.reply(name, payload) as never;
  });
  await expect(administerIntegrationLogin(input, f.context, f.options)).rejects.toThrow(
    "definition changed",
  );
  expect(f.call.mock.calls.at(-1)).toEqual([
    "controlMcpAuthentication",
    { version: 1, operationId: input.operationId, action: "cancel" },
  ]);
});

it("checks that credentials remain usable before confirming either account domain", async () => {
  const f = fixture();
  f.call.mockImplementation(async (name, payload) => {
    if (name === "getMcpOauthStatus") return { authenticatedUrls: [] } as never;
    if (name === "pluginAccounts") return { accounts: [] } as never;
    return f.reply(name, payload) as never;
  });
  await expect(administerIntegrationLogin(f.start(), f.context, f.options)).rejects.toThrow(
    "no longer usable",
  );
  await expect(
    administerIntegrationLogin(
      {
        action: "plugin-account-start",
        operationId: randomUUID(),
        pluginName: "notes",
        serverName: "tools",
        label: "Work",
      },
      f.context,
      f.options,
    ),
  ).rejects.toThrow("no longer connected");
});

it("joins cancellation after the owner connection closes during a held start", async () => {
  const f = fixture();
  const entered = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const retired = Promise.withResolvers<void>();
  f.call.mockImplementation(async (name, payload) => {
    if (name === "controlMcpAuthentication") {
      const command = controlMcpAuthenticationPayloadSchema.parse(payload);
      if (command.action === "start") {
        entered.resolve();
        await finish.promise;
      }
      if (command.action === "cancel") await retired.promise;
    }
    return f.reply(name, payload) as never;
  });
  let settled = false;
  const outcome = administerIntegrationLogin(f.start(), f.context, f.options).then(
    () => undefined,
    (error: unknown) => {
      settled = true;
      return error;
    },
  );
  await entered.promise;
  f.controller.abort(new Error("owner connection closed"));
  finish.resolve();
  try {
    await setImmediate();
    expect(settled).toBe(false);
    expect(f.call.mock.calls.at(-1)?.[0]).toBe("controlMcpAuthentication");
  } finally {
    retired.resolve();
  }
  expect(await outcome).toMatchObject({ message: "owner connection closed" });
});

it("refuses a different target without returning its authorization URL", async () => {
  const f = fixture();
  const input = f.start();
  f.call.mockImplementation(async (name, payload) => {
    const result = f.reply(name, payload);
    if (
      name === "controlMcpAuthentication" &&
      controlMcpAuthenticationPayloadSchema.parse(payload).action === "start"
    )
      return {
        version: 1,
        action: "start",
        operationId: input.operationId,
        target: { scope: "saved-user", serverId: "other" },
        authorization: {
          status: "redirect",
          flowId: randomUUID(),
          authorizationUrl: "https://private.invalid/authorize",
        },
      } as never;
    return result as never;
  });
  await expect(administerIntegrationLogin(input, f.context, f.options)).rejects.toThrow(
    "different integration authentication target",
  );
});

it("requires persistent credential authority before starting, while cancellation stays available", async () => {
  const f = fixture();
  f.options.assertCanPersistSecrets.mockImplementation(() => {
    throw new Error("Persistent credential authority unavailable");
  });
  await expect(administerIntegrationLogin(f.start(), f.context, f.options)).rejects.toThrow(
    "credential authority unavailable",
  );
  expect(f.call).not.toHaveBeenCalled();
  await expect(
    administerIntegrationLogin(
      { action: "integration-auth-cancel", operationId: randomUUID() },
      f.context,
      f.options,
    ),
  ).resolves.toMatchObject({ cancelled: true });
});
