import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { writeFileAtomic } from "@/shared/atomicFile";
import {
  loadServerConfigFile,
  serverConfigFileSchema,
  defaultServerConfigPath,
  resolveServeSettings,
  applyServeSettingsToEnv,
} from "./serverConfig";
import {
  DEFAULT_REMOTE_ACCESS_PORT,
  resolveRemoteAccessBind,
  remoteTrustedProxyAddresses,
} from "@/host/remote/config";
import { printAdminResult } from "./cliAdmin";
import { promptCli, terminalText } from "./cliPrompts";

// Version the new script-facing view independently from saved config and admin
// requests; neither of those formats changes when launch sources are inspected.
export const CLI_EFFECTIVE_CONFIG_VERSION = 1;

function relayUrlForDisplay(value: string): string {
  try {
    const url = new URL(value);
    if (!url.hostname) return "[configured; invalid URL hidden]";
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const name of new Set(url.searchParams.keys())) url.searchParams.set(name, "[redacted]");
    return url.toString();
  } catch {
    return "[configured; invalid URL hidden]";
  }
}

export function extractBaseDir(args: readonly string[]) {
  const remaining: string[] = [];
  let baseDir: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--base-dir") {
      remaining.push(args[index]!);
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith("--") || baseDir !== undefined)
      throw new Error("Usage: --base-dir <profile namespace path> (once).");
    baseDir = resolve(value);
  }
  return { args: remaining, baseDir };
}

export async function runConfigure(profile: string, args: readonly string[]) {
  const { values } = parseArgs({
    args: [...args],
    options: {
      json: { type: "boolean" },
      show: { type: "boolean" },
      effective: { type: "boolean" },
      config: { type: "string" },
      host: { type: "string" },
      port: { type: "string" },
      "bind-mode": { type: "string" },
      "tls-cert": { type: "string" },
      "tls-key": { type: "string" },
      "relay-url": { type: "string" },
      "trusted-proxies": { type: "string" },
      "log-level": { type: "string" },
      "log-max-bytes": { type: "string" },
      "log-max-files": { type: "string" },
      "shutdown-drain-deadline-ms": { type: "string" },
      unset: { type: "string", multiple: true },
    },
    strict: true,
    allowPositionals: false,
  });
  const path = resolve(values.config ?? defaultServerConfigPath(profile));
  const previous = loadServerConfigFile({ path }) ?? {};
  const unset = (values.unset ?? []).map((field) => serverConfigFileSchema.keyof().parse(field));
  const patch = {
    ...(values.host !== undefined ? { host: values.host } : {}),
    ...(values.port !== undefined ? { port: Number(values.port) } : {}),
    ...(values["bind-mode"] !== undefined ? { bindMode: values["bind-mode"] } : {}),
    ...(values["tls-cert"] !== undefined ? { tlsCert: resolve(values["tls-cert"]) } : {}),
    ...(values["tls-key"] !== undefined ? { tlsKey: resolve(values["tls-key"]) } : {}),
    ...(values["relay-url"] !== undefined ? { relayUrl: values["relay-url"] } : {}),
    ...(values["trusted-proxies"] !== undefined
      ? { trustedProxies: values["trusted-proxies"].split(",").map((entry) => entry.trim()) }
      : {}),
    ...(values["log-level"] !== undefined ? { logLevel: values["log-level"] } : {}),
    ...(values["log-max-bytes"] !== undefined
      ? { logMaxBytes: Number(values["log-max-bytes"]) }
      : {}),
    ...(values["log-max-files"] !== undefined
      ? { logMaxFiles: Number(values["log-max-files"]) }
      : {}),
    ...(values["shutdown-drain-deadline-ms"] !== undefined
      ? { shutdownDrainDeadlineMs: Number(values["shutdown-drain-deadline-ms"]) }
      : {}),
  };
  if (values.show || values.effective) {
    if (Object.keys(patch).length || unset.length)
      throw new Error("--show/--effective cannot be combined with configuration changes.");
    if (values.show && values.effective) throw new Error("Choose --show or --effective.");
    if (values.effective) {
      const settings = resolveServeSettings({
        flags: {},
        env: process.env,
        defaultConfigPath: path,
      });
      const env = { ...process.env };
      applyServeSettingsToEnv(settings, env);
      const bind = resolveRemoteAccessBind({ env });
      printAdminResult(
        {
          formatVersion: CLI_EFFECTIVE_CONFIG_VERSION,
          configPath: path,
          view: "next-start",
          bindSource: bind.source,
          settings: {
            host: bind.host,
            port: settings.remoteAccessPort ?? DEFAULT_REMOTE_ACCESS_PORT,
            bindMode: bind.mode,
            relayUrl:
              settings.relayUrl === undefined ? null : relayUrlForDisplay(settings.relayUrl),
            tlsCert: settings.tlsCert ?? null,
            tlsKey: settings.tlsKey ?? null,
            trustedProxies: remoteTrustedProxyAddresses(env),
            logLevel: settings.logLevel,
            logMaxBytes: settings.logMaxBytes,
            logMaxFiles: settings.logMaxFiles,
            shutdownDrainDeadlineMs: settings.shutdownDrainDeadlineMs,
          },
          sources: settings.sources,
          warnings: [...settings.warnings, ...bind.warnings],
          refusal: bind.refusalReason,
          detail:
            "Resolved for the next start using this command's environment and working directory. A service may use different ones. The listener chooses its actual port at start; use status for the running owner.",
        },
        values.json === true,
      );
      return path;
    }
    printAdminResult(
      {
        configPath: path,
        config: {
          ...previous,
          ...(previous.relayUrl !== undefined
            ? { relayUrl: relayUrlForDisplay(previous.relayUrl) }
            : {}),
        },
      },
      values.json === true,
    );
    return path;
  }
  if (!Object.keys(patch).length && !unset.length) {
    if (!process.stdin.isTTY || values.json)
      throw new Error("Pass --host/--port to configure non-interactively, or use --show.");
    patch.host =
      (await promptCli(`Bind address [${terminalText(previous.host ?? "127.0.0.1")}]: `)).trim() ||
      previous.host ||
      "127.0.0.1";
    const port = (await promptCli(`Port [${previous.port ?? 49152}]: `)).trim();
    patch.port = port ? Number(port) : (previous.port ?? 49152);
  }
  for (const field of unset) {
    if (Object.hasOwn(patch, field)) throw new Error(`Cannot set and unset ${field} together.`);
  }
  const next = { ...previous, ...patch };
  for (const field of unset) delete next[field];
  const parsed = serverConfigFileSchema.safeParse(next);
  if (!parsed.success)
    throw new Error(
      `Invalid server configuration: ${parsed.error.issues.map((issue) => issue.path.join(".") + ": " + issue.message).join("; ")}`,
    );
  if (Boolean(parsed.data.tlsCert) !== Boolean(parsed.data.tlsKey))
    throw new Error("Set --tls-cert and --tls-key together, or run init-tls first.");
  writeFileAtomic(path, `${JSON.stringify(parsed.data, null, 2)}\n`, { mode: 0o600 });
  printAdminResult(
    {
      configPath: path,
      saved: true,
      next: `poracode --base-dir ${JSON.stringify(profile)} serve --config ${JSON.stringify(path)}`,
      detail:
        "Applies on the next explicit start. A wider network bind requires TLS or PORACODE_ALLOW_PLAINTEXT_LAN=1.",
    },
    values.json === true,
  );
  return path;
}
