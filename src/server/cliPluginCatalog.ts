import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Writable } from "node:stream";
import {
  hostAdminCatalogCommandSchema,
  hostAdminCatalogResultSchema,
  type HostAdminCatalogCommand,
  type HostAdminCatalogResult,
} from "@/shared/contracts/hostPluginCatalog";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import { publicPluginRepository } from "@/shared/plugins/marketplaces";
import { promptCli, terminalText } from "./cliPrompts";

type Request = (command: HostAdminCommand) => Promise<unknown>;
export function parsePluginCatalogCli(args: readonly string[]) {
  if (args[0] !== "plugins") return;
  const catalogs = args[1] === "catalogs";
  const operation = catalogs ? args[2] : args[1];
  if (
    !catalogs &&
    !["inspect", "install", "update", "remove", "enable", "disable"].includes(operation ?? "")
  )
    return;
  if (
    !(
      catalogs
        ? ["list", "add", "inspect", "refresh", "remove"]
        : ["inspect", "install", "update", "remove", "enable", "disable"]
    ).includes(operation ?? "")
  )
    throw new Error("Run plugins catalogs --help or plugins --help for supported operations.");
  const review = !catalogs && (operation === "install" || operation === "update");
  const mutating = catalogs
    ? operation === "add" || operation === "remove"
    : operation !== "inspect";
  const { values, positionals } = parseArgs({
    args: args.slice(catalogs ? 3 : 2),
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean" },
      ...(mutating ? { yes: { type: "boolean" as const } } : {}),
      ...(catalogs && operation === "add"
        ? {
            path: { type: "string" as const },
            url: { type: "string" as const },
            ref: { type: "string" as const },
          }
        : {}),
      ...(review ? { "review-digest": { type: "string" as const } } : {}),
    },
  });
  const catalogPath = typeof values.path === "string" ? values.path : undefined;
  const url = typeof values.url === "string" ? values.url : undefined;
  const ref = typeof values.ref === "string" ? values.ref : undefined;
  let raw: unknown;
  if (catalogs && operation === "add") {
    if (positionals.length || Boolean(catalogPath) === Boolean(url) || (ref !== undefined && !url))
      throw new Error(
        "Usage: plugins catalogs add --path PATH | --url HTTPS_REPOSITORY [--ref REF] [--yes] [--json].",
      );
    raw = {
      action: "catalogs-add",
      source: url
        ? {
            type: "git",
            url: publicPluginRepository(url),
            ...(ref !== undefined ? { ref } : {}),
          }
        : { type: "local", path: resolve(catalogPath!) },
    };
  } else if (catalogs) {
    if (positionals.length !== (operation === "list" ? 0 : 1))
      throw new Error("Use plugins catalogs list, or inspect|refresh|remove <catalog-uuid>.");
    raw = {
      action: `catalogs-${operation}`,
      ...(operation !== "list" ? { catalogId: positionals[0] } : {}),
    };
  } else if (operation === "enable" || operation === "disable" || operation === "remove") {
    if (positionals.length !== 1)
      throw new Error("Use plugins enable|disable|remove <exact-plugin-name>.");
    raw =
      operation === "remove"
        ? { action: "package-remove", pluginName: positionals[0] }
        : { action: "plugin-enabled", pluginName: positionals[0], enabled: operation === "enable" };
  } else {
    if (positionals.length !== 2)
      throw new Error("Use plugins inspect|install|update <catalog-uuid> <entry-name>.");
    raw = { action: "package-inspect", catalogId: positionals[0], entryName: positionals[1] };
  }
  const command = hostAdminCatalogCommandSchema.parse(raw);
  const reviewDigest =
    typeof values["review-digest"] === "string" ? values["review-digest"] : undefined;
  if (reviewDigest !== undefined && !/^[a-f0-9]{64}$/u.test(reviewDigest))
    throw new Error(
      "--review-digest requires the exact 64-character digest printed by plugins inspect.",
    );
  return {
    command,
    writeAction: review
      ? operation === "install"
        ? ("package-install" as const)
        : ("package-update" as const)
      : undefined,
    reviewDigest,
    json: values.json === true,
    yes: values.yes === true,
    mutating,
  };
}

export function renderPluginCatalogResult(result: HostAdminCatalogResult): string {
  const lines: string[] = [];
  if (result.pluginState)
    lines.push(
      `${terminalText(result.pluginState.pluginName)}: ${result.pluginState.enabled ? "enabled" : "disabled"}. Applies to future launches; existing sessions are retained.`,
    );
  if (result.inspection) {
    const item = result.inspection;
    lines.push(
      `${terminalText(item.name)} ${terminalText(item.version ?? "unversioned")}`,
      `Catalog: ${item.catalogId}`,
      `Revision: ${terminalText(item.revision)}`,
      `Review digest: ${item.digest}`,
      `Host OS supported: ${item.hostSupported ? "yes" : "no"}; default enabled after installation: ${item.defaultEnabled ? "yes" : "no"}.`,
      `Skills: ${item.skills.map(terminalText).join(", ") || "none"}.`,
    );
    for (const server of item.mcpServers)
      lines.push(
        `MCP ${terminalText(server.name)}: ${server.transport}; environment names: ${server.environmentNames.map(terminalText).join(", ") || "none"}; header names: ${server.headerNames.map(terminalText).join(", ") || "none"}.`,
      );
    for (const diagnostic of item.diagnostics)
      lines.push(`${diagnostic.severity}: ${terminalText(diagnostic.code)}`);
    lines.push(
      "Package content may run commands and expose MCP tools when enabled. Review the package files before trusting it. Credential values, command arguments and diagnostic details are omitted.",
    );
  }
  if (!result.inspection && !result.pluginState) {
    lines.push("Global plugin catalogs:");
    for (const catalog of result.catalogs) {
      lines.push(
        `${catalog.id}  ${terminalText(catalog.name)}  ${catalog.entryCount} entries  revision ${terminalText(catalog.revision)}`,
        `  ${terminalText(catalog.source.type === "git" ? catalog.source.url : catalog.source.path)}`,
      );
      for (const item of catalog.entries ?? [])
        lines.push(
          `  ${terminalText(item.name)} ${terminalText(item.version ?? "")} ${item.unavailable.length ? `[unavailable: ${item.unavailable.map(terminalText).join(", ")}]` : ""} ${terminalText(item.description)}`,
        );
    }
    if (!result.catalogs.length) lines.push("None.");
    lines.push("Catalog-managed user packages:");
    for (const item of result.installations)
      lines.push(
        `${terminalText(item.pluginName)}  ${item.enabled === null ? "activation not configured" : item.enabled ? "enabled" : "disabled"}  ${item.digest}  catalog ${item.catalogId}`,
      );
    if (!result.installations.length) lines.push("None.");
  }
  return lines.join("\n") + "\n";
}

async function write(stream: Writable, text: string) {
  let failure: Error | undefined;
  const failed = (error: Error) => {
    failure ??= error;
  };
  stream.on("error", failed);
  try {
    await new Promise<void>((done, reject) =>
      stream.write(text, (error) => (error ? reject(error) : done())),
    );
    if (failure) throw failure;
  } finally {
    stream.off("error", failed);
  }
}
export async function runPluginCatalogCli(
  input: NonNullable<ReturnType<typeof parsePluginCatalogCli>>,
  connect: () => Promise<Request>,
) {
  if (input.mutating && !input.yes && (!process.stdin.isTTY || input.json))
    throw new Error(
      "This change requires --yes in scripts or --json. Inspect the exact target first.",
    );
  if (input.writeAction && input.yes && !input.reviewDigest)
    throw new Error(
      "Install/update with --yes requires --review-digest from plugins inspect; nothing was changed.",
    );
  const request = await connect();
  const call = async (command: HostAdminCatalogCommand) => {
    const result = hostAdminCatalogResultSchema.parse(await request(command));
    if (
      JSON.stringify(result.command) !==
      JSON.stringify(hostAdminCatalogCommandSchema.parse(command))
    )
      throw new Error("The owner returned a different catalog operation; no metadata was printed.");
    if (
      result.inspection &&
      "entryName" in command &&
      (result.inspection.catalogId !== command.catalogId ||
        result.inspection.entryName !== command.entryName ||
        result.inspection.name !== command.entryName)
    )
      throw new Error("The owner returned a different package; no package was selected.");
    if ("entryName" in command && !result.inspection)
      throw new Error("Package inspection was not returned; no package was confirmed.");
    if (
      command.action === "plugin-enabled" &&
      (!result.pluginState ||
        result.pluginState.pluginName !== command.pluginName ||
        result.pluginState.enabled !== command.enabled)
    )
      throw new Error(
        "The owner did not confirm the requested plugin enable policy. Inspect plugins list before retrying.",
      );
    return result;
  };
  let command = input.command;
  if (input.writeAction && command.action === "package-inspect") {
    const result = await call(command);
    if (!result.inspection)
      throw new Error("Package inspection was not returned; nothing was installed.");
    if (input.reviewDigest && input.reviewDigest !== result.inspection.digest)
      throw new Error(
        "Package contents changed after review. Inspect again; nothing was installed.",
      );
    if (!input.yes) {
      await write(process.stderr, renderPluginCatalogResult(result));
      if (
        (await promptCli(
          `Type ${terminalText(command.entryName)} to ${input.writeAction === "package-install" ? "install" : "update"} this reviewed package: `,
        )) !== command.entryName
      )
        throw new Error("Package change cancelled; nothing was installed.");
    }
    command = {
      ...command,
      action: input.writeAction,
      reviewDigest: input.reviewDigest ?? result.inspection.digest,
    };
  } else if (input.mutating && !input.yes) {
    let target: string;
    if (command.action === "catalogs-add")
      target = command.source.type === "git" ? command.source.url : command.source.path;
    else if ("catalogId" in command) target = command.catalogId;
    else if ("pluginName" in command) target = command.pluginName;
    else throw new Error("Unknown change target.");
    const effect =
      command.action === "package-remove"
        ? "remove the current catalog-owned files and its local service-account credentials"
        : command.action === "catalogs-remove"
          ? "remove this catalog registration, keeping installed packages and accounts"
          : command.action === "plugin-enabled"
            ? "change plugin enablement for future launches"
            : "register this catalog source";
    if ((await promptCli(`Type ${terminalText(target)} to ${effect}: `)) !== target)
      throw new Error("Plugin catalog change cancelled; nothing was changed.");
  }
  const result = await call(command);
  await write(
    process.stdout,
    input.json ? JSON.stringify(result) + "\n" : renderPluginCatalogResult(result),
  );
}
