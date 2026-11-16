import type { ForgeActivityAction, ForgeCommandActivity } from "./types";

/**
 * Recognizes forge-changing shell commands and forge MCP tool calls so the host
 * can tell clients to re-read a pull request.
 *
 * Bitbucket and GitCafe have no supported CLI, so their only observable signal
 * is the `git push` this classifier recognizes.
 */

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const WRAPPER_WORDS = new Set(["command", "time", "sudo", "nohup", "exec"]);
const POSIX_SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish"]);
const SHELL_COMMAND_FLAG = /^-[A-Za-z]*c$/;
const POWERSHELLS = new Set(["pwsh", "powershell"]);
const PR_REFERENCE_NUMBER = /^[#!]?\d+$/;
const ESCAPABLE_OUTSIDE_QUOTES = new Set([
  " ",
  "\t",
  "'",
  '"',
  "\\",
  "&",
  "|",
  ";",
  "$",
  "`",
  "(",
  ")",
  "<",
  ">",
]);

interface HeredocSpec {
  delimiter: string;
  stripTabs: boolean;
}

function readHeredocDelimiter(
  command: string,
  start: number,
): { heredoc: HeredocSpec; endIndex: number } | null {
  let index = start;
  const stripTabs = command[index] === "-";
  if (stripTabs) index += 1;
  while (command[index] === " " || command[index] === "\t") index += 1;
  const quote = command[index];
  let delimiter = "";
  if (quote === "'" || quote === '"') {
    index += 1;
    while (index < command.length && command[index] !== quote) {
      delimiter += command[index] ?? "";
      index += 1;
    }
    if (command[index] !== quote) return null;
    index += 1;
  } else {
    while (index < command.length) {
      const char = command[index] ?? "";
      if (" \t\n\r&|;<>".includes(char)) break;
      if (char === "\\") {
        const escaped = command[index + 1];
        if (escaped !== undefined) {
          delimiter += escaped;
          index += 2;
        } else {
          index += 1;
        }
        continue;
      }
      if (char === "'" || char === '"') {
        const embeddedQuote = char;
        index += 1;
        while (index < command.length && command[index] !== embeddedQuote) {
          delimiter += command[index] ?? "";
          index += 1;
        }
        if (command[index] === embeddedQuote) index += 1;
        continue;
      }
      delimiter += char;
      index += 1;
    }
  }
  if (delimiter.length === 0) return null;
  return { heredoc: { delimiter, stripTabs }, endIndex: index - 1 };
}

/** Skip heredoc bodies after the command line ending at `newlineIndex`. */
function skipHeredocBodies(command: string, newlineIndex: number, pending: HeredocSpec[]): number {
  let cursor = newlineIndex + 1;
  while (pending.length > 0) {
    const heredoc = pending[0];
    if (heredoc === undefined) break;
    const lineEnd = command.indexOf("\n", cursor);
    const rawLine = lineEnd === -1 ? command.slice(cursor) : command.slice(cursor, lineEnd);
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const comparable = heredoc.stripTabs ? line.replace(/^\t+/, "") : line;
    if (comparable === heredoc.delimiter) {
      pending.shift();
      cursor = lineEnd === -1 ? command.length : lineEnd + 1;
      continue;
    }
    if (lineEnd === -1) {
      pending.length = 0;
      return command.length;
    }
    cursor = lineEnd + 1;
  }
  return cursor - 1;
}

/** Consume an arithmetic expansion so its operators never split the command. */
function readArithmetic(command: string, start: number): { text: string; nextIndex: number } {
  let cursor = start;
  let text = "";
  if (command[cursor] === "$") {
    text += "$";
    cursor += 1;
  }
  text += "((";
  cursor += 2;
  let depth = 0;
  while (cursor < command.length) {
    const char = command[cursor] ?? "";
    if (char === "(") {
      depth += 1;
      text += char;
      cursor += 1;
      continue;
    }
    if (char === ")") {
      if (depth === 0 && command[cursor + 1] === ")") {
        text += "))";
        cursor += 2;
        break;
      }
      if (depth > 0) depth -= 1;
      text += char;
      cursor += 1;
      continue;
    }
    text += char;
    cursor += 1;
  }
  return { text, nextIndex: cursor };
}

/** Split a command into statements, then each statement into unquoted words. */
function tokenize(command: string): string[][] {
  const statements: string[][] = [];
  const pendingHeredocs: HeredocSpec[] = [];
  let words: string[] = [];
  let word = "";
  let started = false;
  let quote: "'" | '"' | null = null;

  const flushWord = () => {
    if (started) {
      words.push(word);
      word = "";
      started = false;
    }
  };
  const flushStatement = () => {
    flushWord();
    if (words.length > 0) statements.push(words);
    words = [];
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? "";
    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
      continue;
    }
    if (quote === '"') {
      if (char === "\\") {
        const escape = command[index + 1];
        if (escape === '"' || escape === "\\") {
          word += escape;
          index += 1;
        } else {
          word += char;
        }
      } else if (char === '"') {
        quote = null;
      } else {
        word += char;
      }
      continue;
    }
    if (
      (char === "$" && command[index + 1] === "(" && command[index + 2] === "(") ||
      (char === "(" && command[index + 1] === "(" && !started)
    ) {
      const arithmetic = readArithmetic(command, index);
      word += arithmetic.text;
      started = true;
      index = arithmetic.nextIndex - 1;
      continue;
    }
    if (char === "#" && !started) {
      const newline = command.indexOf("\n", index);
      if (newline === -1) {
        index = command.length;
        break;
      }
      index = newline - 1;
      continue;
    }
    if (char === "<" && command[index + 1] === "<") {
      if (command[index + 2] === "<") {
        word += "<<<";
        started = true;
        index += 2;
        continue;
      }
      const heredoc = readHeredocDelimiter(command, index + 2);
      if (heredoc !== null) {
        pendingHeredocs.push(heredoc.heredoc);
        index = heredoc.endIndex;
        continue;
      }
    }
    switch (char) {
      case "\\": {
        const escape = command[index + 1];
        if (escape === "\n") {
          index += 1;
          break;
        }
        if (escape === "\r" && command[index + 2] === "\n") {
          index += 2;
          break;
        }
        if (escape !== undefined && ESCAPABLE_OUTSIDE_QUOTES.has(escape)) {
          word += escape;
          started = true;
          index += 1;
          break;
        }
        word += char;
        started = true;
        break;
      }
      case "'":
        quote = "'";
        started = true;
        break;
      case '"':
        quote = '"';
        started = true;
        break;
      case "&":
      case "|":
        flushStatement();
        if (command[index + 1] === char) index += 1;
        break;
      case ";":
        flushStatement();
        break;
      case "\n":
        flushStatement();
        index = skipHeredocBodies(command, index, pendingHeredocs);
        break;
      case "\r":
        flushStatement();
        if (command[index + 1] === "\n") {
          index = skipHeredocBodies(command, index + 1, pendingHeredocs);
        }
        break;
      case " ":
      case "\t":
        flushWord();
        break;
      default:
        word += char;
        started = true;
    }
  }
  flushStatement();
  return statements;
}

/** Drop env assignments and wrapper commands in front of the real executable. */
function stripCommandPrefix(words: readonly string[]): string[] {
  let index = 0;
  for (;;) {
    const word = words[index];
    if (word === undefined) break;
    if (ENV_ASSIGNMENT.test(word)) {
      index += 1;
      continue;
    }
    if (word === "env") {
      index += 1;
      for (;;) {
        const next = words[index];
        if (next === undefined) break;
        if (ENV_ASSIGNMENT.test(next) || next.startsWith("-")) {
          index += 1;
          continue;
        }
        break;
      }
      continue;
    }
    if (WRAPPER_WORDS.has(word)) {
      index += 1;
      continue;
    }
    break;
  }
  return words.slice(index);
}

function executableBasename(word: string): string {
  const base = word.split(/[\\/]/).at(-1) ?? "";
  return base.toLowerCase().replace(/\.(?:exe|cmd|bat)$/, "");
}

function activity(action: ForgeActivityAction, branch?: string): ForgeCommandActivity {
  return {
    action,
    ...(branch === undefined || branch.length === 0 ? {} : { branch }),
  };
}

function hasAbortFlag(args: readonly string[]): boolean {
  return args.some((arg) => arg === "--help" || arg === "-h" || arg === "--dry-run");
}

/** Head values may be `<owner>:<branch>`; keep only the branch part. */
function stripOwnerPrefix(branch: string | undefined): string | undefined {
  if (branch === undefined) return undefined;
  const separator = branch.lastIndexOf(":");
  return separator === -1 ? branch : branch.slice(separator + 1);
}

/** A bare positional is a PR reference (number or URL), never a branch. */
function isPrReference(word: string): boolean {
  return PR_REFERENCE_NUMBER.test(word) || word.includes("://");
}

interface ScannedArgs {
  positionals: string[];
  values: Map<string, string>;
}

/** Collect positionals while skipping flags and the values of value-taking flags. */
function scanArgs(args: readonly string[], valueFlags: ReadonlySet<string>): ScannedArgs {
  const positionals: string[] = [];
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    if (word === undefined) continue;
    if (word.startsWith("--")) {
      const equals = word.indexOf("=");
      if (equals > 2) {
        values.set(word.slice(0, equals), word.slice(equals + 1));
        continue;
      }
    }
    if (valueFlags.has(word)) {
      const value = args[index + 1];
      if (value !== undefined) {
        values.set(word, value);
        index += 1;
      }
      continue;
    }
    if (word.startsWith("-")) continue;
    positionals.push(word);
  }
  return { positionals, values };
}

function flagValue(
  values: ReadonlyMap<string, string>,
  ...names: readonly string[]
): string | undefined {
  for (const name of names) {
    const value = values.get(name);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Read a flag value straight from words, accepting `--flag value` and `--flag=value`. */
function findFlagValue(args: readonly string[], ...names: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    if (word === undefined) continue;
    for (const name of names) {
      if (word === name) return args[index + 1];
      if (word.startsWith(`${name}=`)) return word.slice(name.length + 1);
    }
  }
  return undefined;
}

/** Strip gh/glab's global `-R`/`--repo` forms anywhere in the arguments. */
function stripRepoFlag(args: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    if (word === undefined) continue;
    if (word === "-R" || word === "--repo") {
      index += 1;
      continue;
    }
    if (word.startsWith("--repo=")) continue;
    result.push(word);
  }
  return result;
}

function classifyWrapper(
  executable: string,
  args: readonly string[],
): ForgeCommandActivity[] | null {
  if (POSIX_SHELLS.has(executable)) {
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg !== undefined && SHELL_COMMAND_FLAG.test(arg)) {
        const script = args[index + 1];
        return script === undefined ? [] : classifyForgeCommand(script);
      }
    }
    return [];
  }
  if (POWERSHELLS.has(executable)) {
    for (let index = 0; index < args.length; index += 1) {
      const flag = args[index]?.toLowerCase();
      if (flag === "-c" || flag === "-command") {
        const script = args[index + 1];
        return script === undefined ? [] : classifyForgeCommand(script);
      }
    }
    return [];
  }
  if (executable === "cmd") {
    for (let index = 0; index < args.length; index += 1) {
      const flag = args[index]?.toLowerCase();
      if (flag === "/c" || flag === "/k") {
        return classifyForgeCommand(args.slice(index + 1).join(" "));
      }
    }
    return [];
  }
  return null;
}

const GIT_GLOBAL_VALUE_FLAGS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);
const GIT_GLOBAL_FLAGS = new Set(["--no-pager", "-P", "--bare", "--no-replace-objects"]);

function classifyGit(args: readonly string[]): ForgeCommandActivity[] {
  let index = 0;
  for (;;) {
    const word = args[index];
    if (word === undefined) break;
    if (GIT_GLOBAL_VALUE_FLAGS.has(word)) {
      index += 2;
      continue;
    }
    if (GIT_GLOBAL_FLAGS.has(word) || (word.startsWith("--") && word.includes("="))) {
      index += 1;
      continue;
    }
    break;
  }
  if (args[index] !== "push") return [];
  if (args.slice(index + 1).includes("-n")) return [];
  return [activity("push")];
}

const GH_VALUE_FLAGS = new Set([
  "-t",
  "--title",
  "-b",
  "--body",
  "-F",
  "--body-file",
  "-B",
  "--base",
  "-H",
  "--head",
  "-a",
  "--assignee",
  "-l",
  "--label",
  "-m",
  "--milestone",
  "-p",
  "--project",
  "-r",
  "--reviewer",
  "-T",
  "--template",
  "--subject",
  "--match-head-commit",
  "-A",
  "--author-email",
  "--add-label",
  "--remove-label",
  "--add-reviewer",
  "--remove-reviewer",
  "--add-assignee",
  "--remove-assignee",
  "--add-project",
  "--remove-project",
]);
function ghAction(subcommand: string, args: readonly string[]): ForgeActivityAction | null {
  switch (subcommand) {
    case "create":
      return "create";
    case "merge":
      if (args.includes("--auto")) return "auto-merge";
      if (args.includes("--disable-auto")) return "update";
      return "merge";
    case "close":
      return "close";
    case "reopen":
      return "reopen";
    case "ready":
      return args.includes("--undo") ? "draft" : "ready";
    case "edit":
      return "update";
    case "review":
      return "review";
    case "comment":
      return "comment";
    case "update-branch":
    case "lock":
    case "unlock":
      return "update";
    default:
      return null;
  }
}

function classifyGh(rawArgs: readonly string[]): ForgeCommandActivity[] {
  const args = stripRepoFlag(rawArgs);
  if (args[0] !== "pr") return [];
  const subcommand = args[1];
  if (subcommand === undefined) return [];
  const rest = args.slice(2);
  const action = ghAction(subcommand, rest);
  if (action === null) return [];
  const { positionals, values } = scanArgs(rest, GH_VALUE_FLAGS);
  const branch =
    action === "create"
      ? stripOwnerPrefix(flagValue(values, "--head", "-H"))
      : positionals.find((word) => !isPrReference(word));
  return [activity(action, branch)];
}

const GLAB_VALUE_FLAGS = new Set([
  "-t",
  "--title",
  "-d",
  "--description",
  "-s",
  "--source-branch",
  "-b",
  "--target-branch",
  "-a",
  "--assignee",
  "-l",
  "--label",
  "-m",
  "--milestone",
  "--reviewer",
  "--squash-message",
  "--message",
  "--unlabel",
]);
function glabAction(subcommand: string, args: readonly string[]): ForgeActivityAction | null {
  switch (subcommand) {
    case "create":
    case "new":
      return "create";
    case "merge":
    case "accept":
      return "merge";
    case "close":
      return "close";
    case "reopen":
      return "reopen";
    case "update":
      if (args.includes("--draft")) return "draft";
      if (args.includes("--ready")) return "ready";
      return "update";
    case "approve":
    case "revoke":
    case "unapprove":
      return "review";
    case "note":
    case "comment":
      return "comment";
    case "rebase":
      return "update";
    default:
      return null;
  }
}

function classifyGlab(rawArgs: readonly string[]): ForgeCommandActivity[] {
  const args = stripRepoFlag(rawArgs);
  if (args[0] !== "mr") return [];
  const subcommand = args[1];
  if (subcommand === undefined) return [];
  const rest = args.slice(2);
  const action = glabAction(subcommand, rest);
  if (action === null) return [];
  const { positionals, values } = scanArgs(rest, GLAB_VALUE_FLAGS);
  const branch =
    action === "create"
      ? flagValue(values, "-s", "--source-branch")
      : positionals.find((word) => !isPrReference(word));
  return [activity(action, branch)];
}

const TEA_VALUE_FLAGS = new Set([
  "--repo",
  "-r",
  "--login",
  "-l",
  "--remote",
  "-R",
  "--title",
  "-t",
  "--description",
  "-d",
  "--head",
  "--base",
  "-b",
  "--assignees",
  "-a",
  "--labels",
  "-L",
  "--milestone",
  "-m",
  "--style",
  "-s",
  "--message",
  "-T",
]);
const TEA_PULL_COMMANDS = new Set(["pulls", "pull", "pr"]);

function teaAction(subcommand: string): ForgeActivityAction | null {
  switch (subcommand) {
    case "create":
    case "c":
      return "create";
    case "merge":
    case "m":
      return "merge";
    case "close":
      return "close";
    case "reopen":
    case "open":
      return "reopen";
    case "edit":
    case "e":
      return "update";
    case "approve":
    case "lgtm":
    case "a":
    case "reject":
    case "review":
      return "review";
    default:
      return null;
  }
}

function classifyTea(args: readonly string[]): ForgeCommandActivity[] {
  const pullCommand = args[0];
  if (pullCommand === undefined || !TEA_PULL_COMMANDS.has(pullCommand)) return [];
  const subcommand = args[1];
  if (subcommand === undefined) return [];
  const action = teaAction(subcommand);
  if (action === null) return [];
  const rest = args.slice(2);
  const { values } = scanArgs(rest, TEA_VALUE_FLAGS);
  const branch = action === "create" ? flagValue(values, "--head") : undefined;
  return [activity(action, branch)];
}

const FJ_ACTIONS: Readonly<Record<string, ForgeActivityAction>> = {
  create: "create",
  merge: "merge",
  close: "close",
  edit: "update",
  comment: "comment",
};

function classifyFj(args: readonly string[]): ForgeCommandActivity[] {
  if (args[0] !== "pr") return [];
  const subcommand = args[1];
  if (subcommand === undefined) return [];
  const action = FJ_ACTIONS[subcommand];
  return action === undefined ? [] : [activity(action)];
}

const BERG_ACTIONS: Readonly<Record<string, ForgeActivityAction>> = {
  create: "create",
  edit: "update",
  comment: "comment",
};
const BERG_PULL_COMMANDS = new Set(["pull", "pulls"]);

function classifyBerg(args: readonly string[]): ForgeCommandActivity[] {
  const pullCommand = args[0];
  if (pullCommand === undefined || !BERG_PULL_COMMANDS.has(pullCommand)) return [];
  const subcommand = args[1];
  if (subcommand === undefined) return [];
  const action = BERG_ACTIONS[subcommand];
  return action === undefined ? [] : [activity(action)];
}

function classifyAz(args: readonly string[]): ForgeCommandActivity[] {
  if (args[0] !== "repos" || args[1] !== "pr") return [];
  const subcommand = args[2];
  if (subcommand === undefined) return [];
  const rest = args.slice(3);
  switch (subcommand) {
    case "create": {
      const branch = findFlagValue(rest, "-s", "--source-branch");
      return [activity("create", branch)];
    }
    case "update": {
      const status = findFlagValue(rest, "--status");
      let action: ForgeActivityAction = "update";
      if (status === "completed") action = "merge";
      else if (status === "abandoned") action = "close";
      else if (status === "active") action = "reopen";
      else if (findFlagValue(rest, "--draft") === "true") action = "draft";
      else if (findFlagValue(rest, "--draft") === "false") action = "ready";
      else if (findFlagValue(rest, "--auto-complete") === "true") action = "auto-merge";
      return [activity(action)];
    }
    case "set-vote":
      return [activity("review")];
    case "reviewer":
    case "work-item": {
      const nested = rest[0];
      if (nested !== "add" && nested !== "remove") return [];
      return [activity("update")];
    }
    default:
      return [];
  }
}

function classifyStatement(words: readonly string[]): ForgeCommandActivity[] {
  const effective = stripCommandPrefix(words);
  const executableWord = effective[0];
  if (executableWord === undefined) return [];
  const executable = executableBasename(executableWord);
  const args = effective.slice(1);

  const wrapped = classifyWrapper(executable, args);
  if (wrapped !== null) return wrapped;

  if (hasAbortFlag(args)) return [];

  switch (executable) {
    case "git":
      return classifyGit(args);
    case "gh":
      return classifyGh(args);
    case "glab":
      return classifyGlab(args);
    case "tea":
      return classifyTea(args);
    case "fj":
      return classifyFj(args);
    case "berg":
      return classifyBerg(args);
    case "az":
      return classifyAz(args);
    default:
      return [];
  }
}

/** Classify every forge-changing operation in an agent's shell command. */
export function classifyForgeCommand(command: string): ForgeCommandActivity[] {
  const activities: ForgeCommandActivity[] = [];
  for (const statement of tokenize(command)) {
    activities.push(...classifyStatement(statement));
  }
  return activities;
}

const TOOL_ACTIONS: Readonly<Record<string, ForgeActivityAction>> = {
  create_pull_request: "create",
  create_merge_request: "create",
  merge_pull_request: "merge",
  merge_merge_request: "merge",
  accept_merge_request: "merge",
  update_pull_request: "update",
  update_merge_request: "update",
  update_pull_request_branch: "update",
  create_pull_request_review: "review",
  submit_pending_pull_request_review: "review",
  pull_request_review_write: "review",
  approve_merge_request: "review",
};

const TOOL_BRANCH_KEYS = ["head", "source_branch", "sourceBranch"] as const;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolBranch(args: Record<string, unknown>): string | undefined {
  for (const key of TOOL_BRANCH_KEYS) {
    const value = args[key];
    if (typeof value !== "string" || value.length === 0) continue;
    return stripOwnerPrefix(value);
  }
  return undefined;
}

/** Classify a forge MCP tool call by its tool name and arguments. */
export function classifyForgeToolCall(name: string, args?: unknown): ForgeCommandActivity | null {
  const segment =
    name
      .toLowerCase()
      .split(/__|[./:]/)
      .pop() ?? "";
  const action = TOOL_ACTIONS[segment];
  if (action === undefined) return null;
  const branch = action === "create" && isPlainObject(args) ? toolBranch(args) : undefined;
  return activity(action, branch);
}
