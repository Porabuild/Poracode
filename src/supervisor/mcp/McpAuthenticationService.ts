import type { z } from "zod";
import {
  controlMcpAuthenticationPayloadSchema,
  controlMcpAuthenticationResultSchema,
  mcpAuthenticationBeginSchema,
  mcpAuthenticationCompletionSchema,
  MCP_AUTHENTICATION_CONTROL_VERSION,
  sameMcpAuthenticationIdentity,
  type ControlMcpAuthenticationPayload,
  type ControlMcpAuthenticationResult,
  type McpAuthenticationIdentity,
} from "@/shared/contracts/mcpAuthentication";
import type { McpOAuthService } from "./McpOAuthService";
import type { PluginAccountService } from "../plugins/PluginAccountService";

type Completion = z.infer<typeof mcpAuthenticationCompletionSchema>;
type Begin = z.infer<typeof mcpAuthenticationBeginSchema>;
interface Operation {
  controller: AbortController;
  target: McpAuthenticationIdentity;
  ready: Promise<Begin>;
  pending: Promise<Completion>;
}
const cancelled: Completion = { status: "error", message: "Sign-in was canceled." };
function authenticationFailure(message: string): Extract<Completion, { status: "error" }> {
  return {
    status: "error",
    message:
      message === "Unsupported MCP OAuth store version."
        ? message
        : "Integration sign-in did not complete. Check the configured service, network access and browser approval, then retry.",
  };
}

/** Live work is never evicted; only completed UUID receipts have a bounded history. */
export class McpAuthenticationService {
  private stopped = false;
  private readonly active = new Map<string, Operation>();
  private readonly completed = new Map<
    string,
    { target: McpAuthenticationIdentity | null; authorization: Completion; cancelled: boolean }
  >();

  constructor(
    private readonly options: {
      oauth: Pick<McpOAuthService, "beginForCredential" | "wait" | "retireAuthentication">;
      plugins: Pick<PluginAccountService, "manage">;
    },
  ) {}

  async control(input: ControlMcpAuthenticationPayload): Promise<ControlMcpAuthenticationResult> {
    const payload = controlMcpAuthenticationPayloadSchema.parse(input);
    const common = {
      version: MCP_AUTHENTICATION_CONTROL_VERSION,
      operationId: payload.operationId,
    } as const;
    if (payload.action === "cancel") {
      const operation = this.active.get(payload.operationId);
      if (operation) {
        operation.controller.abort();
        await Promise.allSettled([operation.pending]);
        await this.options.oauth.retireAuthentication(operation.controller.signal);
        this.active.delete(payload.operationId);
      }
      this.remember(
        payload.operationId,
        operation?.target ?? this.completed.get(payload.operationId)?.target ?? null,
        cancelled,
        true,
      );
      return { ...common, action: "cancel", cancelled: true };
    }
    if (payload.action === "wait") {
      const operation = this.active.get(payload.operationId);
      const selected = operation?.target ?? this.completed.get(payload.operationId)?.target;
      if (!selected || !sameMcpAuthenticationIdentity(selected, payload.target))
        throw new Error("Authentication operation target did not match; no account was selected.");
      if (operation) await operation.pending;
      const receipt = this.completed.get(payload.operationId);
      if (!receipt?.target)
        throw new Error("Authentication operation not found; start a new login.");
      return controlMcpAuthenticationResultSchema.parse({
        ...common,
        action: "wait",
        target: receipt.target,
        authorization: receipt.authorization,
      });
    }
    if (this.stopped) throw new Error("Integration authentication is shutting down.");
    if (this.active.has(payload.operationId) || this.completed.has(payload.operationId))
      throw new Error("Authentication operation ID was already used; start a new login.");
    if (this.active.size >= 8)
      throw new Error("Too many active integration logins. Finish or cancel an existing login.");
    const controller = new AbortController();
    const ready = Promise.withResolvers<Begin>();
    const target: McpAuthenticationIdentity =
      payload.target.scope === "saved-user"
        ? { scope: "saved-user", serverId: payload.target.server.id }
        : {
            scope: "plugin-service",
            pluginName: payload.target.pluginName,
            serverName: payload.target.serverName,
            ...(payload.target.accountId ? { accountId: payload.target.accountId } : {}),
          };
    const pending = Promise.resolve().then(async (): Promise<Completion> => {
      try {
        controller.signal.throwIfAborted();
        let authorization: Begin;
        if (payload.target.scope === "saved-user") {
          if (
            Object.keys(payload.target.server.transport.headers).some(
              (name) => name.toLowerCase() === "authorization",
            )
          )
            throw new Error(
              "Configured Authorization headers take precedence; remove the header before OAuth login.",
            );
          authorization = mcpAuthenticationBeginSchema.parse(
            await this.options.oauth.beginForCredential(
              payload.target.server,
              undefined,
              controller.signal,
            ),
          );
        } else {
          const result = await this.options.plugins.manage(
            {
              action: "begin",
              pluginName: payload.target.pluginName,
              serverName: payload.target.serverName,
              label: payload.target.label,
              ...(payload.target.accountId ? { accountId: payload.target.accountId } : {}),
            },
            controller.signal,
          );
          authorization = mcpAuthenticationBeginSchema.parse(result.authorization);
          if (target.scope === "plugin-service" && result.accountId) {
            if (target.accountId && target.accountId !== result.accountId)
              throw new Error("The plugin returned a different account.");
            target.accountId = result.accountId;
          }
          if (
            authorization.status !== "error" &&
            target.scope === "plugin-service" &&
            !target.accountId
          )
            throw new Error("The plugin did not confirm the authentication account.");
        }
        if (authorization.status === "error")
          authorization = authenticationFailure(authorization.message);
        ready.resolve(controller.signal.aborted ? cancelled : authorization);
        const result =
          authorization.status === "redirect"
            ? mcpAuthenticationCompletionSchema.parse(
                await this.options.oauth.wait({ flowId: authorization.flowId }),
              )
            : authorization;
        return controller.signal.aborted
          ? cancelled
          : result.status === "error"
            ? authenticationFailure(result.message)
            : result;
      } catch {
        const failure: Completion = controller.signal.aborted
          ? cancelled
          : {
              status: "error",
              message:
                "Could not authenticate this integration. Check mcp inspect or plugins accounts list and retry.",
            };
        ready.resolve(failure);
        return failure;
      } finally {
        await this.options.oauth.retireAuthentication(controller.signal);
      }
    });
    const operation: Operation = { controller, target, ready: ready.promise, pending };
    this.active.set(payload.operationId, operation);
    void pending.then(
      (authorization) => {
        this.active.delete(payload.operationId);
        this.remember(payload.operationId, target, authorization);
      },
      (error: unknown) => {
        // Failed retirement retains the live operation for cancel/dispose retry.
        ready.reject(error);
      },
    );
    const authorization = await operation.ready;
    if (authorization.status !== "redirect" || controller.signal.aborted) await pending;
    return controlMcpAuthenticationResultSchema.parse({
      ...common,
      action: "start",
      target,
      authorization:
        controller.signal.aborted || this.completed.get(payload.operationId)?.cancelled
          ? cancelled
          : authorization,
    });
  }

  async dispose(): Promise<void> {
    this.stopped = true;
    const active = [...this.active.entries()];
    for (const [, operation] of active) operation.controller.abort();
    await Promise.all(
      active.map(async ([operationId, operation]) => {
        await Promise.allSettled([operation.pending]);
        await this.options.oauth.retireAuthentication(operation.controller.signal);
        if (this.active.get(operationId) === operation) this.active.delete(operationId);
        this.remember(operationId, operation.target, cancelled, true);
      }),
    );
  }

  private remember(
    operationId: string,
    target: McpAuthenticationIdentity | null,
    authorization: Completion,
    wasCancelled = false,
  ): void {
    this.completed.set(operationId, { target, authorization, cancelled: wasCancelled });
    if (this.completed.size > 128) this.completed.delete(this.completed.keys().next().value!);
  }
}
