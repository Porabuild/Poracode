import { CLI_LOGS_HELP } from "./cliLogs";

const RUN_HELP =
  "  run --options (--project PROJECT_ID | --directory PATH) --provider PROVIDER [--format text|json]\n" +
  "    Inspect the exact structured runtime's model, effort, approval and sandbox choices before running.\n" +
  "  run [--project PROJECT_ID | --directory PATH] [--provider PROVIDER] [--model MODEL] [flags] PROMPT\n" +
  "    When provider or model is omitted, use a matching last TUI selection; if no saved model applies, use the first model from run --options.\n" +
  "    --directory registers an existing native directory, including for --options (local-admin v20). Relative paths resolve from this CLI's cwd.\n" +
  "    Existing project IDs/settings remain; a new registration can remain if the subsequent run refuses. Inspect projects list before retrying.\n" +
  "    Do not combine --directory with --project, --session or --wsl. The same owner/generation handles registration and preparation.\n" +
  "    [--effort EFFORT] [--approval-policy POLICY] [--sandbox MODE] [--format text|json]\n" +
  "    Defaulted runs use saved approval/sandbox values only for the same TUI provider/model; otherwise specify advertised values explicitly.\n" +
  "    Use --prompt-stdin instead of PROMPT for scripts (UTF-8, maximum 16,384 characters/64 KiB).\n" +
  "    Add --file PATH repeatedly to a new or saved-session task (local-admin v21): at most 16 native regular files, 20 MiB combined.\n" +
  "    File paths resolve from this CLI's cwd; symlinks, directories, WSL files and --options with files refuse. A prompt is still required.\n" +
  "    The owner checks files during preparation and copies them at start; changed files refuse. Copies stay with retained history.\n" +
  "    Existing provider/model attachment support applies; some formats use file references rather than inline content.\n" +
  "    Supply a plain prompt; slash commands require an interactive client.\n" +
  "  run --session SESSION_ID [--prompt-stdin] [--format text|json] [PROMPT]\n" +
  "    Continue an exact saved structured session using its provider/profile, worktree and configuration. Requires local-admin v19.\n" +
  "    No project/provider/model/environment overrides or --options are accepted with --session. Reopen/unarchive explicitly first.\n" +
  "    An already running session refuses; use sessions stop explicitly before retrying. No latest-session or account fallback is selected.\n" +
  "    Explicit provider/model runs require a running owner; defaulted runs and -p start a background owner if none is running.\n" +
  "    Runs require local-admin v15 and an installed structured provider runtime.\n" +
  "    Add --standalone to own this profile for the task, then join host shutdown. An existing desktop/server owner refuses; none is stopped or upgraded.\n" +
  "    Standalone uses the same saved projects/providers/credentials/history, without a paired listener, relay, environment reconnects or saved background jobs.\n" +
  "    It ignores deployment listener/TLS/relay config, does not open a browser or register its native host, and keeps diagnostics on stderr.\n" +
  "    Select explicit advertised approval/sandbox values when that runtime exposes them; no permission is automatically approved.\n" +
  "    Permission/questions stop noninteractive runs with a nonzero exit. Terminal/WSL runs are not supported by this command.\n" +
  "    Add --interactive with a quoted prompt to review pending task requests (local-admin v23). Terminal stdin and stderr are required.\n" +
  "    Choose advertised option numbers (comma-separated for multi-select); empty input never approves. Ctrl+C cancels this run.\n" +
  "    Choose j for an advanced, hidden JSON response (24 KiB maximum). Complex forms need the adapter's response shape; use a client for guided forms.\n" +
  "    Requests/details appear on stderr; text/NDJSON stdout formats stay unchanged. --options and --prompt-stdin cannot be interactive.\n" +
  "    Resolved/replaced requests close their prompt; stale answers refuse. Provider authentication remains a separate auth command.\n" +
  "    text prints the final assistant output (maximum 1 MiB/4,096 items); task JSON uses format 2 with admin24 tool records, or legacy format 1 with older owners. Options JSON remains format 1.\n" +
  "    Success requires a completed turn, settled provider background work, committed history and confirmed runtime retirement.\n" +
  "    Ctrl+C, caller/pipe loss, the existing 10-minute local-control deadline or a 1 MiB unread-output overflow cancels this exact run.\n" +
  "    History remains under sessions list/inspect/export. Up to four runs may be reserved; unused preparations/results expire after 2 minutes idle.\n";
const TUI_HELP =
  "  tui [--continue|-c] [--session SESSION_ID] [--prompt TEXT] [--auto] [DIRECTORY]\n" +
  "    Open the local terminal UI. It uses the current directory by default and starts a background server if no owner is running.\n" +
  "    A checkout requires bun run tui:install; packaged builds use their staged binary or PORACODE_TUI_BIN.\n" +
  "    The server remains running after the TUI exits; stop it with poracode stop and the same --base-dir.\n" +
  "    Each launch pairs a Poracode TUI client. Use clients list/revoke to inspect or remove client entries.\n";
const PRINT_HELP =
  "  -p|--print PROMPT [--provider PROVIDER] [--model MODEL] [--effort EFFORT] [--format text|json]\n" +
  "    Run one prompt through the controlled run engine. Defaults use the last TUI provider/model/effort; when no saved model applies, use the first advertised model.\n" +
  "    Without a saved provider, start Poracode and run providers list, or specify --provider and --model.\n" +
  "    Approval and sandbox use saved values only for the same TUI provider/model; otherwise the command lists advertised choices and requires explicit flags.\n" +
  "    Add --directory PATH (defaults to the current directory) or --project PROJECT_ID, and repeat --file PATH for attachments.\n" +
  "    Starts a background server if no owner is running. Noninteractive permission/questions stop with a nonzero status; no permission is auto-approved.\n" +
  "    --interactive requires terminal stdin/stderr and reviews pending requests there. Output and exit semantics match run.\n";
const CONFIGURE_HELP =
  "  configure [--config PATH] [--host H] [--port P] [--bind-mode loopback|tailnet|lan]\n" +
  "    [--tls-cert PATH --tls-key PATH] [--relay-url URL] [--trusted-proxies ADDRESS,CIDR,...]\n" +
  "    [--log-level debug|info|warn|error] [--log-max-bytes N] [--log-max-files N]\n" +
  "    [--shutdown-drain-deadline-ms N] [--unset FIELD ...] [--json]\n" +
  "  configure --show|--effective [--config PATH] [--json]\n" +
  "    --show reads saved fields; --effective resolves the next start using this invocation's environment.\n" +
  "    Both views hide relay URL credentials, query values and fragments; inspection output is not a configuration export.\n" +
  "    Neither reads a running service's environment. Changes apply on the next explicit start.\n";
const PROJECTS_HELP =
  "  projects list [--limit 1..100] [--cursor CURSOR] [--json]\n" +
  "  projects inspect PROJECT_ID [--json]\n" +
  "  projects add DIRECTORY [--name NAME] [--json]\n" +
  "    Register an existing directory on this host; relative paths resolve in the CLI's working directory. No directory, repository or provider is created.\n" +
  "    Existing locations keep their ID and settings; an explicit --name updates their display name. WSL UNC paths retain their distribution.\n" +
  "    Inventory is paged (default 50); reuse nextCursor with the same --base-dir. It includes disabled projects but omits configuration and credentials.\n" +
  "    Requires the running owner and local-admin v14. JSON uses formatVersion 1, persisted-profile scope.\n";
const PROVIDERS_HELP =
  "  providers custom list|inspect|add|configure|remove (custom native ACP commands; see providers custom --help)\n" +
  "  providers list [--refresh] [--wsl DISTRO] [--json] (saved observations by default; no discovery)\n" +
  "  providers catalog [--wsl DISTRO] [--json]\n" +
  "  providers drivers [--json] (supported profile definitions; local-admin v5)\n" +
  "  providers install ID [--wsl DISTRO] [--json]\n" +
  "  providers add ID --driver DRIVER [--name NAME] [--config-file JSON] [--env-file JSON | --env-stdin | --prompt-env NAME ...] [--json]\n" +
  "  providers configure [ID] [--name NAME] [--enable|--disable] [--config-file JSON] [--env-file JSON | --env-stdin | --prompt-env NAME ...] [--json]\n" +
  "    In a terminal, omitting ID offers saved profiles; omitting edits asks for environment names and hidden values.\n" +
  "    Repeat --prompt-env NAME for hidden terminal entry. No values in argv or temporary files; all values are sealed.\n" +
  "    Interactive configure requires local-admin v3; a changed profile refuses without saving or falling back.\n" +
  "    Hidden add uses local-admin v5 creation checks before collecting values; the final add still validates a fresh snapshot.\n" +
  "    --prompt-env requires a terminal without --json. --env-stdin reads a bounded JSON object from a pipe; --env-file reads a file.\n" +
  "  providers remove ID [--yes] [--json] (saved profile only; preserves history)\n" +
  "  providers unset-env ID NAME [NAME ...] [--json]\n";
const AUTH_HELP =
  "  auth list [--wsl DISTRO] [--json]\n" +
  "  auth accounts PROVIDER [--wsl DISTRO] [--json]\n" +
  "  auth methods|login [PROVIDER] [--method ID (login)] [--runtime ID] [--wsl DISTRO] [--json]\n" +
  "  auth logout [PROVIDER] [--credential ID] [--runtime ID] [--wsl DISTRO] [--json]\n" +
  "    Interactive login offers installed providers and supported methods. Scripts specify the provider/method.\n" +
  "    accounts lists adapter-owned credentials for the exact native/WSL target; runtime variants refuse.\n" +
  "    Provider accounts, saved profile environment and client grants are separate. No universal switch/rename.\n";
const CLIENTS_HELP =
  "  clients list|revoke|remove [SESSION_ID] [--json]\n" +
  "    revoke/remove invalidate the selected client's access; they do not delete a saved remote route.\n";
const SESSIONS_HELP =
  "  sessions export THREAD_ID [--output FILE|-]\n" +
  "    Stream a consistent persisted transcript as versioned JSON (stdout by default). --output creates a complete new file; existing files are never replaced.\n" +
  "    Requires local-admin v13. Includes structured items, turns, context, history notices and saved terminal tail; attachment files and provider credentials are excluded.\n" +
  "    Transcript content may contain secrets supplied in conversations. Review before sharing. Partial stdout after an error is not a complete export.\n" +
  "  sessions list [--limit 1..100] [--cursor CURSOR] [--project PROJECT_ID] [--json]\n" +
  "  sessions inspect THREAD_ID [--json]\n" +
  "  sessions stop THREAD_ID [--yes] [--json]\n" +
  "    Persisted threads in this profile; list defaults to 50 and includes archived/done entries. Status is saved, not a live probe.\n" +
  "    Requires local-admin v8; JSON bodies have formatVersion 1 and persisted-profile scope. No provider-native history discovery.\n" +
  "    stop retires the owned PTY/structured runtime and confirms retirement; history remains. Scripts/JSON require --yes.\n" +
  "  sessions rename THREAD_ID --title TITLE [--json]\n" +
  "  sessions archive|done THREAD_ID [--yes] [--json]\n" +
  "  sessions unarchive|reopen THREAD_ID [--json]\n" +
  "    Metadata changes require local-admin v18. Archive/done confirm runtime retirement; scripts/JSON require --yes.\n" +
  "    Unarchive only restores visibility; reopen only clears done. Neither launches/resumes a provider. History retention settings still apply.\n";
const PAIRINGS_HELP =
  "  pairings list|revoke [PAIRING_ID] [--json]\n" +
  "  pairings create [--preset viewer|operator | --scope SCOPE ...] [--label TEXT] [--ttl 10m] [--qr | --json]\n" +
  "    Default: operator, 10m. TTL: 1s..24h; label: 1..120 characters. --qr writes to stderr.\n" +
  "    Scopes: session:read, session:operate, terminal:read, terminal:operate, requests:resolve, projects:manage, ports:forward.\n";
const PAIR_HELP =
  "  pair|connect [--scope viewer|operator] [--json]\n" +
  "    Print the running owner's pairing link. Use pairings create for an independent scoped/labelled grant.\n";
const PLUGIN_ACCOUNTS_HELP =
  "  plugins accounts list PLUGIN [--json]\n" +
  "  plugins accounts login PLUGIN --server NAME --label TEXT [--account UUID] [--json]\n" +
  "    Login requires local-admin v11. Open the printed authorization URL; keep the terminal open. --account reauthenticates that exact account.\n" +
  "    Ctrl+C joins owner-side cancellation. For SSH, forward the server's callback loopback port; no tunnel or browser is opened automatically.\n" +
  "    Login --json emits version-1 newline-delimited start/wait records, including the intentional authorization URL; failure uses the existing {ok:false,error} JSON record and a nonzero exit.\n" +
  "  plugins accounts select|logout PLUGIN --server NAME --account UUID [--yes (logout)] [--json]\n" +
  "    Requires local-admin v10; JSON formatVersion 1. Account IDs come from list; selection/logout preserves the exact plugin/server/account identity.\n" +
  "    Logout clears that account's local OAuth credentials, preserving its metadata. A terminal asks for the account UUID; scripts/JSON require --yes.\n" +
  "    Labels are user-assigned, not verified upstream identities. Provider logins and saved user MCP credentials are separate.\n";
const MCP_AUTH_HELP =
  "  mcp auth status SERVER_ID [--json]\n" +
  "  mcp auth login SERVER_ID [--json]\n" +
  "    Login requires local-admin v11 and the exact saved HTTP/SSE definition. Open the printed URL and keep the terminal open; Ctrl+C cancels and joins cleanup.\n" +
  "    For SSH, forward the callback loopback port to the server before opening the URL on your own machine. No browser/tunnel opens automatically.\n" +
  "    Login --json emits version-1 newline-delimited start/wait records; the authorization URL is intentional. Failure uses the existing {ok:false,error} JSON record and a nonzero exit.\n" +
  "  mcp auth logout SERVER_ID [--yes] [--json]\n" +
  "    Requires local-admin v10; JSON formatVersion 1. Exact saved user HTTP/SSE ID only; no network probe or credential values.\n" +
  "    OAuth credentials are shared by exact URL within the user MCP store. Status lists the saved IDs sharing that slot.\n" +
  "    Logout confirms the exact ID in a terminal; scripts/JSON require --yes. A changed definition or sharing set refuses before credential removal.\n" +
  "    Configured Authorization headers take precedence and remain unchanged. Plugin/provider accounts, configuration and running sessions are retained.\n";
const PLUGIN_CATALOG_HELP =
  "  plugins catalogs list|inspect CATALOG_ID|refresh CATALOG_ID [--json]\n" +
  "  plugins catalogs add --path PATH | --url HTTPS_REPOSITORY [--ref REF] [--yes] [--json]\n" +
  "  plugins catalogs remove CATALOG_ID [--yes] [--json]\n" +
  "    Requires local-admin v12; global scope, JSON formatVersion 1. Only public credential-free HTTPS Git sources or local host paths.\n" +
  "    list shows source IDs/counts; inspect shows its entries. refresh fetches metadata only. Removing a source retains installed packages and accounts.\n";
const PLUGIN_PACKAGE_HELP =
  "  plugins inspect CATALOG_ID ENTRY [--json]\n" +
  "  plugins install|update CATALOG_ID ENTRY [--review-digest SHA256 --yes] [--json]\n" +
  "  plugins remove NAME [--yes] [--json]\n" +
  "  plugins enable|disable NAME [--yes] [--json]\n" +
  "    Requires local-admin v12; global scope, JSON formatVersion 1. Inspect package files before trusting their commands/tools.\n" +
  "    A terminal prints review metadata/digest and confirms the exact entry name. Scripts/JSON require --yes and the digest from inspect for install/update.\n" +
  "    Catalog packages default to disabled; existing saved enable/component choices are retained. Enablement affects future launches, not existing sessions.\n" +
  "    Removal deletes only an unmodified catalog-owned user package and its local service-account credentials. Bundled/project/manual/edited packages refuse.\n" +
  "    Other changes require --yes for scripts/JSON. Values in MCP env/headers, command arguments and diagnostic details are omitted from results.\n";
const PLUGINS_HELP =
  "  plugins list|refresh [--json]\n" +
  "    Discover/rescan global bundled/user packages through the existing supervisor registry. Requires local-admin v4.\n" +
  "    Reports saved install/enable policy and declared OS support, not runtime capability or service-account authentication. --json has formatVersion 1.\n" +
  PLUGIN_ACCOUNTS_HELP +
  PLUGIN_CATALOG_HELP +
  PLUGIN_PACKAGE_HELP;
const MCP_CHANGE_HELP =
  "  Requires local-admin v6; JSON has formatVersion 1 and saved-user scope. Built-in/plugin servers and per-thread selection are separate.\n" +
  "  Providers apply saved configuration when they next resolve it. Running sessions, native-provider copies and OAuth credentials have separate lifecycles.\n";
const MCP_DEFINITION_HELP =
  "  Requires local-admin v7; JSON acknowledgements have formatVersion 2 and saved-user scope.\n" +
  "  Supply one full server object with an id matching SERVER_ID, a unique non-reserved name and a transport.\n" +
  '  Example: {"id":"tools","name":"tools","transport":{"type":"stdio","command":"tool-server","args":[],"env":{}}}\n' +
  "  Transports: stdio (command,args,env,cwd), http or sse (url,headers). Optional server fields: description,enabled,timeoutMs,disabledTools.\n" +
  "  Input is bounded to 65536 bytes of UTF-8 JSON. Use a private file or --config-stdin from a pipe; values are never accepted in argv or printed.\n" +
  "  Redaction markers are refused. This uses the existing MCP configuration store, separate from sealed provider profiles and MCP OAuth.\n" +
  "  Saved changes apply on provider resolution; no connection probe, OAuth login, native-provider copy or running-session reload is performed.\n";
const MCP_HELP =
  "  mcp list [--json]\n  mcp inspect SERVER_ID [--json]\n" +
  "    Inspect saved user MCP configuration metadata by exact ID. Requires local-admin v4.\n" +
  "    Commands, arguments, paths, URLs and environment/header values are omitted, including under --json (formatVersion 1). No connection probe.\n" +
  "  mcp enable|disable SERVER_ID [--json]\n  mcp remove SERVER_ID [--yes] [--json]\n" +
  "    Change saved user configuration by exact ID from mcp list. Removal asks for the exact ID; scripts/JSON require --yes.\n" +
  MCP_CHANGE_HELP +
  "  mcp add [SERVER_ID] (guided terminal setup)\n" +
  "  mcp add SERVER_ID (--config-file JSON | --config-stdin) [--json]\n" +
  "    Without an input file/pipe, choose a transport and enter hidden values, then type the exact ID to save.\n" +
  "    Guided creation requires local-admin v9: the owner checks storage and uniqueness before transport input.\n" +
  "  mcp configure SERVER_ID (--config-file JSON | --config-stdin) [--yes] [--json]\n" +
  "    Configure fully replaces known fields: omitted optional values take canonical defaults. Type the exact ID in a terminal; scripts/JSON require --yes.\n" +
  MCP_DEFINITION_HELP +
  MCP_AUTH_HELP;

const ENVIRONMENT_OPTIONS = "[--env-file JSON | --env-stdin | --prompt-env NAME ...]";
const ENVIRONMENT_HELP =
  "  All environment values use the existing sealed profile store; values are never accepted in argv.\n" +
  "  --prompt-env requires a terminal without --json; repeat it for each unique NAME.\n" +
  "  --env-stdin reads a JSON object of names to strings, limited to 65536 bytes; --env-file reads that object from a file.\n" +
  "  Values are limited to 16384 characters. Saving them does not verify an upstream account login.\n";
const TARGET_HELP =
  "  --wsl selects that exact distribution; omitting it selects native. --runtime selects an advertised runtime, without account fallback.\n";
const ADMIN_OWNER_HELP =
  "  Requires the running owner of this profile. Start it with serve or inspect doctor using the same --base-dir.\n";

const ADMIN_COMMAND_HELP: Record<string, Record<string, string>> = {
  projects: {
    list: "projects list [--limit 1..100] [--cursor CURSOR] [--json]\n  List saved project metadata, including disabled entries. Default limit: 50. Reuse nextCursor in this profile; configuration and credentials are omitted. Requires local-admin v14.\n",
    inspect:
      "projects inspect PROJECT_ID [--json]\n  Inspect one exact saved project's metadata without launching a provider. Requires local-admin v14.\n",
    add: "projects add DIRECTORY [--name NAME] [--json]\n  Register an existing directory on this host. Relative paths resolve from the CLI cwd; no files or provider processes are created.\n  An existing location retains its ID/settings; explicit --name changes its display name. Requires local-admin v14.\n",
  },
  sessions: {
    rename:
      "sessions rename THREAD_ID --title TITLE [--json]\n  Rename one exact saved session. TITLE is trimmed and must contain 1..500 characters. No runtime is started or stopped.\n  Requires local-admin v18; closed JSON formatVersion 1, persisted-profile scope.\n",
    archive:
      "sessions archive THREAD_ID [--yes] [--json]\n  Hide the saved session after supervisor-confirmed runtime retirement. A terminal requires the exact ID; scripts and --json require --yes.\n  No transcript is deleted by this command; existing archive/history retention settings still apply. Requires local-admin v18.\n",
    unarchive:
      "sessions unarchive THREAD_ID [--json]\n  Restore this session's visibility without changing done or starting/resuming a provider. Requires local-admin v18.\n",
    done: "sessions done THREAD_ID [--yes] [--json]\n  Mark this session done and clear its star after supervisor-confirmed runtime retirement. A terminal requires the exact ID; scripts and --json require --yes.\n  Existing automatic archive/history retention settings still apply. Requires local-admin v18.\n",
    reopen:
      "sessions reopen THREAD_ID [--json]\n  Clear done without changing archive visibility or starting/resuming a provider. A cleared star is not restored. Requires local-admin v18.\n",
    export:
      "sessions export THREAD_ID [--output FILE|-]\n  Export one consistent committed snapshot as poracode-session JSON, formatVersion 1. Default output is stdout.\n" +
      "  --output creates a complete new file in an existing directory after checksum verification; existing destinations are never overwritten. Ctrl+C cancels and joins the read-only worker.\n" +
      "  No provider is launched. Includes all persisted structured items/streams, turns, context, history notice and saved terminal tail; excludes attachments and provider configuration/credentials.\n" +
      "  Requires local-admin v13; one export per owner, a two-minute idle lease and ten-minute overall deadline. Transcript content can include sensitive conversation data.\n",
    list:
      "sessions list [--limit 1..100] [--cursor CURSOR] [--project PROJECT_ID] [--json]\n" +
      "  Read bounded pages from this profile's persisted thread catalog, including archived/done entries. Default limit: 50.\n" +
      "  Reuse nextCursor with the same project filter. Saved status is not live runtime state. No provider process is started.\n" +
      "  Requires local-admin v8; JSON formatVersion 1, persisted-profile scope. Configuration and credentials are omitted.\n",
    inspect:
      "sessions inspect THREAD_ID [--json]\n  Read one exact persisted thread's metadata in this profile. Saved status is not a live probe; no provider is started.\n" +
      "  Requires local-admin v8; JSON formatVersion 1, persisted-profile scope. Configuration, credentials and transcript are omitted.\n",
    stop:
      "sessions stop THREAD_ID [--yes] [--json]\n  Retire this exact persisted thread's live PTY/structured runtime using supervisor-confirmed closure. History and profile remain.\n" +
      "  A terminal requires typing the exact thread ID; scripts and --json require --yes. Unconfirmed retirement is an error.\n" +
      "  This closes the runtime, rather than only interrupting a turn. Requires local-admin v8; JSON formatVersion 1, persisted-profile scope.\n",
  },
  providers: {
    custom:
      "providers custom list [--json]\n" +
      "providers custom inspect ID [--json]\n" +
      "providers custom add ID --config-file JSON [--name NAME] [--prompt-env NAME ... | --env-stdin | --env-file JSON] [--json]\n" +
      "providers custom configure ID [--config-file JSON] [--name NAME] [--enable|--disable] [environment flags] [--json]\n" +
      "providers custom remove ID [--yes] [--json]\n" +
      '  Config example: {"binary":"agent-acp","args":["--stdio"],"cwd":"project"}. Optional capabilities.models/modes, authMode none|envVar and authEnvVar; fixed cwd requires an absolute fixedCwd on the server.\n' +
      "  Registers an existing command; no package install or task launch. Native only, with no WSL fallback. Registry installations and built-in profiles stay separate.\n" +
      "  Successful writes reconcile the affected native status through the running owner. Discovery can probe that command. If reconciliation fails, saved configuration remains; diagnostics explain how to retry.\n" +
      "  All environment values are sealed in the existing provider settings store. Keep credentials out of command arguments/config; use environment input. Empty environment values remove those entries.\n" +
      "  --prompt-env requires a terminal without --json; hidden add validates the definition before collecting values. File/stdin JSON maps environment names to strings.\n" +
      "  Inspect/list omit environment values and command arguments (argument count is shown). Configure/remove recheck the exact inspected revision; concurrent changes refuse.\n" +
      "  Removal is configuration/environment only; persisted history remains. Terminal confirmation or --yes is required; scripts/JSON require --yes. Existing runtime processes are not stopped.\n" +
      "  Requires local-admin v16; custom command/JSON format1. Old/future owners refuse. Authentication uses auth methods/login for the exact acp-generic:ID afterward.\n",
    list:
      "providers list [--refresh] [--wsl DISTRO] [--json]\n" +
      "  Read saved provider observations without starting a supervisor or probing providers. Cached installation/auth/runtime status may be stale; missing observations do not mean uninstalled.\n" +
      "  --refresh explicitly discovers current status for the selected environment. Saved profiles are current host-scoped configuration, independent of --wsl. No credential values are returned.\n" +
      "  Requires local-admin v17; JSON formatVersion 1 labels environment, observation source/cache state and configurationScope. Older owners refuse; no discovery fallback.\n",
    catalog:
      "providers catalog [--wsl DISTRO] [--json]\n" +
      "  List the shared installable agent registry. --wsl does not change this catalog; choose the installation target with providers install.\n" +
      "  Registry installations are separate from saved provider profiles.\n",
    drivers:
      "providers drivers [--json]\n  List the running owner's supported saved-profile driver IDs and optional declared credential variable names.\n" +
      "  Requires local-admin v5; JSON has formatVersion 1. This is configuration support, not installed-provider/runtime/auth status.\n" +
      "  Driver config uses providers add --config-file; enter credential values through --prompt-env or a supported file/stdin environment input.\n",
    install:
      "providers install ID [--wsl DISTRO] [--json]\n" +
      "  Install an exact ID from providers catalog in native or the selected WSL distribution. Does not create a saved profile or log in an account.\n",
    add:
      `providers add ID --driver DRIVER [--name NAME] [--config-file JSON] ${ENVIRONMENT_OPTIONS} [--json]\n` +
      "  Create a saved profile using a supported profile driver. Existing IDs refuse; this does not install a registry agent.\n" +
      "  Use providers drivers for IDs. Hidden entry checks driver config, variable names, persistence and dependencies before values (local-admin v5).\n" +
      "  This check is not a reservation; the final write rechecks the fresh snapshot. Legacy explicit scripts retain their original request.\n" +
      ENVIRONMENT_HELP,
    configure:
      `providers configure [ID] [--name NAME] [--enable|--disable] [--config-file JSON] ${ENVIRONMENT_OPTIONS} [--json]\n` +
      "  Update an existing saved profile. A terminal can choose its ID; without edit flags it asks for environment names and hidden values.\n" +
      "  Scripts and --json require an explicit ID. --enable and --disable are mutually exclusive. The driver cannot be changed here.\n" +
      "  Interactive configure requires local-admin v3. If the selected profile changes, nothing is saved; review it and restart the command.\n" +
      ENVIRONMENT_HELP,
    remove:
      "providers remove ID [--yes] [--json]\n" +
      "  Remove saved configuration/environment and its existing preference references; history remains. This is not account logout.\n" +
      "  A terminal asks you to type the exact ID. Scripts and --json require --yes. Use supported auth logout separately before removal.\n",
    "unset-env":
      "providers unset-env ID NAME [NAME ...] [--json]\n" +
      "  Remove named environment entries from this saved profile, preserving its other values and history. This is not upstream account logout.\n",
  },
  auth: {
    list:
      "auth list [--wsl DISTRO] [--json]\n" +
      "  Show the selected environment's installed-provider/auth summaries and saved profiles; use auth accounts for adapter-owned account inventory.\n",
    accounts:
      "auth accounts [PROVIDER] [--wsl DISTRO] [--json]\n" +
      "  List public adapter-owned credential IDs for the exact provider/native-or-WSL identity. A terminal can choose the provider; scripts require its ID.\n" +
      "  Runtime-specific inventories refuse. No credential values, universal account switch or rename are available.\n",
    methods:
      "auth methods [PROVIDER] [--runtime ID] [--wsl DISTRO] [--json]\n" +
      "  Inspect advertised authentication methods, environment variable names, terminal-login and logout support without starting login.\n" +
      "  A terminal can choose the provider; scripts and --json require its exact ID.\n" +
      TARGET_HELP,
    login:
      "auth login [PROVIDER] [--method ID] [--runtime ID] [--wsl DISTRO] [--json]\n" +
      "  A terminal can choose an installed provider and its advertised method, respecting the preferred terminal flow.\n" +
      "  Scripts specify the provider and method explicitly. --json formats the result; it does not make an interactive provider unattended.\n" +
      "  Environment methods need compatible saved-profile or supported server environment setup, not a separate account store.\n" +
      TARGET_HELP,
    logout:
      "auth logout [PROVIDER] [--credential ID] [--runtime ID] [--wsl DISTRO] [--json]\n" +
      "  Use the provider's supported logout, or remove an exact credential ID returned by auth accounts for the same target.\n" +
      "  Runtime logout requires advertised support and cannot be combined with a credential ID. Saved profile values and client grants are separate.\n" +
      "  A terminal can choose the provider; scripts and --json require its exact ID.\n" +
      TARGET_HELP,
  },
  clients: {
    list: "clients list [--json]\n  Show current client session IDs, labels, connection state, expiry and scopes without credentials.\n",
    revoke:
      "clients revoke SESSION_ID [--json]\n  Invalidate this exact client session's access. Use clients list for IDs; saved remote routes and other sessions remain.\n",
    remove:
      "clients remove SESSION_ID [--json]\n  Alias of clients revoke: invalidate this session's access. This does not unlink a saved remote route.\n",
  },
  pairings: {
    list: "pairings list [--json]\n  Show unexpired pending pairing IDs, labels, expiry and scopes without pairing credentials. Connected clients appear in clients list.\n",
    revoke:
      "pairings revoke PAIRING_ID [--json]\n  Invalidate a pending pairing credential by its exact inventory ID. Already connected clients require clients revoke instead.\n",
    create:
      "pairings create [--preset viewer|operator | --scope SCOPE ...] [--label TEXT] [--ttl 10m] [--qr | --json]\n" +
      "  Issue an independent grant without rotating the existing desktop QR. Default: operator, 10m. TTL: 1s..24h; label: 1..120 characters.\n" +
      "  Choose one preset OR unique explicit scopes. Scopes: session:read, session:operate, terminal:read, terminal:operate, requests:resolve, projects:manage, ports:forward.\n" +
      "  --qr writes a terminal QR to stderr; the link/grant is on stdout. --qr and --json are mutually exclusive. Treat the pairing link as a credential.\n",
  },
  plugins: {
    accounts: PLUGIN_ACCOUNTS_HELP,
    catalogs: PLUGIN_CATALOG_HELP,
    inspect: PLUGIN_PACKAGE_HELP,
    install: PLUGIN_PACKAGE_HELP,
    update: PLUGIN_PACKAGE_HELP,
    remove: PLUGIN_PACKAGE_HELP,
    enable: PLUGIN_PACKAGE_HELP,
    disable: PLUGIN_PACKAGE_HELP,
    list:
      "plugins list [--json]\n  Discover global bundled/user packages and their saved install/enable policy using the supervisor registry.\n" +
      "  Requires local-admin v4. OS compatibility is separate from runtime capability or service-account authentication.\n",
    refresh:
      "plugins refresh [--json]\n  Rescan the existing global plugin roots and return public package summaries. Requires local-admin v4.\n" +
      "  This refreshes discovery, not a catalog source or package installation. Project roots need explicit project context and are not scanned here.\n",
  },
  mcp: {
    auth: MCP_AUTH_HELP,
    add:
      "mcp add [SERVER_ID]\n  Guided terminal setup asks for ID/name and stdio, http or sse transport. Transport fields use hidden input.\n" +
      "  Requires local-admin v9 before transport input; the owner checks persistent storage and uniqueness without saving.\n" +
      "  Type the exact ID to save. Configuration uses the existing MCP store, separate from provider profiles and OAuth.\n" +
      "  mcp add SERVER_ID (--config-file JSON | --config-stdin) [--json]\n" +
      "  Scripts/JSON require the explicit ID and file/stdin input; these retain local-admin v7. An existing ID or duplicate name refuses without replacement.\n" +
      MCP_DEFINITION_HELP,
    configure:
      "mcp configure SERVER_ID (--config-file JSON | --config-stdin) [--yes] [--json]\n" +
      "  Fully replace known fields of this exact saved user definition. Omitted optional values take canonical defaults.\n" +
      "  A terminal requires typing the exact ID; scripts and --json require --yes. No input-file reread occurs during confirmation.\n" +
      "  Preparation and commit use the same owner generation. A changed target refuses; review its current definition and restart the command.\n" +
      MCP_DEFINITION_HELP,
    list:
      "mcp list [--json]\n  List saved user MCP IDs, names, configured enable state, transport and timeout. Requires local-admin v4.\n" +
      "  Plugin/built-in servers are separate. Metadata does not imply connection health or account authentication.\n",
    inspect:
      "mcp inspect SERVER_ID [--json]\n  Inspect one unique saved user MCP ID from mcp list, not its display name. Missing/duplicate IDs refuse.\n" +
      "  Requires local-admin v4. Returns variable/header names and disabled-tool names; commands, arguments, paths, URLs and credential values are omitted.\n" +
      "  This reads configuration metadata without connecting to a server or starting service authentication.\n",
    enable:
      "mcp enable SERVER_ID [--json]\n  Set one saved user MCP server's configured enabled flag, preserving its other fields. Use its exact ID from mcp list.\n" +
      MCP_CHANGE_HELP,
    disable:
      "mcp disable SERVER_ID [--json]\n  Clear one saved user MCP server's configured enabled flag, preserving its other fields. Use its exact ID from mcp list.\n" +
      MCP_CHANGE_HELP,
    remove:
      "mcp remove SERVER_ID [--yes] [--json]\n  Delete only this saved user-server configuration by exact ID from mcp list. Missing/duplicate IDs refuse.\n" +
      "  A terminal asks you to type the exact ID. Scripts and --json require --yes; other server records and selection preferences remain.\n" +
      MCP_CHANGE_HELP,
  },
};

const COMMAND_HELP: Record<string, string> = {
  run: RUN_HELP,
  tui: TUI_HELP,
  "-p": PRINT_HELP,
  "--print": PRINT_HELP,
  projects: PROJECTS_HELP,
  configure: CONFIGURE_HELP,
  providers: PROVIDERS_HELP,
  auth: AUTH_HELP,
  clients: CLIENTS_HELP,
  pairings: PAIRINGS_HELP,
  plugins: PLUGINS_HELP,
  mcp: MCP_HELP,
  sessions: SESSIONS_HELP,
  pair: PAIR_HELP,
  connect: PAIR_HELP,
  serve:
    "  serve [--open|--no-open] [--config PATH] [--host HOST] [--port PORT] [--trusted-proxies ADDRESS,CIDR,...]\n" +
    "    Start the foreground server for this profile; keep the terminal open. Ctrl+C/SIGTERM request normal drain.\n" +
    "    serve starts without a browser; use serve --open or --open to open the web app.\n" +
    "    --open explicitly requests a browser; --no-open suppresses it. Automatic opening skips SSH/headless sessions.\n" +
    "    The web client is served in both modes. Browser handoff uses an independent one-minute operator grant; its token is not logged.\n" +
    "    An existing owner is not adopted or stopped. CLI flags override environment, then saved config.\n" +
    "    Use configure for TLS, bind mode, logging and drain settings; --port 0 requests an available port, visible in status.\n",
  status:
    "  status [--details] [--json]\n    Inspect the running owner's authenticated status for this profile. It does not start, stop or upgrade it.\n    --details reads the running build and admission state from the same owner generation; unsupported owners refuse. Basic --json keeps its existing shape; detailed JSON uses formatVersion 1 and view running-owner. Reported endpoints are not remote health probes.\n",
  stop:
    "  stop [--if-pid PID]\n    Request authenticated graceful shutdown and wait for retirement. No PID is directly signalled.\n" +
    "    --if-pid refuses a different process; an unsupported older owner refuses without an unguarded retry.\n",
  doctor:
    "  doctor [--json] [--log-file PATH]\n    Read-only profile/configuration/runtime diagnostics with redacted recent errors and actionable checks.\n" +
    "    --log-file selects the recent-errors input. This command does not repair or restart the server.\n",
  logs: CLI_LOGS_HELP,
  activate:
    "  activate [--json] [--sign-in-again]\n    Explicitly complete a staged offline import for this profile.\n" +
    "    Desktop-sealed credentials need one-time desktop cooperation; --sign-in-again starts fresh without migrating those credentials.\n",
  backup:
    "  backup --to DIRECTORY [--json]\n    Capture a verified backup of the owned root. The destination must be new and must not overlap the root.\n",
  "init-tls":
    "  init-tls [--json] [--cert PATH] [--key PATH]\n    Generate self-signed TLS material; default: <profile>/tls/server.crt and server.key (private key mode 0600).\n" +
    "    Configure tlsCert/tlsKey or the corresponding environment variables explicitly. This does not start a listener.\n",
  upgrade:
    "  upgrade (--from TARBALL | --resume [--from TARBALL] | --abandon-journal --confirm) [--prefix PATH] [--json]\n" +
    "    Stage and explicitly upgrade the selected installed prefix, or recover its existing journal. Some resume states require --confirm.\n" +
    "    The candidate and running target must qualify before drain/activation. This is separate from service start/restart; an old CLI does not qualify new registrations.\n",
};

export const CLI_PROFILE_HELP = "  --base-dir PATH selects the same profile for every command.\n";
export const CLI_ADMIN_HELP =
  RUN_HELP +
  TUI_HELP +
  PRINT_HELP +
  CONFIGURE_HELP +
  PROJECTS_HELP +
  PROVIDERS_HELP +
  AUTH_HELP +
  CLIENTS_HELP +
  PAIRINGS_HELP +
  PAIR_HELP +
  PLUGINS_HELP +
  MCP_HELP +
  SESSIONS_HELP +
  CLI_PROFILE_HELP;

export function cliCommandHelp(command: string, action?: string): string | undefined {
  if (!Object.hasOwn(COMMAND_HELP, command)) return undefined;
  if (action && !action.startsWith("-") && Object.hasOwn(ADMIN_COMMAND_HELP, command)) {
    const commands = ADMIN_COMMAND_HELP[command]!;
    if (!Object.hasOwn(commands, action))
      throw new Error(`Unknown subcommand. Run poracode ${command} --help.`);
    return `Usage: poracode ${commands[action]}${ADMIN_OWNER_HELP}${CLI_PROFILE_HELP}`;
  }
  return COMMAND_HELP[command] + CLI_PROFILE_HELP;
}
