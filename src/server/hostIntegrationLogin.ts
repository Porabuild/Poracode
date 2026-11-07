import type { z } from "zod";
import type { HostControlContext } from "@/backend/ownership/HostControlServer";
import type { SharedSettings } from "@/shared/settings";
import type { hostAdminV11CommandSchema } from "@/shared/hostAdminProtocol";
import {
  controlMcpAuthenticationResultSchema,
  MCP_AUTHENTICATION_CONTROL_VERSION,
  sameMcpAuthenticationIdentity,
  type ControlMcpAuthenticationPayload,
  type ControlMcpAuthenticationResult,
  type McpAuthenticationIdentity,
} from "@/shared/contracts/mcpAuthentication";
import { pluginAccountsResultSchema } from "@/shared/contracts/pluginCatalog";
import { mcpOauthStatusResultSchema } from "@/shared/contracts/mcpServer";
import { selectMcpAuthenticationTarget } from "./hostIntegrationAccounts";
import type { AdminSupervisorCall } from "./hostProviderAuth";

export async function administerIntegrationLogin(
  input: z.infer<typeof hostAdminV11CommandSchema>,
  context: HostControlContext,
  options: {
    call: AdminSupervisorCall;
    readSettings(): SharedSettings;
    revisionKey: Uint8Array;
    assertCanPersistSecrets(): void;
  },
) {
  context.assertActive();
  const common = {
    version: MCP_AUTHENTICATION_CONTROL_VERSION,
    operationId: input.operationId,
  } as const;
  const cancel = async () => {
    const result = controlMcpAuthenticationResultSchema.parse(
      await options.call("controlMcpAuthentication", { ...common, action: "cancel" }),
    );
    if (result.action !== "cancel" || result.operationId !== input.operationId)
      throw new Error("Integration cancellation was not confirmed.");
    return result;
  };
  if (input.action === "integration-auth-cancel") return cancel();
  options.assertCanPersistSecrets();
  let command: ControlMcpAuthenticationPayload;
  let expected: McpAuthenticationIdentity;
  const assertDefinition = () => {
    if (!("serverId" in input)) return;
    const selected = selectMcpAuthenticationTarget(
      options.readSettings().mcpServers,
      input.serverId,
      options.revisionKey,
    );
    if (selected.serverRevision !== input.expectedServerRevision)
      throw new Error(
        "The selected MCP definition changed. Login was not confirmed; review mcp auth status and start again.",
      );
    if (selected.headerAuthorization)
      throw new Error(
        "The configured Authorization header takes precedence. Remove it with mcp configure before OAuth login.",
      );
    return selected.server;
  };
  if ("serverId" in input) {
    let server;
    try {
      server = assertDefinition()!;
    } catch (error) {
      if (input.action === "mcp-auth-wait") await cancel();
      throw error;
    }
    expected = { scope: "saved-user", serverId: input.serverId };
    command =
      input.action === "mcp-auth-start"
        ? { ...common, action: "start", target: { scope: "saved-user", server } }
        : { ...common, action: "wait", target: expected };
  } else {
    expected = {
      scope: "plugin-service",
      pluginName: input.pluginName,
      serverName: input.serverName,
      ...(input.accountId ? { accountId: input.accountId } : {}),
    };
    command =
      input.action === "plugin-account-start"
        ? {
            ...common,
            action: "start",
            target: { ...expected, scope: "plugin-service", label: input.label },
          }
        : { ...common, action: "wait", target: expected };
  }
  let canceled: Promise<unknown> | undefined;
  const abort = () => {
    canceled ??= cancel();
    void canceled.catch(() => undefined);
  };
  context.signal.addEventListener("abort", abort, { once: true });
  let failure: { error: unknown } | undefined;
  let retirementFailure: { error: unknown } | undefined;
  let completed: ControlMcpAuthenticationResult | undefined;
  try {
    context.assertActive();
    const result = controlMcpAuthenticationResultSchema.parse(
      await options.call("controlMcpAuthentication", command),
    );
    context.assertActive();
    if (
      result.action === "cancel" ||
      result.action !== command.action ||
      result.operationId !== input.operationId
    )
      throw new Error("The supervisor returned a different integration authentication operation.");
    const target = result.target;
    const matched =
      expected.scope === "plugin-service" && !expected.accountId
        ? target.scope === "plugin-service" &&
          target.pluginName === expected.pluginName &&
          target.serverName === expected.serverName &&
          (result.authorization.status === "error" || target.accountId !== undefined)
        : sameMcpAuthenticationIdentity(expected, target);
    if (!matched)
      throw new Error("The supervisor returned a different integration authentication target.");
    const server = assertDefinition();
    if (server && result.authorization.status === "authorized") {
      const status = mcpOauthStatusResultSchema.parse(await options.call("getMcpOauthStatus", {}));
      context.assertActive();
      assertDefinition();
      if (!status.authenticatedUrls.includes(server.transport.url))
        throw new Error(
          "The saved MCP credentials are no longer usable; no authentication was confirmed.",
        );
    }
    if (target.scope === "plugin-service" && result.authorization.status === "authorized") {
      const inventory = pluginAccountsResultSchema.parse(
        await options.call("pluginAccounts", { action: "list", pluginName: target.pluginName }),
      );
      context.assertActive();
      if (
        !inventory.accounts.some(
          (account) =>
            account.id === target.accountId &&
            account.pluginName === target.pluginName &&
            account.serverName === target.serverName &&
            account.status === "connected",
        )
      )
        throw new Error(
          "The selected plugin account is no longer connected; no authentication was confirmed.",
        );
    }
    completed = result;
  } catch (error) {
    failure = { error };
    abort();
  } finally {
    context.signal.removeEventListener("abort", abort);
    if (canceled)
      try {
        await canceled;
      } catch (error) {
        retirementFailure = { error };
      }
  }
  if (retirementFailure)
    throw new AggregateError(
      failure ? [failure.error, retirementFailure.error] : [retirementFailure.error],
      `${failure?.error instanceof Error ? `${failure.error.message} ` : ""}Integration authentication retirement was not confirmed.`,
      { cause: failure ? failure.error : retirementFailure.error },
    );
  if (failure) throw failure.error;
  return completed!;
}
