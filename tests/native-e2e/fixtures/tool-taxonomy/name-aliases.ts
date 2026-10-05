import type { TaxonomyCase } from "./types";
import { toolCase } from "./builders";
import { EDIT_PATH, PATCH_TEXT } from "./core";

// Regexes describe open-ended values. These finite representatives cover every
// statically declared alternative, plus guard cases at its recognition boundary.
export const VERB_PREFIX_ROWS = [
  ["Viewing", "viewed", "Eye"],
  ["Reading", "viewed", "Eye"],
  ["Read ", "viewed", "Eye"],
  ["Finding files", "searched", "FolderSearch"],
  ["Finding", "searched", "Wrench"],
  ["Listing", "searched", "FolderSearch"],
  ["Searching for", "searched", "SearchCode"],
  ["Searching", "searched", "SearchCode"],
  ["Grep", "searched", "SearchCode"],
  ["Downloading", "other", "Download"],
  ["Download ", "other", "Download"],
  ["Web search", "other", "Globe"],
  ["Searching the web", "searched", "SearchCode"],
  ["Fetch", "searched", "Globe"],
  ["Editing", "edited", "Pencil"],
  ["Writing", "edited", "Pencil"],
  ["Patching", "edited", "Pencil"],
  ["Creating", "edited", "FilePlus"],
  ["Adding file", "other", "FilePlus"],
  ["Deleting", "edited", "Trash2"],
  ["Removing", "edited", "Trash2"],
  ["Running", "executed", "Terminal"],
  ["Executing", "executed", "Terminal"],
  ["Shell", "executed", "Terminal"],
  ["Unknown", "other", "Wrench"],
] as const;
export const COMPACTION_NAMES = [
  "contextCompaction",
  "compactContext",
  "conversationCompaction",
  "compactConversation",
] as const;
export const QUESTION_NAMES = [
  "AskUserQuestion",
  "ask_user_question",
  "Ask user 1 question",
  "Ask user 2 questions",
  "AskUser",
  "ask_user",
  " ask User Question: choose ",
] as const;
export const SPAWN_ALIASES = [
  ["mcp__crossagents__spawn_agent", ""],
  ["mcp__crossagents__run_agent", ""],
  ["crossagents-mcp-server-spawn_agent", ""],
  ["crossagents-mcp-server-run_agent", ""],
  ["crossagents__spawn_agent", ""],
  ["crossagents__run_agent", ""],
  ["crossagents_spawn_agent", ""],
  ["crossagents_run_agent", ""],
  ["spawn_agent", "crossagents"],
  ["run_agent", "crossagents"],
] as const;
export const CROSSAGENT_CATALOG_NAMES = [
  "list_agents",
  "get_agent",
  "spawn_agent",
  "run_workflow",
  "list_routing_preferences",
  "set_routing_preference",
  "remove_routing_preference",
  "wait_for_agent",
  "get_status",
  "list_runs",
  "steer_agent",
  "cancel",
  "spawn_agents",
  "wait_for_agents",
  "run_agent",
] as const;

export const NAME_ALIAS_CASES: readonly TaxonomyCase[] = [
  ...VERB_PREFIX_ROWS.map(([verb, category, icon], index) =>
    toolCase(`verb:${index}`, { name: `${verb.trimEnd()} fixture`, status: "success" }, category, {
      title: `${verb.trimEnd()} fixture`,
      icon,
    }),
  ),
  ...["mcp__fixture_server__lookup", "fixture_server-mcp-server-lookup", "lookup"].map((name, i) =>
    toolCase(
      `mcp-spelling:${i}`,
      {
        name,
        ...(i === 2 ? { serverId: "fixture_server" } : {}),
        kind: "read",
        isSubAgent: true,
        isCrossagent: true,
        status: "success",
      },
      "mcp",
      { title: "fixture server: lookup", icon: "Plug", subagent: false, crossagent: false },
    ),
  ),
  ...["claude_ai_fixture_server", "plugin_vendor_fixture_server"].map((server, i) =>
    toolCase(`mcp-pretty:${i}`, { name: `mcp__${server}__lookup`, status: "success" }, "mcp", {
      title: "fixture server: lookup",
      icon: "Plug",
    }),
  ),
  ...SPAWN_ALIASES.flatMap(([name, serverId], index) =>
    (["running", "success", "error"] as const).map((status) =>
      toolCase(
        `spawn:${index}:${status}`,
        { name, ...(serverId ? { serverId } : {}), status },
        name.includes("mcp") || serverId ? "mcp" : "other",
        { visible: status === "error", spawnTransport: true },
      ),
    ),
  ),
  ...CROSSAGENT_CATALOG_NAMES.filter((name) => name !== "spawn_agent" && name !== "run_agent").map(
    (name) =>
      toolCase(`catalog:${name}`, { name: `mcp__crossagents__${name}`, status: "success" }, "mcp", {
        title: `crossagents: ${name}`,
        icon: "Plug",
        workflow: false,
        spawnTransport: false,
      }),
  ),
  ...QUESTION_NAMES.map((name, i) =>
    toolCase(`question-name:${i}`, { name, status: "success" }, "other", {
      visible: false,
      questionName: true,
    }),
  ),
  toolCase(
    "question-title",
    { name: "FixtureQuestion", title: "Ask user 2 questions", status: "running" },
    "other",
    { visible: false, questionName: false },
  ),
  ...["subagent_type", "agent_type", "agentType"].map((key) =>
    toolCase(
      `delegate-arg:${key}`,
      { name: "FixtureChild", args: { [key]: "fixture-worker" }, status: "running" },
      "executed",
      { subagent: true, crossagent: false, groupEligible: false },
    ),
  ),
  ...["", 0, null, ["fixture-worker"]].map((value, i) =>
    toolCase(
      `delegate-arg-negative:${i}`,
      { name: "FixtureChild", args: { agentType: value }, status: "success" },
      "other",
      { subagent: false },
    ),
  ),
  ...COMPACTION_NAMES.flatMap((name) =>
    [
      name,
      name.replace(/([A-Z])/g, "_$1").toUpperCase(),
      name.replace(/([A-Z])/g, "-$1"),
      name.replace(/([A-Z])/g, " $1"),
    ].map((spelling, i) =>
      toolCase(
        `compaction:${name}:${i}`,
        {
          name: spelling,
          status: "success",
          args: { trigger: "manual", pre_tokens: 120000, post_tokens: 30000, duration_ms: 2000 },
        },
        "other",
        { compaction: true, groupEligible: false },
      ),
    ),
  ),
  toolCase(
    "plan-alias:snake",
    { name: "exit_plan_mode", status: "success", args: { plan_filename: "tmp/fixture-plan.md" } },
    "other",
    { planProposal: true, groupEligible: false },
  ),
  ...["apply-patch", "APPLYPATCH"].map((name) =>
    toolCase(
      `patch-title:${name}`,
      { name, status: "success", args: { patchText: PATCH_TEXT } },
      "other",
      { title: `Edit: ${EDIT_PATH}`, icon: "Pencil" },
    ),
  ),
  ...["Skill", "Loaded skill fixture-skill", "Using skill fixture-skill"].map((name, i) =>
    toolCase(
      `skill-name:${i}`,
      { name, args: { name: "fixture-skill" }, status: "success" },
      "other",
      { skill: true, title: "Skill: fixture-skill", icon: "Sparkles" },
    ),
  ),
  toolCase(
    "skill-args",
    { name: "FixtureLoader", args: { skill: "fixture-skill" }, status: "success" },
    "other",
    { skill: true, title: "Skill: fixture-skill", icon: "Sparkles" },
  ),
  ...["args", "title", "name"].map((field) =>
    toolCase(
      `skill-path:${field}`,
      {
        name: field === "name" ? "Reading .agents/skills/fixture-skill/SKILL.md" : "FixtureLoader",
        ...(field === "args"
          ? { args: { path: ".agents/skills/fixture-skill/SKILL.md" } }
          : field === "title"
            ? { title: "View: .agents/skills/fixture-skill/SKILL.md" }
            : {}),
        status: "success",
      },
      field === "name" ? "viewed" : "other",
      { skill: true, title: "Skill: fixture-skill", icon: "Sparkles" },
    ),
  ),
  toolCase("guard:question", { name: "AskUserQuestionnaire", status: "success" }, "other", {
    questionName: false,
  }),
  toolCase(
    "guard:spawn-server",
    { name: "mcp__unrelated__spawn_agent", status: "success" },
    "mcp",
    { spawnTransport: false },
  ),
  toolCase("guard:workflow-case", { name: "workflow", status: "success" }, "other", {
    workflow: false,
    subagent: false,
  }),
  toolCase("guard:compaction", { name: "compaction", status: "success" }, "other", {
    compaction: false,
  }),
  toolCase("guard:plan-case", { name: "exitplanmode", status: "success" }, "other", {
    planProposal: false,
  }),
  toolCase(
    "guard:skill-path",
    { name: "Read", args: { file_path: "docs/SKILL.md" }, status: "success" },
    "viewed",
    { skill: false },
  ),
];

export const SUMMARY_CASES = (
  [
    ["viewed", "view", "views", "Eye"],
    ["searched", "search", "searches", "SearchCode"],
    ["edited", "edit", "edits", "Pencil"],
    ["executed", "command", "commands", "Terminal"],
    ["mcp", "MCP", "MCPs", "Wrench"],
    ["other", "tool", "tools", "Wrench"],
    ["thought", "thought", "thoughts", "Wrench"],
  ] as const
).flatMap(([category, singular, plural, icon]) =>
  [singular, plural].map((label, i) =>
    toolCase(`summary:${label}`, { name: `${i + 1} ${label}`, status: "success" }, category, {
      title: `${i + 1} ${label}`,
      icon,
    }),
  ),
);
