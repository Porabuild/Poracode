export const productionRoots = [
  "src/main/",
  "src/preload/",
  "src/renderer/",
  "src/shared/",
  "src/supervisor/",
  "src/server/",
  "chrome-extension/",
];

export const functionalAreas = [
  {
    id: "desktop-shell",
    title: "Electron lifecycle and renderer shell",
    patterns: [/^src\/main\//, /^src\/preload\//, /^src\/renderer\/(app|main|devBridge)\./],
    automated: ["baseline"],
    manual: [],
  },
  {
    id: "ipc-contracts",
    title: "Preload bridge and IPC contracts",
    patterns: [/^src\/(main\/ipc|preload|shared\/ipc)/, /ipcHandlers/],
    automated: ["baseline"],
    manual: ["ipc-roundtrip"],
  },
  {
    id: "projects-worktrees",
    title: "Projects, workspace selection, and worktrees",
    patterns: [/project/i, /worktree/i, /Sidebar/],
    automated: ["baseline"],
    manual: ["project-mutations"],
  },
  {
    id: "providers-models",
    title: "Provider discovery, model selection, and provider plugins",
    patterns: [/providers?\//i, /agents\/registry/i, /agentRegistry/i, /ProviderModelMenu/],
    automated: ["baseline"],
    manual: ["provider-live"],
  },
  {
    id: "threads-chat",
    title: "Thread draft, composer, chat, history, and runtime requests",
    patterns: [/thread/i, /ChatPane/, /composer/i, /runtimeEvent/i, /session/i],
    automated: ["baseline", "thread-search"],
    manual: ["provider-live", "runtime-requests"],
  },
  {
    id: "terminal-pty",
    title: "Terminal presentation and PTY lifecycle",
    patterns: [/terminal/i, /pty/i, /osc/i],
    automated: ["baseline"],
    manual: ["terminal-pty"],
  },
  {
    id: "git-review",
    title: "Git status, staging, review, conflicts, and pull requests",
    patterns: [/git/i, /PrReview/i, /mergeConflict/i],
    automated: ["baseline"],
    manual: ["git-mutations"],
  },
  {
    id: "github-actions",
    title: "GitHub Actions workflows, runs, dispatch, and PR check navigation",
    patterns: [/GitHubActions/i, /githubWorkflowDefinition/i, /contracts\/github/i],
    automated: ["baseline", "github-actions"],
    manual: ["github-actions-live", "ipc-roundtrip"],
  },
  {
    id: "file-editor",
    title: "Project tree, file editor, Monaco, and file mutations",
    patterns: [/FileEditor/i, /fileEditor/i, /projectTree/i, /FileIndex/i],
    automated: ["baseline"],
    manual: ["file-editor"],
  },
  {
    id: "browser",
    title: "In-app Browser, browser MCP, picker, bookmarks, and Chrome extension",
    patterns: [/browser/i, /chrome-extension/i, /ChromeMcp/i, /picker/i],
    automated: ["baseline", "browser"],
    manual: [],
  },
  {
    id: "schedules",
    title: "Device scheduled tasks, persistence, and remote management",
    patterns: [/schedule/i],
    automated: ["baseline", "schedules"],
    manual: ["ipc-roundtrip", "remote-client"],
  },
  {
    id: "settings",
    title: "Settings pages, persistence, profiles, and shortcuts",
    patterns: [/Settings/i, /settings/i, /shortcut/i, /ProfileOverlay/i],
    automated: ["baseline", "settings"],
    manual: [],
  },
  {
    id: "plugins-marketplace",
    title: "Plugin marketplace, installation, and bundled MCP and skill contributions",
    patterns: [
      /components\/plugins\//i,
      /shared\/(?:contracts\/plugin|plugins\/)/i,
      /PluginsSettings/i,
    ],
    automated: ["settings"],
    manual: [],
  },
  {
    id: "updates-auth-usage",
    title: "Updates, authentication, usage, notifications, and diagnostics",
    patterns: [/update/i, /auth/i, /login/i, /usage/i, /notification/i, /diagnostic/i, /sentry/i],
    automated: ["baseline", "settings"],
    manual: ["native-auth-update"],
  },
  {
    id: "remote-client",
    title: "Remote access, adaptive client, pairing, and push",
    patterns: [/^src\/renderer\/(?:browser|native|pwa)\//, /remote/i, /pairing/i, /push/i],
    automated: ["settings"],
    manual: ["remote-client"],
  },
  {
    id: "mcp-extensions",
    title: "MCP ingress, subagents, hooks, LSP, and extensions",
    patterns: [/mcp/i, /subagent/i, /hook/i, /lsp/i, /extension/i],
    automated: ["baseline"],
    manual: ["mcp-extension"],
  },
  {
    id: "agent-skills",
    title: "Agent skill discovery, management, import, and provider delivery",
    patterns: [/skills?/i, /SlashCommandChip/i, /serializeMentions/i, /promptContent/i],
    automated: ["baseline", "settings"],
    manual: ["skills-manager", "provider-skill-delivery"],
  },
  {
    id: "localization-theme-a11y",
    title: "Localization, appearance, accessibility, and common UI",
    patterns: [
      /i18n/i,
      /locales/i,
      /appearance/i,
      /theme/i,
      /components\/ui/i,
      /components\/common/i,
    ],
    automated: ["baseline", "settings"],
    manual: ["visual-a11y"],
  },
  {
    id: "quick-composer",
    title: "Global quick composer window, motion, dragging, and thread handoff",
    patterns: [/QuickComposer/i, /quickComposer/i],
    automated: ["baseline"],
    manual: ["quick-composer"],
  },
  {
    id: "shared-runtime",
    title: "Shared contracts, persistence, runtime utilities, and server infrastructure",
    patterns: [/^src\/shared\//, /^src\/supervisor\//, /^src\/server\//],
    automated: ["baseline"],
    manual: ["ipc-roundtrip"],
  },
  {
    id: "renderer-other",
    title: "Other renderer surfaces and overlays",
    patterns: [/^src\/renderer\//],
    automated: ["baseline"],
    manual: ["changed-surface"],
  },
];

export const manualGates = {
  "changed-surface": "Exercise the changed renderer surface through its real controls.",
  "file-editor": "Open, edit, save, rename, and close a fixture file.",
  "git-mutations": "Stage/unstage a fixture file and open Git Review without touching user data.",
  "github-actions-live":
    "Against an isolated GitHub fixture, list workflows and runs, dispatch a safe workflow, then verify rerun and delete controls.",
  "ipc-roundtrip":
    "Exercise one real renderer-to-main/supervisor round-trip per changed IPC family.",
  "mcp-extension":
    "Start the changed MCP/hook/extension path and verify one request-response cycle.",
  "native-auth-update": "Verify changed native login/update/notification flows on the target OS.",
  "project-mutations":
    "Create or select an isolated project/worktree and verify persistence after reload.",
  "quick-composer":
    "Invoke the global composer, drag and reopen it, exercise controls and dismissal motion, then submit and verify the new thread opens in the main window.",
  "provider-live":
    "Launch a fresh isolated thread with each changed provider and observe first output.",
  "provider-skill-delivery":
    "Launch each supported provider with an isolated managed skill and verify the provider discovers and invokes it.",
  "remote-client":
    "Pair the canonical app in an isolated browser or native shell and verify reconnect plus one read-only action; for push changes, verify background delivery and notification-tap routing.",
  "runtime-requests": "Trigger approval and structured-input requests; deny or submit safely.",
  "terminal-pty": "Launch a terminal thread, send input, resize, interrupt, and stop the real PTY.",
  "skills-manager":
    "Discover, import, disable, re-enable, and delete fixture skills through the Skills manager and its IPC bridge.",
  "visual-a11y":
    "Inspect keyboard focus, accessible names, light/dark themes, and a non-English locale.",
};

export function isProductionFile(file) {
  if (!productionRoots.some((root) => file.startsWith(root))) return false;
  if (!/\.(?:[cm]?[jt]sx?)$/.test(file)) return false;
  return !/(?:^|\/)(?:__tests__|fixtures)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}

export function areasForFile(file) {
  return functionalAreas.filter((area) => area.patterns.some((pattern) => pattern.test(file)));
}
