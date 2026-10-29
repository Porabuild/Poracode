import { createReadStream, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { StringDecoder } from "node:string_decoder";
import {
  callHostControl,
  HostControlUnsupportedOperationError,
} from "@/backend/ownership/hostControlClient";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import {
  hostAdminRequest,
  hostAdminV2CommandSchema,
  hostAdminV3CommandSchema,
  hostAdminV4CommandSchema,
  hostAdminV5CommandSchema,
  hostAdminV6CommandSchema,
  hostAdminV7CommandSchema,
  hostAdminV8CommandSchema,
  hostAdminSessionInspectionSchema,
  hostAdminSessionListSchema,
  hostAdminSessionStopSchema,
  hostAdminSessionUpdateSchema,
  hostAdminSessionUpdateCommandSchema,
  hostAdminMcpPreparationSchema,
  hostAdminMcpDefinitionResultSchema,
  hostAdminMcpChangeResultSchema,
  hostAdminProfileDriversSchema,
  hostAdminMcpInspectionSchema,
  hostAdminMcpInventorySchema,
  hostAdminPluginInventorySchema,
  hostAdminProviderInventoryCommandSchema,
  type HostAdminCommand,
} from "@/shared/hostAdminProtocol";
import { redactDiagnosticLine } from "./serverDoctorIo";
import { promptCli, terminalText } from "./cliPrompts";
import { renderAdminResult } from "./cliAdminOutput";
import {
  collectProfileConfiguration,
  environmentNameSchema,
  validateProfileEnvironmentNames,
} from "./cliProfileSetup";
import type { McpServer } from "@/shared/contracts/mcpServer";
import {
  collectMcpDefinition,
  readEnvironmentStdin,
  readMcpDefinitionInput,
} from "./cliAdminInput";
import { parseIntegrationAccountCli, runIntegrationAccountCli } from "./cliIntegrationAccounts";
import { parseIntegrationLoginCli, runIntegrationLoginCli } from "./cliIntegrationLogin";
import { parsePluginCatalogCli, runPluginCatalogCli } from "./cliPluginCatalog";
import { parseSessionExportCli, runSessionExportCli } from "./cliSessionExport";
import { parseProjectCli, runProjectCli } from "./cliProjects";
import { parseRunCli, runRunCli } from "./cliRun";
import { parseCustomProviderCli, runCustomProviderCli } from "./cliCustomProviders";
import { hostProviderInventorySchema } from "@/shared/contracts/hostProviderInventory";

export function parseAdminCli(args: readonly string[]) {
  const [group, action, ...rest] = args;
  const common = { json: { type: "boolean" as const }, wsl: { type: "string" as const } };
  let options: Record<string, { type: "string" | "boolean"; multiple?: boolean }> = {};
  if (group === "providers") {
    if (action === "drivers") options = { json: common.json };
    else if (action === "list") options = { ...common, refresh: { type: "boolean" } };
    else if (action === "catalog" || action === "install") options = common;
    else if (action === "add")
      options = {
        json: common.json,
        driver: { type: "string" },
        name: { type: "string" },
        "config-file": { type: "string" },
        "env-file": { type: "string" },
        "prompt-env": { type: "string", multiple: true },
        "env-stdin": { type: "boolean" },
      };
    else if (action === "configure")
      options = {
        json: common.json,
        name: { type: "string" },
        enable: { type: "boolean" },
        disable: { type: "boolean" },
        "config-file": { type: "string" },
        "env-file": { type: "string" },
        "prompt-env": { type: "string", multiple: true },
        "env-stdin": { type: "boolean" },
      };
    else if (action === "remove") options = { json: common.json, yes: { type: "boolean" } };
    else if (action === "unset-env") options = { json: common.json };
    else
      throw new Error(
        "Usage: poracode providers list|drivers|catalog|install|add|configure|remove|unset-env. Run poracode --help.",
      );
  } else if (group === "auth") {
    if (action === "list") options = common;
    else if (action === "accounts") options = { ...common, runtime: { type: "string" } };
    else if (["methods", "login", "logout"].includes(action ?? ""))
      options = {
        ...common,
        ...(action === "login" ? { method: { type: "string" as const } } : {}),
        ...(action === "logout" ? { credential: { type: "string" as const } } : {}),
        runtime: { type: "string" },
      };
    else throw new Error("Usage: poracode auth list|accounts|methods|login|logout [provider].");
  } else if (group === "sessions") {
    if (
      !["list", "inspect", "stop", "rename", "archive", "unarchive", "done", "reopen"].includes(
        action ?? "",
      )
    )
      throw new Error(
        "Usage: poracode sessions list|inspect|stop|rename|archive|unarchive|done|reopen [thread-id]. Run sessions --help.",
      );
    options = {
      json: common.json,
      ...(action === "list"
        ? {
            limit: { type: "string" as const },
            cursor: { type: "string" as const },
            project: { type: "string" as const },
          }
        : {}),
      ...(["stop", "archive", "done"].includes(action ?? "")
        ? { yes: { type: "boolean" as const } }
        : {}),
      ...(action === "rename" ? { title: { type: "string" as const } } : {}),
    };
  } else if (group === "plugins") {
    if (action !== "list" && action !== "refresh")
      throw new Error("Usage: poracode plugins list|refresh [--json].");
    options = { json: common.json };
  } else if (group === "mcp") {
    if (
      !["list", "inspect", "enable", "disable", "remove", "add", "configure"].includes(action ?? "")
    )
      throw new Error(
        "Usage: poracode mcp list|inspect|enable|disable|remove|add|configure [server-id] [flags]. Run poracode mcp --help.",
      );
    options = {
      json: common.json,
      ...(["remove", "configure"].includes(action!) ? { yes: { type: "boolean" as const } } : {}),
      ...(["add", "configure"].includes(action!)
        ? {
            "config-file": { type: "string" as const },
            "config-stdin": { type: "boolean" as const },
          }
        : {}),
    };
  } else if (group === "pairings" && action === "create") {
    options = {
      json: common.json,
      preset: { type: "string" },
      scope: { type: "string", multiple: true },
      label: { type: "string" },
      ttl: { type: "string" },
      qr: { type: "boolean" },
    };
  } else if (
    (group === "clients" && ["list", "revoke", "remove"].includes(action ?? "")) ||
    (group === "pairings" && ["list", "revoke"].includes(action ?? ""))
  )
    options = { json: common.json };
  else throw new Error("Usage: poracode clients list|revoke|remove, or pairings list|revoke.");
  const parsed = parseArgs({ args: rest, options, allowPositionals: true, strict: true });
  const values = parsed.values;
  if (parsed.positionals.length > (group === "providers" && action === "unset-env" ? 201 : 1))
    throw new Error("Unexpected arguments. Run poracode --help.");
  const id = parsed.positionals[0];
  if (group === "mcp" && ["add", "configure"].includes(action!)) {
    const path = values["config-file"];
    const guided = action === "add" && path === undefined && !values["config-stdin"];
    if (!guided && !id)
      throw new Error(
        "MCP definition changes require an exact server ID. Run poracode mcp --help.",
      );
    if (
      !guided &&
      ((path !== undefined) === (values["config-stdin"] === true) ||
        (typeof path === "string" && !path.trim()))
    )
      throw new Error(
        "Choose exactly one --config-file JSON or --config-stdin for a complete MCP definition.",
      );
  }
  if (group === "providers" && action === "drivers" && id)
    throw new Error(
      "Driver discovery takes no ID or environment target. Run providers drivers --help.",
    );
  if ((group === "plugins" || (group === "mcp" && action === "list")) && id)
    throw new Error(
      "Integration inventory takes no ID. Use mcp inspect <server-id> for one saved server.",
    );
  const wslDistro = typeof values.wsl === "string" ? values.wsl : undefined;
  const target = wslDistro ? { wslDistro } : {};
  if ((action === "list" || action === "catalog") && id)
    throw new Error("This command takes no provider argument.");
  if (group === "pairings" && action === "create" && id)
    throw new Error("Pairing creation takes flags, not an ID.");
  if (values.qr && values.json)
    throw new Error("Choose --qr for terminal output or --json for scripts.");
  if (values.enable && values.disable) throw new Error("Choose --enable or --disable.");
  if (
    [
      values["env-file"] !== undefined,
      values["env-stdin"] === true,
      values["prompt-env"] !== undefined,
    ].filter(Boolean).length > 1
  )
    throw new Error(
      "Choose --env-file, --env-stdin or --prompt-env; values are never accepted on the command line.",
    );
  if (values["prompt-env"] !== undefined) {
    validateProfileEnvironmentNames(values["prompt-env"]);
  }
  return {
    group: group!,
    action: action!,
    id,
    names: parsed.positionals.slice(1),
    values,
    target,
    json: values.json === true,
  };
}

export function parsePairingTtl(value: string): number {
  const match = /^(\d+)(ms|s|m|h)$/u.exec(value);
  if (!match) throw new Error("Use a pairing TTL from 1s to 24h, such as 10m.");
  const units = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };
  return Number(match[1]) * units[match[2] as keyof typeof units];
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Could not read JSON file: ${path}.`);
  }
}

function readCommandFiles(input: ReturnType<typeof parseAdminCli>) {
  const environmentPath = input.values["env-file"];
  const configPath = input.values["config-file"];
  return {
    ...(typeof environmentPath === "string" && environmentPath
      ? {
          environment: z.record(environmentNameSchema, z.string()).parse(readJson(environmentPath)),
        }
      : {}),
    ...(typeof configPath === "string" && configPath && input.group !== "mcp"
      ? { config: z.json().parse(readJson(configPath)) }
      : {}),
  };
}

export function buildAdminCommand(
  input: ReturnType<typeof parseAdminCli>,
  parsedInput: ReturnType<typeof readCommandFiles> & {
    server?: McpServer;
    expectedServerRevision?: string;
  } = readCommandFiles(input),
): HostAdminCommand {
  const { group, action, id, values, target } = input;
  const sessionChange =
    group === "sessions" && ["rename", "archive", "unarchive", "done", "reopen"].includes(action);
  const stringValue = (name: string) =>
    typeof values[name] === "string" ? (values[name] as string) : undefined;
  const { environment, config } = parsedInput;
  let command: unknown;
  if (sessionChange)
    command = {
      action: "sessions-update",
      threadId: id,
      change: { kind: action, ...(action === "rename" ? { title: values.title } : {}) },
    };
  else if (group === "sessions")
    command =
      action === "list"
        ? {
            action: "sessions-list",
            ...(values.limit !== undefined ? { limit: Number(values.limit) } : {}),
            ...(values.cursor !== undefined ? { cursor: values.cursor } : {}),
            ...(values.project !== undefined ? { projectId: values.project } : {}),
          }
        : { action: `sessions-${action}`, threadId: id };
  else if (group === "providers" && action === "drivers") command = { action: "providers-drivers" };
  else if (group === "plugins") command = { action: `plugins-${action}` };
  else if (group === "mcp" && action === "add")
    command = { action: "mcp-add", server: parsedInput.server };
  else if (group === "mcp" && action === "configure")
    command = {
      action: "mcp-configure-checked",
      server: parsedInput.server,
      expectedServerRevision: parsedInput.expectedServerRevision,
    };
  else if (group === "mcp")
    command =
      action === "list"
        ? { action: "mcp-list" }
        : action === "inspect"
          ? { action: "mcp-inspect", serverId: id }
          : action === "remove"
            ? { action: "mcp-remove", serverId: id }
            : { action: "mcp-set-enabled", serverId: id, enabled: action === "enable" };
  else if (action === "list" && group === "providers")
    command = { action: "providers-inventory", refresh: values.refresh === true, ...target };
  else if (action === "list" && group === "auth") command = { action: "providers-list", ...target };
  else if (group === "providers" && action === "catalog") command = { action: "providers-catalog" };
  else if (group === "providers" && action === "install")
    command = { action: "providers-install", agentId: id, ...target };
  else if (group === "providers" && action === "add")
    command = {
      action: "providers-add",
      profile: {
        id,
        driver: stringValue("driver"),
        displayName: stringValue("name") ?? id,
        ...(config !== undefined ? { config } : {}),
        ...(environment
          ? {
              environment: Object.fromEntries(
                Object.entries(environment).map(([name, value]) => [
                  name,
                  { value, sensitive: true },
                ]),
              ),
            }
          : {}),
      },
    };
  else if (group === "providers" && action === "configure")
    command = {
      action: "providers-configure",
      instanceId: id,
      ...(stringValue("name") ? { displayName: stringValue("name") } : {}),
      ...(values.enable ? { enabled: true } : values.disable ? { enabled: false } : {}),
      ...(config !== undefined ? { config } : {}),
      ...(environment ? { environment } : {}),
    };
  else if (group === "providers" && action === "remove")
    command = { action: "providers-remove", instanceId: id };
  else if (group === "providers" && action === "unset-env")
    command = { action: "providers-unset-environment", instanceId: id, names: input.names };
  else if (group === "auth")
    command = {
      action: `auth-${action}`,
      agentKind: id,
      ...target,
      ...(stringValue("method") ? { methodId: stringValue("method") } : {}),
      ...(stringValue("credential") ? { credentialId: stringValue("credential") } : {}),
      ...(stringValue("runtime") ? { runtime: stringValue("runtime") } : {}),
    };
  else if (group === "pairings" && action === "create")
    command = {
      action: "pairings-create",
      ...(stringValue("preset") ? { preset: stringValue("preset") } : {}),
      ...(Array.isArray(values.scope) ? { scopes: values.scope } : {}),
      ...(stringValue("label") !== undefined ? { label: stringValue("label") } : {}),
      ...(stringValue("ttl") !== undefined ? { ttlMs: parsePairingTtl(stringValue("ttl")!) } : {}),
    };
  else if (group === "clients")
    command =
      action === "list" ? { action: "clients-list" } : { action: "clients-revoke", sessionId: id };
  else
    command =
      action === "list"
        ? { action: "pairings-list" }
        : { action: "pairings-revoke", pairingId: id };
  const result =
    group === "providers" && action === "list"
      ? hostAdminProviderInventoryCommandSchema.safeParse(command)
      : group === "sessions"
        ? sessionChange
          ? hostAdminSessionUpdateCommandSchema.safeParse(command)
          : hostAdminV8CommandSchema.safeParse(command)
        : group === "mcp" && ["add", "configure"].includes(action)
          ? hostAdminV7CommandSchema.safeParse(command)
          : group === "mcp" && ["enable", "disable", "remove"].includes(action)
            ? hostAdminV6CommandSchema.safeParse(command)
            : group === "plugins" || group === "mcp"
              ? hostAdminV4CommandSchema.safeParse(command)
              : group === "providers" && action === "drivers"
                ? hostAdminV5CommandSchema.safeParse(command)
                : hostAdminV2CommandSchema.safeParse(command);
  if (!result.success) {
    if (group === "sessions")
      throw new Error(
        "Use sessions list [--limit 1..100] [--cursor CURSOR] [--project ID], or sessions inspect|stop|rename|archive|unarchive|done|reopen <exact-thread-id>. Rename requires --title with 1..500 characters. Run sessions --help.",
      );
    if (group === "mcp")
      throw new Error(
        "Use mcp list, or mcp inspect|enable|disable|remove|add|configure <exact-server-id> with its required flags. Run poracode mcp --help.",
      );
    if (group === "plugins") throw new Error("Usage: poracode plugins list|refresh [--json].");
    if (group === "pairings" && action === "create")
      throw new Error(
        "Invalid pairing options. Choose one preset or explicit known scopes, a 1–120 character label, and a TTL from 1s to 24h (default 10m). Run poracode pairings --help.",
      );
    if (group === "providers" && action === "unset-env")
      throw new Error(
        "Usage: poracode providers unset-env <profile-id> NAME [NAME ...]. Environment names use letters, digits and underscores.",
      );
    if (group === "auth" && action === "accounts")
      throw new Error(
        "Usage: poracode auth accounts <provider> [--wsl DISTRO] [--json]. Runtime-specific account listing is unsupported.",
      );
    throw new Error(
      "Missing or invalid command arguments. Run poracode --help; provider profiles need --driver and a valid ID.",
    );
  }
  return result.data;
}

export async function connectHostAdministration(profileNamespace: string, signal?: AbortSignal) {
  const paths = resolveHostRootPaths(profileNamespace);
  // Pin one owner for the whole interaction, including terminal input/cleanup.
  const owner = await callHostControl(paths, "describe", signal ? { signal } : {});
  return async (command: HostAdminCommand, requestSignal?: AbortSignal) => {
    try {
      const response = await callHostControl(paths, "admin", {
        expectedGeneration: owner.ownerGeneration,
        payload: hostAdminRequest(command),
        ...(requestSignal ? { signal: requestSignal } : {}),
      });
      if (!response.result.outcome.ok) throw new Error(response.result.outcome.error);
      return response.result.outcome.data;
    } catch (error) {
      if (error instanceof HostControlUnsupportedOperationError)
        throw new Error(
          "This running owner does not support CLI administration. Upgrade it explicitly, then retry; it has been left running.",
          { cause: error },
        );
      throw error;
    }
  };
}

export async function requestHostAdministration(
  profileNamespace: string,
  command: HostAdminCommand,
  signal?: AbortSignal,
) {
  const request = await connectHostAdministration(profileNamespace, signal);
  return request(command, signal);
}

const terminalStartSchema = z.union([
  z.object({ sessionId: z.uuid() }),
  z.object({ authenticated: z.literal(true) }),
]);
const terminalReadSchema = z.object({
  data: z.string(),
  cursor: z.int().nonnegative(),
  finished: z.boolean(),
  exitCode: z.int().optional(),
});

export function createAuthInputRelay(write: (data: string) => Promise<void>) {
  const decoder = new StringDecoder("utf8");
  let pending = Promise.resolve();
  const queue = (text: string) => {
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 4_096, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end -= 1;
      const part = text.slice(start, end);
      start = end;
      pending = pending.then(() => write(part));
    }
    return pending;
  };
  return { push: (data: Buffer) => queue(decoder.write(data)), end: () => queue(decoder.end()) };
}

async function runAuthTerminal(
  request: Awaited<ReturnType<typeof connectHostAdministration>>,
  sessionId: string,
) {
  const controller = new AbortController();
  let pendingInput = Promise.resolve();
  let pendingOutput = Promise.resolve();
  let terminalError: unknown;
  let rejectOutput: ((error: Error) => void) | undefined;
  let inputActive = true;
  const raw = process.stdin.isTTY && typeof process.stdin.setRawMode === "function";
  const priorRaw = process.stdin.isRaw;
  const cancel = () => {
    controller.abort();
    rejectOutput?.(new Error("Provider login cancelled."));
  };
  const fail = (error: Error) => {
    terminalError ??= error;
    rejectOutput?.(error);
    controller.abort();
  };
  const relay = createAuthInputRelay(async (data) => {
    await request({ action: "auth-write", sessionId, data }, controller.signal);
  });
  const write = (data: Buffer) => {
    if (data.includes(3)) {
      cancel();
      return;
    }
    process.stdin.pause();
    pendingInput = relay
      .push(data)
      .then(() => {
        if (inputActive && !controller.signal.aborted) process.stdin.resume();
      })
      .catch((error: unknown) => {
        fail(error instanceof Error ? error : new Error("Provider login input failed."));
      });
  };
  const endInput = () => {
    pendingInput = relay.end().catch((error: unknown) => {
      fail(error instanceof Error ? error : new Error("Provider login input failed."));
    });
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  process.stdin.on("data", write);
  process.stdin.on("end", endInput);
  process.stdin.on("error", fail);
  process.stderr.on("error", fail);
  let cursor = 0;
  let failure: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    if (raw) process.stdin.setRawMode(true);
    process.stdin.resume();
    while (!controller.signal.aborted) {
      const result = terminalReadSchema.parse(
        await request({ action: "auth-read", sessionId, cursor }, controller.signal),
      );
      if (result.data) {
        const outputDone = Promise.withResolvers<void>();
        pendingOutput = outputDone.promise;
        try {
          await new Promise<void>((resolve, reject) => {
            rejectOutput = reject;
            try {
              process.stderr.write(result.data, (error) => {
                outputDone.resolve();
                if (error) {
                  fail(error);
                  reject(error);
                } else resolve();
              });
            } catch (error) {
              outputDone.resolve();
              reject(error);
            }
          });
        } finally {
          rejectOutput = undefined;
        }
      }
      controller.signal.throwIfAborted();
      cursor = result.cursor;
      if (result.finished) {
        if (result.exitCode !== 0)
          throw new Error(
            `Provider login exited with code ${result.exitCode}. Run auth methods to check supported methods.`,
          );
        break;
      }
      await delay(100, undefined, { signal: controller.signal });
    }
    if (controller.signal.aborted)
      throw terminalError instanceof Error ? terminalError : new Error("Provider login cancelled.");
  } catch (error) {
    failure = controller.signal.aborted
      ? terminalError instanceof Error
        ? terminalError
        : new Error("Provider login cancelled.", { cause: error })
      : error;
  } finally {
    inputActive = false;
    process.stdin.off("data", write);
    process.stdin.off("end", endInput);
    try {
      process.stdin.pause();
      if (raw) process.stdin.setRawMode(priorRaw);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await pendingInput;
      await request({ action: "auth-close", sessionId });
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await pendingOutput;
    } finally {
      process.stdin.off("error", fail);
      process.stderr.off("error", fail);
      process.off("SIGINT", cancel);
      process.off("SIGTERM", cancel);
    }
  }
  if (cleanupErrors.length)
    throw new AggregateError(
      failure === undefined ? cleanupErrors : [failure, ...cleanupErrors],
      `${failure instanceof Error ? `${failure.message} ` : ""}Provider login cleanup was not confirmed.`,
      { cause: failure ?? cleanupErrors[0] },
    );
  if (failure !== undefined)
    throw failure instanceof Error
      ? failure
      : new Error("Provider login failed.", { cause: failure });
  if (controller.signal.aborted)
    throw terminalError instanceof Error ? terminalError : new Error("Provider login cancelled.");
}

export async function runAdminCli(profile: string, args: readonly string[]) {
  const custom = parseCustomProviderCli(args);
  if (custom) return runCustomProviderCli(custom, () => connectHostAdministration(profile));
  const run = parseRunCli(args);
  if (run) {
    if (run.standalone)
      throw new Error("Standalone execution must enter through the owned CLI lifecycle.");
    return runRunCli(run, (signal) => connectHostAdministration(profile, signal));
  }
  const sessionExport = parseSessionExportCli(args);
  if (sessionExport)
    return runSessionExportCli(sessionExport, (signal) =>
      connectHostAdministration(profile, signal),
    );
  const catalog = parsePluginCatalogCli(args);
  const project = parseProjectCli(args);
  if (project) return runProjectCli(project, () => connectHostAdministration(profile));
  if (catalog) return runPluginCatalogCli(catalog, () => connectHostAdministration(profile));
  const login = parseIntegrationLoginCli(args);
  if (login)
    return runIntegrationLoginCli(login, (signal) => connectHostAdministration(profile, signal));
  const accounts = parseIntegrationAccountCli(args);
  if (accounts) {
    return runIntegrationAccountCli(accounts, () => connectHostAdministration(profile));
  }
  const input = parseAdminCli(args);
  const configureMcp = input.group === "mcp" && input.action === "configure";
  const guidedMcp =
    input.group === "mcp" &&
    input.action === "add" &&
    input.values["config-file"] === undefined &&
    !input.values["config-stdin"];
  if (guidedMcp && (!process.stdin.isTTY || input.json))
    throw new Error(
      "Guided MCP creation requires a terminal without --json. Scripts use mcp add <server-id> --config-file JSON or --config-stdin.",
    );
  if (input.values["config-stdin"] && process.stdin.isTTY)
    throw new Error(
      "--config-stdin reads a definition from a pipe. Use --config-file JSON in a terminal.",
    );
  if (configureMcp && !input.values.yes && (!process.stdin.isTTY || input.json))
    throw new Error(
      "MCP configure replaces the full saved definition. Pass --yes with its exact ID to confirm; omitted optional values take their defaults.",
    );
  const definition =
    !guidedMcp && input.group === "mcp" && ["add", "configure"].includes(input.action)
      ? await readMcpDefinitionInput(
          input.values["config-stdin"]
            ? process.stdin
            : createReadStream(input.values["config-file"] as string),
          input.id!,
          input.values["config-stdin"] ? "stdin" : "file",
        )
      : undefined;
  if (input.values["env-stdin"] && process.stdin.isTTY)
    throw new Error(
      "--env-stdin reads JSON from a pipe. Use --prompt-env NAME for hidden terminal entry.",
    );
  const promptEnvironment =
    input.values["prompt-env"] === undefined
      ? undefined
      : validateProfileEnvironmentNames(input.values["prompt-env"]);
  if (promptEnvironment && (!process.stdin.isTTY || input.json))
    throw new Error(
      "--prompt-env requires an interactive terminal without --json. Use --env-file or --env-stdin for scripts.",
    );
  const chooseProvider = input.group === "auth" && input.action !== "list" && !input.id;
  if (chooseProvider && (!process.stdin.isTTY || input.json))
    throw new Error("Specify a provider ID. Run poracode providers list --json.");
  const chooseProfile = input.group === "providers" && input.action === "configure" && !input.id;
  if (chooseProfile && (!process.stdin.isTTY || input.json))
    throw new Error("Specify a profile ID for scripts. Run providers list --json.");
  const askEnvironmentNames =
    input.group === "providers" &&
    input.action === "configure" &&
    process.stdin.isTTY === true &&
    !input.json &&
    !["name", "enable", "disable", "config-file", "env-file", "env-stdin", "prompt-env"].some(
      (name) => input.values[name] !== undefined && input.values[name] !== false,
    );
  const parsedInput = { ...readCommandFiles(input), ...(definition ? { server: definition } : {}) };
  let command: HostAdminCommand | undefined =
    chooseProvider || chooseProfile || configureMcp || guidedMcp
      ? undefined
      : buildAdminCommand(input, parsedInput);
  let environment = input.values["env-stdin"]
    ? await readEnvironmentStdin(process.stdin)
    : undefined;
  let expectedProfileRevision: string | undefined;
  if (command?.action === "providers-remove" && !input.values.yes) {
    if (!process.stdin.isTTY || input.json)
      throw new Error(
        "Profile removal deletes its saved configuration and environment values. Pass --yes with the explicit profile ID to confirm; history is preserved. Use supported auth logout before removal to sign out the provider account.",
      );
    const confirmation = await promptCli(
      `Remove saved profile ${terminalText(command.instanceId)} and its configuration/environment values? Type its ID to confirm: `,
    );
    if (confirmation.trim() !== command.instanceId) throw new Error("Profile removal cancelled.");
  }
  if (command?.action === "mcp-remove" && !input.values.yes) {
    if (!process.stdin.isTTY || input.json)
      throw new Error(
        "MCP removal deletes this saved user-server configuration. Pass --yes with its exact ID to confirm. OAuth credentials and running sessions are managed separately.",
      );
    const confirmation = await promptCli(
      `Remove saved MCP server ${terminalText(command.serverId)} configuration? Type its exact ID to confirm: `,
    );
    if (confirmation !== command.serverId) throw new Error("MCP configuration removal cancelled.");
  }
  if (
    (command?.action === "sessions-stop" ||
      (command?.action === "sessions-update" &&
        ["archive", "done"].includes(command.change.kind))) &&
    !input.values.yes
  ) {
    const action = command.action === "sessions-stop" ? "stop" : command.change.kind;
    if (!process.stdin.isTTY || input.json)
      throw new Error(
        `Session ${action} retires its live runtime. Pass --yes with the exact thread ID to confirm. Existing history-retention settings still apply.`,
      );
    const confirmation = await promptCli(
      `${terminalText(action)} session ${terminalText(command.threadId)}? Type its exact ID to confirm: `,
    );
    if (confirmation !== command.threadId) throw new Error(`Session ${action} cancelled.`);
  }
  const request = await connectHostAdministration(profile);
  if (guidedMcp) {
    const server = await collectMcpDefinition(request, input.id);
    input.id = server.id;
    command = buildAdminCommand(input, { ...parsedInput, server });
  }
  if (configureMcp) {
    const prepared = hostAdminMcpPreparationSchema.parse(
      await request({ action: "mcp-prepare-configuration", serverId: input.id! }),
    );
    if (prepared.id !== definition!.id)
      throw new Error(
        "The owner did not prepare the requested MCP server. No definition was submitted.",
      );
    if (!input.values.yes) {
      const confirmation = await promptCli(
        `Replace the full saved definition for ${terminalText(prepared.name)} (${terminalText(prepared.id)})? Omitted optional values take their defaults. Type its exact ID to confirm: `,
      );
      if (confirmation !== prepared.id) throw new Error("MCP configuration replacement cancelled.");
    }
    command = buildAdminCommand(input, {
      ...parsedInput,
      expectedServerRevision: prepared.serverRevision,
    });
  }
  if (chooseProvider) {
    const response = await request({
      action: "providers-list",
      ...input.target,
    });
    const list = z
      .object({
        providers: z.array(
          z.object({ kind: z.string(), label: z.string(), installed: z.boolean() }),
        ),
      })
      .parse(response)
      .providers.filter((entry) => entry.installed);
    if (!list.length)
      throw new Error(
        "No installed providers. Run providers catalog, then providers install <id>.",
      );
    list.forEach((entry, index) =>
      process.stderr.write(
        `${index + 1}. ${terminalText(entry.label)} (${terminalText(entry.kind)})\n`,
      ),
    );
    const selected = Number(await promptCli("Provider number: "));
    const provider = Number.isInteger(selected) ? list[selected - 1] : undefined;
    if (!provider) throw new Error("Invalid provider selection.");
    input.id = provider.kind;
  }
  if (
    input.group === "providers" &&
    (input.action === "add" || input.action === "configure") &&
    (chooseProfile || askEnvironmentNames || Array.isArray(promptEnvironment))
  ) {
    const selected = await collectProfileConfiguration(
      request,
      command?.action === "providers-add"
        ? { action: "add", id: input.id!, names: promptEnvironment!, profile: command.profile }
        : {
            action: "configure",
            ...(input.id ? { id: input.id } : {}),
            ...(Array.isArray(promptEnvironment) ? { names: promptEnvironment } : {}),
            askNames: askEnvironmentNames,
          },
    );
    input.id = selected.id;
    expectedProfileRevision = selected.expectedProfileRevision;
    if ("environment" in selected) environment = selected.environment;
  }
  command ??= buildAdminCommand(input, parsedInput);
  if (
    environment &&
    (command.action === "providers-add" || command.action === "providers-configure")
  ) {
    command = hostAdminV2CommandSchema.parse(
      command.action === "providers-configure"
        ? { ...command, environment }
        : {
            ...command,
            profile: {
              ...command.profile,
              environment: Object.fromEntries(
                Object.entries(environment).map(([name, value]) => [
                  name,
                  { value, sensitive: true },
                ]),
              ),
            },
          },
    );
  }
  if (command.action === "providers-configure" && expectedProfileRevision) {
    command = hostAdminV3CommandSchema.parse({
      ...command,
      action: "providers-configure-checked",
      expectedProfileRevision,
    });
  }
  if (command.action === "auth-login" && !command.methodId && process.stdin.isTTY && !input.json) {
    const methods = z
      .object({
        methods: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            type: z.string(),
            variables: z.array(z.object({ name: z.string() })).optional(),
          }),
        ),
        terminalLogin: z.boolean(),
        terminalPreferred: z.boolean().optional(),
      })
      .parse(
        await request({
          action: "auth-methods",
          agentKind: command.agentKind,
          ...input.target,
          ...(command.runtime ? { runtime: command.runtime } : {}),
        }),
      );
    // Older owners omit the preference; retain their terminal routing rather
    // than offering ACP methods they may intentionally bypass.
    if (!(methods.terminalPreferred ?? methods.terminalLogin) && methods.methods.length > 1) {
      methods.methods.forEach((method, index) =>
        process.stderr.write(
          `${index + 1}. ${terminalText(method.name)} (${terminalText(method.id)}; ${terminalText(method.type)})\n`,
        ),
      );
      const selected = Number(await promptCli("Authentication method number: "));
      const method = Number.isInteger(selected) ? methods.methods[selected - 1] : undefined;
      if (!method) throw new Error("Invalid authentication method selection.");
      if (method.type === "env_var") {
        const names =
          method.variables
            ?.map(({ name }) => name)
            .filter(
              (name) => environmentNameSchema.safeParse(name).success && name !== "__proto__",
            ) ?? [];
        throw new Error(
          `This method uses environment credentials. For a compatible saved profile, run providers configure <profile-id> ${names.map((name) => `--prompt-env ${name}`).join(" ") || "--env-file <JSON>"}; other providers need their supported server environment setup. This does not create an upstream account.`,
        );
      }
      command = { ...command, methodId: method.id };
    }
  }
  let result: unknown = await request(command);
  if (command.action === "providers-inventory") {
    const inventory = hostProviderInventorySchema.parse(result);
    if (
      (command.wslDistro
        ? inventory.environment.kind !== "wsl" || inventory.environment.distro !== command.wslDistro
        : inventory.environment.kind !== "native") ||
      inventory.observation.source !== (command.refresh ? "refresh" : "saved-cache")
    )
      throw new Error(
        "The owner returned a different provider observation scope; no inventory was printed.",
      );
    result = inventory;
  }
  if (command.action === "sessions-list") {
    const page = hostAdminSessionListSchema.parse(result);
    if (
      page.sessions.length > command.limit ||
      (command.projectId !== undefined &&
        page.sessions.some((session) => session.projectId !== command.projectId))
    )
      throw new Error("The owner returned a different session page; no metadata was printed.");
    result = page;
  } else if (command.action === "sessions-inspect") {
    const inspection = hostAdminSessionInspectionSchema.parse(result);
    if (inspection.session.id !== command.threadId)
      throw new Error("The owner returned a different session; no session metadata was printed.");
    result = inspection;
  } else if (command.action === "sessions-stop") {
    const stopped = hostAdminSessionStopSchema.parse(result);
    if (stopped.threadId !== command.threadId)
      throw new Error(
        "The owner returned a different session; retirement was not confirmed for the requested thread.",
      );
    result = stopped;
  } else if (command.action === "sessions-update") {
    const updated = hostAdminSessionUpdateSchema.parse(result);
    if (
      updated.session.id !== command.threadId ||
      JSON.stringify(updated.change) !== JSON.stringify(command.change) ||
      updated.runtime !==
        (["archive", "done"].includes(command.change.kind) ? "retired" : "unchanged") ||
      (command.change.kind === "rename" && updated.session.title !== command.change.title) ||
      (command.change.kind === "archive" && !updated.session.archived) ||
      (command.change.kind === "unarchive" && updated.session.archived) ||
      (command.change.kind === "done" && !updated.session.done) ||
      (command.change.kind === "reopen" && updated.session.done)
    )
      throw new Error(
        "The owner returned a different session change. Inspect sessions inspect before retrying; no success was printed.",
      );
    result = updated;
  } else if (command.action === "plugins-list" || command.action === "plugins-refresh")
    result = hostAdminPluginInventorySchema.parse(result);
  else if (command.action === "providers-drivers")
    result = hostAdminProfileDriversSchema.parse(result);
  else if (command.action === "mcp-list") result = hostAdminMcpInventorySchema.parse(result);
  else if (command.action === "mcp-inspect") result = hostAdminMcpInspectionSchema.parse(result);
  else if (command.action === "mcp-set-enabled" || command.action === "mcp-remove") {
    const change = hostAdminMcpChangeResultSchema.parse(result);
    if (
      change.serverId !== command.serverId ||
      (command.action === "mcp-remove"
        ? change.change !== "remove"
        : change.change !== "set-enabled" || change.enabled !== command.enabled)
    )
      throw new Error(
        "The owner response did not match the requested MCP configuration change. Inspect mcp list before retrying.",
      );
    result = change;
  } else if (command.action === "mcp-add" || command.action === "mcp-configure-checked") {
    const change = hostAdminMcpDefinitionResultSchema.parse(result);
    if (
      change.serverId !== command.server.id ||
      change.change !== (command.action === "mcp-add" ? "add" : "configure")
    )
      throw new Error(
        "The owner response did not match the requested MCP definition change. Inspect mcp list before retrying.",
      );
    result = change;
  }
  if (command.action === "pairings-create") {
    const grant = z
      .object({
        id: z.string(),
        pairingUrl: z.url(),
        expiresAt: z.string(),
        scopes: z.array(z.string()),
        label: z.string().optional(),
      })
      .parse(result);
    if (input.values.qr) {
      let qr: string;
      try {
        const { default: QRCode } = await import("qrcode");
        qr = await QRCode.toString(grant.pairingUrl, { type: "terminal", small: true });
      } catch (error) {
        try {
          await request({ action: "pairings-revoke", pairingId: grant.id });
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "QR generation failed and grant revocation was not confirmed. Run pairings list with the same --base-dir.",
            { cause: cleanupError },
          );
        }
        throw error;
      }
      process.stderr.write(qr);
    }
    if (input.json) printAdminResult(result, true);
    else
      process.stdout.write(
        `Pairing: ${grant.id}\n${grant.label ? `Label: ${JSON.stringify(grant.label)}\n` : ""}Expires: ${grant.expiresAt}\nScopes: ${grant.scopes.join(", ")}\n${grant.pairingUrl}\nRevoke: poracode pairings revoke ${grant.id} (use the same --base-dir)\n`,
      );
  } else if (command.action === "auth-login") {
    const started = terminalStartSchema.parse(result);
    if ("sessionId" in started) {
      await runAuthTerminal(request, started.sessionId);
      const refreshed = z.object({ provider: z.json() }).parse(
        await request({
          action: "auth-methods",
          agentKind: command.agentKind,
          ...input.target,
          ...(command.runtime ? { runtime: command.runtime } : {}),
        }),
      );
      printAdminResult({ loginCompleted: true, provider: refreshed.provider }, input.json);
    } else printAdminResult({ authenticated: true, agentKind: command.agentKind }, input.json);
  } else if (input.json) printAdminResult(result, true);
  else process.stdout.write(renderAdminResult(command, result));
}

export function printAdminResult(value: unknown, json: boolean) {
  process.stdout.write(`${JSON.stringify(value, null, json ? undefined : 2)}\n`);
}

export function reportAdminError(error: unknown, json: boolean) {
  const message = redactDiagnosticLine(error instanceof Error ? error.message : "Command failed.");
  const detail = /control.*(unavailable|reached)|ENOENT/iu.test(message)
    ? `${message} Start poracode serve with the same --base-dir, or run poracode doctor.`
    : message;
  if (json) process.stdout.write(`${JSON.stringify({ ok: false, error: detail })}\n`);
  else process.stderr.write(`[poracode] ${terminalText(detail)}\n`);
  process.exitCode = 1;
}
