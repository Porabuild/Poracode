import { parseArgs } from "node:util";
import { hostAdminCommandSchema } from "@/shared/hostAdminProtocol";
import { agentProfileDriver } from "@/shared/contracts/agentProfiles";
import { buildAdminCommand, parseAdminCli, reportAdminError, runAdminCli } from "./cliAdmin";
import { runConfigure } from "./cliConfigure";
import { promptCli, terminalText } from "./cliPrompts";

export const SETUP_HELP =
  "  setup [--config PATH] [--start | --no-start] [--open | --no-open] [--skip-auth]\n" +
  "    [--provider ID [--method ID] [--runtime ID]] [--wsl DISTRO]\n" +
  "    Or: --profile-env [--profile ID] [--prompt-env NAME ...] for sealed saved-profile values.\n" +
  "    New profile: --new-profile ID --driver DRIVER [--profile-config-file JSON] --prompt-env NAME ...\n" +
  "    Profile config is separate from server --config; the declared driver validates it before setup saves or starts.\n" +
  "    Use providers drivers against a running owner for driver IDs and declared key names. Hidden creation requires local-admin v5.\n" +
  "    Interactive configuration, optional foreground start, then provider login.\n" +
  "    Startup requires --start or an explicit answer. No service is installed.\n" +
  "    --open opens the local web app after startup; the default and --no-open keep the browser closed.\n" +
  "    --open conflicts with --no-start. The web client is served in either start mode.\n" +
  "    --no-start saves configuration only; --skip-auth starts without provider login.\n" +
  "    Profile values apply to that saved profile across its supported environments; they do not verify an upstream account.\n" +
  "    Existing owners are never stopped or adopted. Use auth login for a running owner.\n" +
  "    Scripts use configure, serve and auth login with explicit flags; setup requires a terminal.\n";

export function parseSetupCliOptions(args: readonly string[]) {
  const { values } = parseArgs({
    args: [...args],
    options: {
      config: { type: "string" },
      start: { type: "boolean" },
      "no-start": { type: "boolean" },
      open: { type: "boolean" },
      "no-open": { type: "boolean" },
      "skip-auth": { type: "boolean" },
      provider: { type: "string" },
      method: { type: "string" },
      runtime: { type: "string" },
      wsl: { type: "string" },
      "profile-env": { type: "boolean" },
      profile: { type: "string" },
      "new-profile": { type: "string" },
      "profile-config-file": { type: "string" },
      driver: { type: "string" },
      "prompt-env": { type: "string", multiple: true },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.start && values["no-start"])
    throw new Error("Choose --start or --no-start. Run setup --help.");
  if (values.open && values["no-open"])
    throw new Error("Choose --open or --no-open. Run setup --help.");
  if (values.open && values["no-start"])
    throw new Error("--open requires starting the server; it cannot be combined with --no-start.");
  for (const name of [
    "config",
    "provider",
    "method",
    "runtime",
    "wsl",
    "profile",
    "new-profile",
    "driver",
    "profile-config-file",
  ] as const) {
    const value = values[name];
    if (value !== undefined && !value.trim())
      throw new Error(`--${name} requires a nonempty value. Run setup --help.`);
  }
  if ((values.method || values.runtime) && !values.provider)
    throw new Error("--method/--runtime require --provider to select an exact provider identity.");
  if (values.profile && values["new-profile"])
    throw new Error(
      "Choose --profile for an existing profile or --new-profile for explicit creation.",
    );
  if (values.driver && !values["new-profile"])
    throw new Error(
      "--driver requires --new-profile; an existing profile's driver is not changed.",
    );
  if (values["profile-config-file"] && !values["new-profile"])
    throw new Error(
      "--profile-config-file requires --new-profile and is separate from server --config.",
    );
  if (values["new-profile"] && (!values.driver || !values["prompt-env"]?.length))
    throw new Error(
      "New-profile key setup requires --driver and at least one --prompt-env NAME. Use providers add directly for other profile configuration.",
    );
  const explicitAuth = Boolean(values.provider || values.method || values.runtime || values.wsl);
  const profileEnvironment =
    values["profile-env"] === true ||
    values.profile !== undefined ||
    values["new-profile"] !== undefined ||
    values["prompt-env"] !== undefined;
  if (profileEnvironment && explicitAuth)
    throw new Error(
      "Choose provider login options or saved-profile environment setup; these use separate credential paths.",
    );
  if ((explicitAuth || profileEnvironment) && (values["no-start"] || values["skip-auth"]))
    throw new Error("Authentication options cannot be combined with --no-start or --skip-auth.");
  const adminArgs = profileEnvironment
    ? [
        "providers",
        values["new-profile"] ? "add" : "configure",
        ...(values["new-profile"]
          ? [values["new-profile"], "--driver", values.driver!]
          : values.profile
            ? [values.profile]
            : []),
        ...(values["profile-config-file"] ? ["--config-file", values["profile-config-file"]] : []),
        ...(values["prompt-env"] ?? []).flatMap((name) => ["--prompt-env", name]),
      ]
    : ["auth", "login", ...(values.provider ? [values.provider] : [])];
  for (const name of ["method", "runtime", "wsl"] as const) {
    if (values[name]) adminArgs.push(`--${name}`, values[name]);
  }
  const auth = parseAdminCli(adminArgs);
  if (auth.id) {
    const command = buildAdminCommand(auth);
    if (command.action === "providers-add") {
      const driver = agentProfileDriver(command.profile.driver);
      if (!driver)
        throw new Error(
          "This CLI does not define that saved-profile driver. Use providers drivers with a running owner, or update the selected runtime explicitly.",
        );
      driver.validateConfig?.(command.profile.config);
    }
  } else if (!profileEnvironment)
    hostAdminCommandSchema.parse({ action: "providers-list", ...auth.target });
  return {
    ...(values.config ? { config: values.config } : {}),
    ...(values.start ? { start: true } : values["no-start"] ? { start: false } : {}),
    open: values.open === true,
    authenticate: values["skip-auth"]
      ? false
      : explicitAuth || profileEnvironment
        ? true
        : undefined,
    profileEnvironment,
    adminArgs,
  };
}

async function confirm(question: string, defaultValue: boolean) {
  const answer = (await promptCli(question)).trim();
  if (!answer) return defaultValue;
  if (/^(y|yes)$/iu.test(answer)) return true;
  if (/^(n|no)$/iu.test(answer)) return false;
  throw new Error("Answer yes or no; setup has not saved configuration or started a server.");
}

export async function runSetup(
  profile: string,
  options: ReturnType<typeof parseSetupCliOptions>,
  start: (configPath: string, open: boolean) => Promise<AbortSignal | undefined>,
) {
  if (!process.stdin.isTTY)
    throw new Error(
      "Setup requires an interactive terminal. Use configure, serve and auth login with explicit flags for scripts.",
    );
  process.stdout.write(
    `Profile: ${terminalText(profile)}\nSetup saves configuration and can keep a foreground server in this terminal. It does not install a background service.\n`,
  );
  const shouldStart =
    options.start ??
    (await confirm("Start this profile in the foreground after configuring? [y/N]: ", false));
  const authenticate =
    shouldStart &&
    (options.authenticate ??
      (await confirm("Authenticate a provider after startup? [Y/n]: ", true)));
  const configArgs = options.config ? ["--config", options.config] : [];
  const configPath = await runConfigure(profile, configArgs);
  await runConfigure(profile, ["--config", configPath, "--effective"]);
  if (!shouldStart) {
    process.stdout.write(
      "Configuration saved. No server was started and no provider login was attempted. Use serve with this profile when ready.\n",
    );
    return;
  }
  const signal = await start(configPath, options.open);
  if (!signal) throw new Error("Startup was cancelled; setup did not complete.");
  signal.throwIfAborted();
  process.stdout.write(
    "Server started in the foreground. Keep this terminal open; Ctrl+C requests its normal drain. Use pairings create from another terminal with the same --base-dir to connect a client.\n",
  );
  if (!authenticate) {
    process.stdout.write(
      "Provider authentication skipped. Use auth login with the same --base-dir when ready.\n",
    );
    return;
  }
  try {
    await runAdminCli(profile, options.adminArgs);
    signal.throwIfAborted();
  } catch (error) {
    if (signal.aborted) throw error;
    process.stderr.write(
      `Credential setup did not complete. The foreground server remains running; retry ${options.profileEnvironment ? `providers ${options.adminArgs[1]}` : "auth login"} from another terminal with the same --base-dir, or press Ctrl+C to drain it.\n`,
    );
    reportAdminError(error, false);
    return;
  }
  process.stdout.write(
    options.profileEnvironment
      ? "Saved-profile configuration completed. Upstream account authentication was not verified. The foreground server remains running.\n"
      : "Provider authentication flow completed. The foreground server remains running.\n",
  );
}
