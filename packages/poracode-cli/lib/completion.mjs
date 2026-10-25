// Generated shell scripts can outlive the CLI that printed them. Keep query
// version 1 closed and refuse unknown versions before resolving a runtime.
export const CLI_COMPLETION_VERSION = 1;
export const CLI_COMPLETION_HELP =
  "  completion bash|zsh|fish|powershell\n" +
  "    Print a shell completion script; save and source it explicitly. Requires Bash 4+ or PowerShell 7; Zsh needs compinit.\n" +
  "    No shell profile is edited. Commands, flags and static choices complete offline; IDs stay explicit.\n" +
  "  completion --json\n" +
  `    Print the public completion catalog (formatVersion ${CLI_COMPLETION_VERSION}), without loading the runtime or querying an owner.\n` +
  `  completion --query ${CLI_COMPLETION_VERSION} --current=PREFIX -- COMPLETED_WORDS\n` +
  "    Shell integration protocol: version header, then candidates/files/none and static candidates or an inline option prefix.\n";

const flag = { kind: "flag" };
const value = { kind: "value" };
const file = { kind: "file" };
const choices = (...values) => ({ kind: "value", values });
const repeated = (option) => ({ ...option, repeatable: true });
const help = { "--help": flag, "-h": flag, "--base-dir": file };
const json = { "--json": flag };
const wsl = { ...json, "--wsl": value };
const profileEnvironment = {
  "--env-file": file,
  "--env-stdin": flag,
  "--prompt-env": repeated(value),
};
const serve = { "--config": file, "--host": value, "--port": value, "--trusted-proxies": value };
const configuration = {
  ...serve,
  "--bind-mode": choices("loopback", "tailnet", "lan"),
  "--tls-cert": file,
  "--tls-key": file,
  "--relay-url": value,
  "--log-level": choices("debug", "info", "warn", "error"),
  "--log-max-bytes": value,
  "--log-max-files": value,
  "--shutdown-drain-deadline-ms": value,
  "--unset": repeated(
    choices(
      "host",
      "port",
      "bindMode",
      "tlsCert",
      "tlsKey",
      "relayUrl",
      "trustedProxies",
      "logLevel",
      "logMaxBytes",
      "logMaxFiles",
      "shutdownDrainDeadlineMs",
    ),
  ),
  "--show": flag,
  "--effective": flag,
  ...json,
};
const auth = { ...wsl, "--runtime": value };
const scopes = [
  "session:read",
  "session:operate",
  "terminal:read",
  "terminal:operate",
  "requests:resolve",
  "projects:manage",
  "ports:forward",
];
const nodes = {
  "": {
    subcommands: [
      "serve",
      "setup",
      "configure",
      "providers",
      "projects",
      "run",
      "auth",
      "clients",
      "pairings",
      "plugins",
      "mcp",
      "sessions",
      "pair",
      "connect",
      "status",
      "stop",
      "doctor",
      "logs",
      "activate",
      "backup",
      "init-tls",
      "upgrade",
      "service",
      "completion",
      "version",
      "help",
    ],
    options: { ...serve, "--open": flag, "--no-open": flag, "--version": flag, "-v": flag },
  },
  serve: { options: { ...serve, "--open": flag, "--no-open": flag } },
  logs: { options: { "--follow": flag, "--lines": value, "--log-file": file, ...json } },
  run: {
    options: {
      "--standalone": flag,
      "--interactive": flag,
      "--options": flag,
      "--project": value,
      "--directory": file,
      "--file": repeated(file),
      "--session": value,
      "--provider": value,
      "--model": value,
      "--effort": value,
      "--approval-policy": value,
      "--sandbox": value,
      "--wsl": value,
      "--prompt-stdin": flag,
      "--format": choices("text", "json"),
    },
  },
  setup: {
    options: {
      "--config": file,
      "--start": flag,
      "--no-start": flag,
      "--skip-auth": flag,
      "--open": flag,
      "--no-open": flag,
      "--provider": value,
      "--method": value,
      "--runtime": value,
      "--wsl": value,
      "--profile-env": flag,
      "--profile": value,
      "--new-profile": value,
      "--driver": value,
      "--profile-config-file": file,
      "--prompt-env": repeated(value),
    },
  },
  configure: { options: configuration },
  providers: {
    subcommands: [
      "custom",
      "list",
      "catalog",
      "drivers",
      "install",
      "add",
      "configure",
      "remove",
      "unset-env",
    ],
  },
  "providers list": { options: wsl },
  "providers custom": { subcommands: ["list", "inspect", "add", "configure", "remove"] },
  "providers custom list": { options: json },
  "providers custom inspect": { options: json },
  "providers custom add": {
    options: { ...json, "--name": value, "--config-file": file, ...profileEnvironment },
  },
  "providers custom configure": {
    options: {
      ...json,
      "--name": value,
      "--config-file": file,
      "--enable": flag,
      "--disable": flag,
      ...profileEnvironment,
    },
  },
  "providers custom remove": { options: { ...json, "--yes": flag } },
  "providers catalog": { options: wsl },
  "providers drivers": { options: json },
  "providers install": { options: wsl },
  "providers add": {
    options: {
      ...json,
      "--driver": value,
      "--name": value,
      "--config-file": file,
      ...profileEnvironment,
    },
  },
  "providers configure": {
    options: {
      ...json,
      "--name": value,
      "--enable": flag,
      "--disable": flag,
      "--config-file": file,
      ...profileEnvironment,
    },
  },
  "providers remove": { options: { ...json, "--yes": flag } },
  "providers unset-env": { options: json },
  auth: { subcommands: ["list", "accounts", "methods", "login", "logout"] },
  "auth list": { options: wsl },
  "auth accounts": { options: wsl },
  "auth methods": { options: auth },
  "auth login": { options: { ...auth, "--method": value } },
  "auth logout": { options: { ...auth, "--credential": value } },
  clients: { subcommands: ["list", "revoke", "remove"] },
  sessions: {
    subcommands: [
      "list",
      "inspect",
      "stop",
      "export",
      "rename",
      "archive",
      "unarchive",
      "done",
      "reopen",
    ],
  },
  projects: { subcommands: ["list", "inspect", "add"] },
  "projects list": { options: { ...json, "--limit": value, "--cursor": value } },
  "projects inspect": { options: json },
  "projects add": { options: { ...json, "--name": value } },
  "sessions export": { options: { "--output": file } },
  "sessions list": {
    options: { ...json, "--limit": value, "--cursor": value, "--project": value },
  },
  "sessions inspect": { options: json },
  "sessions stop": { options: { ...json, "--yes": flag } },
  "sessions rename": { options: { ...json, "--title": value } },
  "sessions archive": { options: { ...json, "--yes": flag } },
  "sessions unarchive": { options: json },
  "sessions done": { options: { ...json, "--yes": flag } },
  "sessions reopen": { options: json },
  "clients list": { options: json },
  "clients revoke": { options: json },
  "clients remove": { options: json },
  pairings: { subcommands: ["list", "create", "revoke"] },
  "pairings list": { options: json },
  "pairings create": {
    options: {
      ...json,
      "--preset": choices("viewer", "operator"),
      "--scope": repeated(choices(...scopes)),
      "--label": value,
      "--ttl": value,
      "--qr": flag,
    },
  },
  "pairings revoke": { options: json },
  plugins: {
    subcommands: [
      "list",
      "refresh",
      "accounts",
      "catalogs",
      "inspect",
      "install",
      "update",
      "remove",
      "enable",
      "disable",
    ],
  },
  "plugins catalogs": { subcommands: ["list", "add", "inspect", "refresh", "remove"] },
  "plugins catalogs list": { options: json },
  "plugins catalogs add": {
    options: { ...json, "--path": file, "--url": value, "--ref": value, "--yes": flag },
  },
  "plugins catalogs inspect": { options: json },
  "plugins catalogs refresh": { options: json },
  "plugins catalogs remove": { options: { ...json, "--yes": flag } },
  "plugins inspect": { options: json },
  "plugins install": { options: { ...json, "--review-digest": value, "--yes": flag } },
  "plugins update": { options: { ...json, "--review-digest": value, "--yes": flag } },
  "plugins remove": { options: { ...json, "--yes": flag } },
  "plugins enable": { options: { ...json, "--yes": flag } },
  "plugins disable": { options: { ...json, "--yes": flag } },
  "plugins accounts": { subcommands: ["list", "login", "select", "logout"] },
  "plugins accounts login": {
    options: { ...json, "--server": value, "--label": value, "--account": value },
  },
  "plugins accounts list": { options: json },
  "plugins accounts select": { options: { ...json, "--server": value, "--account": value } },
  "plugins accounts logout": {
    options: { ...json, "--server": value, "--account": value, "--yes": flag },
  },
  "plugins list": { options: json },
  "plugins refresh": { options: json },
  mcp: {
    subcommands: ["list", "inspect", "add", "configure", "enable", "disable", "remove", "auth"],
  },
  "mcp auth": { subcommands: ["status", "login", "logout"] },
  "mcp auth login": { options: json },
  "mcp auth status": { options: json },
  "mcp auth logout": { options: { ...json, "--yes": flag } },
  "mcp list": { options: json },
  "mcp inspect": { options: json },
  "mcp add": { options: { ...json, "--config-file": file, "--config-stdin": flag } },
  "mcp configure": {
    options: { ...json, "--config-file": file, "--config-stdin": flag, "--yes": flag },
  },
  "mcp enable": { options: json },
  "mcp disable": { options: json },
  "mcp remove": { options: { ...json, "--yes": flag } },
  pair: { options: { ...json, "--scope": choices("viewer", "operator") } },
  connect: { options: { ...json, "--scope": choices("viewer", "operator") } },
  status: { options: { ...json, "--details": flag } },
  stop: { options: { "--if-pid": value } },
  doctor: { options: { ...json, "--log-file": file } },
  activate: { options: { ...json, "--sign-in-again": flag } },
  backup: { options: { ...json, "--to": file } },
  "init-tls": { options: { ...json, "--cert": file, "--key": file } },
  upgrade: {
    options: {
      ...json,
      "--from": file,
      "--prefix": file,
      "--resume": flag,
      "--abandon-journal": flag,
      "--confirm": flag,
    },
  },
  service: { subcommands: ["install", "start", "stop", "restart", "status", "uninstall"] },
  "service install": {
    options: { ...json, "--prefix": file, "--config": file, "--recover": flag },
  },
  "service start": { options: { ...json, "--prefix": file } },
  "service stop": { options: { ...json, "--prefix": file } },
  "service restart": { options: { ...json, "--prefix": file } },
  "service status": { options: { ...json, "--prefix": file } },
  "service uninstall": { options: { ...json, "--prefix": file, "--recover": flag } },
  completion: { subcommands: ["bash", "zsh", "fish", "powershell"], options: json },
  "completion bash": { terminal: true },
  "completion zsh": { terminal: true },
  "completion fish": { terminal: true },
  "completion powershell": { terminal: true },
  version: { terminal: true },
  help: { terminal: true },
};
const optionsFor = (path) => ({
  ...(path === "completion" ? { "--help": flag, "-h": flag } : help),
  ...nodes[path].options,
});
const supportsInlineOption = (path, name) =>
  name !== "--base-dir" &&
  (path === "configure" ||
    path === "setup" ||
    ["providers", "projects", "auth", "clients", "pairings", "plugins", "mcp", "sessions"].some(
      (group) => path.startsWith(`${group} `),
    ));

export function queryCompletion(words, current) {
  const none = { mode: "none", candidates: [] };
  if (
    words.length > 512 ||
    Buffer.byteLength([...words, current].join("\0"), "utf8") > 65_536 ||
    [...words, current].some((word) =>
      word
        .split("")
        .some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127),
    )
  )
    return none;
  let path = "";
  let expected;
  let positional = false;
  const used = new Set();
  for (const word of words) {
    if (expected) {
      // Bash can tokenize --option=value as three completion words.
      if (word === "=") continue;
      expected = undefined;
      continue;
    }
    const node = nodes[path];
    const options = optionsFor(path);
    if (word.startsWith("-")) {
      const [name] = word.split("=", 1);
      if (!Object.hasOwn(options, name)) return none;
      const option = options[name];
      if (word.includes("=") && (option.kind === "flag" || !supportsInlineOption(path, name)))
        return none;
      used.add(name);
      if (name === "--help" || name === "-h" || name === "--version" || name === "-v") return none;
      if (path === "completion" && name === "--json") return none;
      if (path === "" && (Object.hasOwn(serve, name) || name === "--open" || name === "--no-open"))
        path = "serve";
      if (option.kind !== "flag" && !word.includes("=")) expected = option;
    } else if (!positional && node.subcommands?.includes(word)) {
      path = path ? `${path} ${word}` : word;
      if (nodes[path].terminal) return none;
    } else {
      if (node.subcommands || !path) return none;
      positional = true;
    }
  }
  const resultForValue = (option, prefix, optionPrefix = "") =>
    option.kind === "file"
      ? { mode: "files", candidates: [], optionPrefix }
      : {
          mode: "candidates",
          candidates: (option.values ?? [])
            .filter((candidate) => candidate.startsWith(prefix))
            .map((candidate) => optionPrefix + candidate),
        };
  if (expected) return resultForValue(expected, current);
  const node = nodes[path];
  const options = optionsFor(path);
  if (current.startsWith("--") && current.includes("=")) {
    const separator = current.indexOf("=");
    const name = current.slice(0, separator);
    if (
      !Object.hasOwn(options, name) ||
      options[name].kind === "flag" ||
      !supportsInlineOption(path, name)
    )
      return none;
    return resultForValue(options[name], current.slice(separator + 1), `${name}=`);
  }
  const candidates = [
    ...(!positional ? (node.subcommands ?? []) : []),
    ...Object.keys(options).filter((name) => !used.has(name) || options[name].repeatable),
  ];
  return {
    mode: "candidates",
    candidates: candidates.filter((candidate) => candidate.startsWith(current)),
  };
}

const header = `# poracode-completion-v${CLI_COMPLETION_VERSION}\n`;
const scripts = {
  bash: [
    "_poracode_complete() {",
    '  local cur="${COMP_WORDS[COMP_CWORD]-}" line prefix trim="" token index last join_next=0',
    "  local -a before=() reply=()",
    "  COMPREPLY=()",
    "  for (( index=1; index<COMP_CWORD; index++ )); do",
    '    token="${COMP_WORDS[index]}"',
    '    if [[ "$token" == : || "$token" == = ]] && (( ${#before[@]} > 0 )); then',
    '      last=$((${#before[@]} - 1)); before[last]="${before[last]}$token"; join_next=1',
    "    elif (( join_next )); then",
    '      before[last]="${before[last]}$token"; join_next=0',
    "    else",
    '      before+=("$token")',
    "    fi",
    "  done",
    "  if (( join_next )); then",
    '    trim="${before[last]}"; cur="$trim$cur"; unset \'before[last]\'',
    '  elif [[ "$cur" == : || "$cur" == = ]] && (( ${#before[@]} > 0 )); then',
    '    last=$((${#before[@]} - 1)); trim="${before[last]}$cur"; cur="$trim"; unset \'before[last]\'',
    "  fi",
    '  while IFS= read -r line; do reply+=("$line"); done < <(command poracode completion --query @VERSION@ "--current=$cur" -- "${before[@]}" 2>/dev/null)',
    '  [[ "${reply[0]-}" == poracode-completion-v@VERSION@ ]] || return',
    "  compopt +o filenames",
    '  case "${reply[1]-}" in',
    '    candidates) for line in "${reply[@]:2}"; do COMPREPLY+=("${line#"$trim"}"); done ;;',
    "    files)",
    "      compopt -o filenames",
    '      prefix="${reply[2]-}"',
    '      [[ -z "$prefix" ]] || cur="${cur#*=}"',
    '      while IFS= read -r line; do line="$prefix$line"; COMPREPLY+=("${line#"$trim"}"); done < <(compgen -f -- "$cur")',
    "      ;;",
    "  esac",
    "}",
    "if type compopt >/dev/null 2>&1; then",
    "  complete -F _poracode_complete poracode",
    "else",
    '  printf "%s\\n" "Poracode completion requires Bash 4+ (compopt)." >&2',
    "fi",
  ],
  zsh: [
    "_poracode_complete() {",
    "  local -a before reply",
    '  local cur="${words[CURRENT]}"',
    '  if (( CURRENT > 2 )); then before=("${words[@]:1:CURRENT-2}"); fi',
    '  reply=("${(@f)$(command poracode completion --query @VERSION@ "--current=$cur" -- "${before[@]}" 2>/dev/null)}")',
    '  [[ "${reply[1]-}" == poracode-completion-v@VERSION@ ]] || return',
    '  case "${reply[2]-}" in',
    '    candidates) (( ${#reply} > 2 )) && compadd -- "${reply[@]:2}" ;;',
    "    files)",
    '      if [[ -n "${reply[3]-}" ]]; then',
    '        local IPREFIX="$IPREFIX${reply[3]}" PREFIX="${PREFIX#*=}"',
    "      fi",
    "      _files",
    "      ;;",
    "  esac",
    "}",
    "if (( $+functions[compdef] )); then",
    "  compdef _poracode_complete poracode",
    "else",
    '  print -u2 "Poracode completion needs an initialized Zsh completion system (autoload -Uz compinit; compinit)."',
    "fi",
  ],
  fish: [
    "function __poracode_complete",
    "  set -l words (commandline -pxc)",
    "  set -l current (commandline -ct)",
    "  if not set -q current[1]; set current ''; end",
    '  set -l reply (command poracode completion --query @VERSION@ "--current=$current" -- $words[2..] 2>/dev/null)',
    "  test (count $reply) -ge 2; or return",
    '  test "$reply[1]" = poracode-completion-v@VERSION@; or return',
    "  switch $reply[2]",
    "    case candidates",
    "      if set -q reply[3]; printf '%s\\n' $reply[3..]; end",
    "    case files",
    "      set -l prefix ''",
    '      if set -q reply[3]; set prefix "$reply[3]"; set current (string replace -r "^[^=]*=" "" -- "$current"); end',
    '      for candidate in (complete -C "\'\' "(string escape -- "$current"))',
    '        printf \'%s%s\\n\' "$prefix" "$candidate"',
    "      end",
    "  end",
    "end",
    "complete -c poracode -f -a '(__poracode_complete)'",
  ],
  powershell: [
    "if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Poracode completion requires PowerShell 7.' }",
    "Register-ArgumentCompleter -Native -CommandName poracode -ScriptBlock {",
    "  param($wordToComplete, $commandAst, $cursorPosition)",
    "  $words = [System.Collections.Generic.List[string]]::new()",
    "  foreach ($element in ($commandAst.CommandElements | Select-Object -Skip 1)) {",
    "    if ($element.Extent.StartOffset -ge $cursorPosition) { break }",
    "    if ($wordToComplete.Length -gt 0 -and $element.Extent.EndOffset -ge $cursorPosition) { break }",
    "    if ($element -is [System.Management.Automation.Language.StringConstantExpressionAst]) { $words.Add($element.Value) }",
    "    else { $words.Add($element.Extent.Text) }",
    "  }",
    '  $reply = @(& poracode completion --query @VERSION@ ("--current=$wordToComplete") -- @words 2>$null)',
    "  if ($reply.Count -lt 2 -or $reply[0] -cne 'poracode-completion-v@VERSION@') { return }",
    "  if ($reply[1] -ceq 'candidates') {",
    "    for ($index = 2; $index -lt $reply.Count; $index++) {",
    "      [System.Management.Automation.CompletionResult]::new($reply[$index], $reply[$index], 'ParameterValue', $reply[$index])",
    "    }",
    "  } elseif ($reply[1] -ceq 'files') {",
    "    $prefix = ''; $current = $wordToComplete",
    "    if ($reply.Count -gt 2) { $prefix = $reply[2]; $current = $current.Substring($current.IndexOf('=') + 1) }",
    "    [System.Management.Automation.CompletionCompleters]::CompleteFilename($current) | ForEach-Object {",
    "      [System.Management.Automation.CompletionResult]::new(($prefix + $_.CompletionText), $_.ListItemText, $_.ResultType, $_.ToolTip)",
    "    }",
    "  }",
    "}",
  ],
};

export function renderCompletion(args) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return CLI_COMPLETION_HELP;
  if (args.length === 1 && args[0] === "--json")
    return (
      JSON.stringify({
        formatVersion: CLI_COMPLETION_VERSION,
        command: "poracode",
        shells: Object.keys(scripts),
        globalOptions: help,
        commands: nodes,
      }) + "\n"
    );
  if (args[0] === "--query") {
    if (args[1] !== String(CLI_COMPLETION_VERSION))
      throw new Error(
        "Unsupported completion query version. Regenerate the completion script using this CLI.",
      );
    if (!args[2]?.startsWith("--current=") || args[3] !== "--")
      throw new Error("Completion query requires --query 1 --current=PREFIX -- COMPLETED_WORDS.");
    const result = queryCompletion(args.slice(4), args[2].slice("--current=".length));
    return (
      [
        `poracode-completion-v${CLI_COMPLETION_VERSION}`,
        result.mode,
        ...(result.mode === "files"
          ? result.optionPrefix
            ? [result.optionPrefix]
            : []
          : result.candidates),
      ].join("\n") + "\n"
    );
  }
  if (args.length === 1 && Object.hasOwn(scripts, args[0]))
    return (
      header +
      scripts[args[0]].join("\n").replaceAll("@VERSION@", String(CLI_COMPLETION_VERSION)) +
      "\n"
    );
  throw new Error(
    "Usage: poracode completion bash|zsh|fish|powershell, or completion --json. Run completion --help.",
  );
}
