import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import type { Writable } from "node:stream";
import {
  controlMcpAuthenticationResultSchema,
  mcpAuthenticationIdentitySchema,
  sameMcpAuthenticationIdentity,
  type McpAuthenticationIdentity,
} from "@/shared/contracts/mcpAuthentication";
import { pluginAccountSchema } from "@/shared/contracts/pluginCatalog";
import { hostAdminMcpAuthStatusSchema, type HostAdminCommand } from "@/shared/hostAdminProtocol";
import { terminalText } from "./cliPrompts";

type Request = (command: HostAdminCommand, signal?: AbortSignal) => Promise<unknown>;

export function parseIntegrationLoginCli(args: readonly string[]) {
  const [group, area, operation, ...rest] = args;
  if (
    operation !== "login" ||
    !((group === "mcp" && area === "auth") || (group === "plugins" && area === "accounts"))
  )
    return;
  const plugin = group === "plugins";
  const usage = plugin
    ? "Usage: poracode plugins accounts login PLUGIN --server NAME --label TEXT [--account UUID] [--json]."
    : "Usage: poracode mcp auth login SERVER_ID [--json].";
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean" },
      ...(plugin
        ? {
            server: { type: "string" as const },
            label: { type: "string" as const },
            account: { type: "string" as const },
          }
        : {}),
    },
  });
  if (positionals.length !== 1) throw new Error(usage);
  const parsed = mcpAuthenticationIdentitySchema.safeParse(
    plugin
      ? {
          scope: "plugin-service",
          pluginName: positionals[0],
          serverName: values.server,
          ...(values.account !== undefined ? { accountId: values.account } : {}),
        }
      : { scope: "saved-user", serverId: positionals[0] },
  );
  if (!parsed.success) throw new Error(usage);
  const label = plugin ? pluginAccountSchema.shape.label.safeParse(values.label) : undefined;
  if (label && !label.success) throw new Error(usage);
  return {
    target: parsed.data,
    ...(label?.success ? { label: label.data } : {}),
    json: values.json === true,
  };
}

export async function runIntegrationLoginCli(
  input: NonNullable<ReturnType<typeof parseIntegrationLoginCli>>,
  connect: (signal: AbortSignal) => Promise<Request>,
) {
  const operationId = randomUUID();
  const controller = new AbortController();
  let request: Request | undefined;
  let submitted = false;
  let cancellation: Promise<unknown> | undefined;
  let streamError: Error | undefined;
  let rejectOutput: ((error: Error) => void) | undefined;
  const writes = new Set<Promise<void>>();
  const raw = process.stdin.isTTY && typeof process.stdin.setRawMode === "function";
  const priorRaw = process.stdin.isRaw;
  const priorFlowing = process.stdin.readableFlowing;
  const cancel = () => {
    controller.abort();
    rejectOutput?.(streamError ?? new Error("Integration login canceled."));
    if (submitted && request) {
      cancellation ??= request({ action: "integration-auth-cancel", operationId }).then((value) => {
        const result = controlMcpAuthenticationResultSchema.parse(value);
        if (result.action !== "cancel" || result.operationId !== operationId)
          throw new Error("Integration cancellation was not confirmed.");
        return result;
      });
      void cancellation.catch(() => undefined);
    }
  };
  const fail = (error: Error) => {
    streamError ??= error;
    cancel();
  };
  const data = (bytes: Buffer) => {
    if (bytes.includes(3)) cancel();
  };
  const write = async (stream: Writable, text: string) => {
    controller.signal.throwIfAborted();
    const joined = Promise.withResolvers<void>();
    writes.add(joined.promise);
    await new Promise<void>((resolve, reject) => {
      rejectOutput = reject;
      try {
        stream.write(text, (error) => {
          writes.delete(joined.promise);
          joined.resolve();
          rejectOutput = undefined;
          if (error) {
            fail(error);
            reject(error);
          } else if (controller.signal.aborted)
            reject(streamError ?? new Error("Integration login canceled."));
          else resolve();
        });
      } catch (error) {
        writes.delete(joined.promise);
        joined.resolve();
        rejectOutput = undefined;
        fail(error instanceof Error ? error : new Error("Integration login output failed."));
        reject(error);
      }
    });
  };
  const check = (value: unknown, action: "start" | "wait", expected: McpAuthenticationIdentity) => {
    const result = controlMcpAuthenticationResultSchema.parse(value);
    if (
      result.action === "cancel" ||
      result.operationId !== operationId ||
      result.action !== action
    )
      throw new Error("The owner returned a different integration login operation.");
    const matches =
      expected.scope === "plugin-service" && !expected.accountId
        ? result.target.scope === "plugin-service" &&
          expected.pluginName === result.target.pluginName &&
          expected.serverName === result.target.serverName &&
          (result.authorization.status === "error" || result.target.accountId !== undefined)
        : sameMcpAuthenticationIdentity(expected, result.target);
    if (!matches)
      throw new Error(
        "The owner returned a different integration login account; no authorization URL was printed.",
      );
    return result;
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  process.stdin.on("error", fail);
  process.stdout.on("error", fail);
  process.stderr.on("error", fail);
  if (raw) process.stdin.on("data", data);
  let failure: unknown;
  const cleanup: unknown[] = [];
  try {
    if (raw) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }
    request = await connect(controller.signal);
    controller.signal.throwIfAborted();
    let start: HostAdminCommand;
    let wait: HostAdminCommand | undefined;
    if (input.target.scope === "saved-user") {
      const status = hostAdminMcpAuthStatusSchema.parse(
        await request(
          { action: "mcp-auth-status", serverId: input.target.serverId },
          controller.signal,
        ),
      );
      if (
        status.server.id !== input.target.serverId ||
        !status.sharedServerIds.includes(input.target.serverId) ||
        new Set(status.sharedServerIds).size !== status.sharedServerIds.length
      )
        throw new Error("The owner returned a different saved MCP target.");
      if (status.headerAuthorization)
        throw new Error(
          "A configured Authorization header takes precedence. Change it with mcp configure before OAuth login.",
        );
      const selected = {
        operationId,
        serverId: input.target.serverId,
        expectedServerRevision: status.serverRevision,
      };
      start = { action: "mcp-auth-start", ...selected };
      wait = { action: "mcp-auth-wait", ...selected };
    } else {
      start = {
        action: "plugin-account-start",
        operationId,
        pluginName: input.target.pluginName,
        serverName: input.target.serverName,
        label: input.label!,
        ...(input.target.accountId ? { accountId: input.target.accountId } : {}),
      };
    }
    controller.signal.throwIfAborted();
    submitted = true;
    const begun = check(await request(start, controller.signal), "start", input.target);
    controller.signal.throwIfAborted();
    if (begun.authorization.status === "error") throw new Error(begun.authorization.message);
    if (input.json) await write(process.stdout, `${JSON.stringify(begun)}\n`);
    if (begun.authorization.status === "redirect") {
      if (!input.json)
        await write(
          process.stderr,
          `Open this authorization URL:\n${terminalText(begun.authorization.authorizationUrl)}\nKeep this terminal open; Ctrl+C cancels login. For SSH, forward the callback's loopback port to this server before opening the URL on your own machine. No tunnel was created.\n`,
        );
      if (begun.target.scope === "plugin-service")
        wait = {
          action: "plugin-account-wait",
          operationId,
          pluginName: begun.target.pluginName,
          serverName: begun.target.serverName,
          accountId: begun.target.accountId!,
        };
      const result = check(await request(wait!, controller.signal), "wait", begun.target);
      controller.signal.throwIfAborted();
      if (result.authorization.status !== "authorized")
        throw new Error(
          result.authorization.status === "error"
            ? result.authorization.message
            : "Unexpected authentication result.",
        );
      if (input.json) await write(process.stdout, `${JSON.stringify(result)}\n`);
    }
    if (!input.json)
      await write(
        process.stdout,
        "Integration authentication completed. Use plugins accounts list or mcp auth status to inspect the local credential state.\n",
      );
    controller.signal.throwIfAborted();
  } catch (error) {
    failure = streamError ?? error;
    cancel();
  } finally {
    if (raw) {
      process.stdin.off("data", data);
      try {
        process.stdin.setRawMode(priorRaw);
        if (!priorFlowing) process.stdin.pause();
      } catch (error) {
        cleanup.push(error);
      }
    }
    await Promise.all(writes);
    if (cancellation)
      try {
        await cancellation;
      } catch (error) {
        cleanup.push(error);
      }
    process.stdin.off("error", fail);
    process.stdout.off("error", fail);
    process.stderr.off("error", fail);
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
  if (cleanup.length)
    throw new AggregateError(
      failure === undefined ? cleanup : [failure, ...cleanup],
      `${failure instanceof Error ? `${failure.message} ` : ""}Integration login cleanup was not confirmed.`,
      { cause: failure ?? cleanup[0] },
    );
  if (streamError) throw streamError;
  if (controller.signal.aborted && failure === undefined)
    throw new Error("Integration login canceled.");
  if (failure !== undefined)
    throw failure instanceof Error
      ? failure
      : new Error("Integration login failed.", { cause: failure });
}
