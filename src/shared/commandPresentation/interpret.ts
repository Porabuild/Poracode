import type { CommandIntent, CommandTitleLabel } from "./model";
import {
  basenameFromPath,
  finalizeTitle,
  readCachedExtractedCommand,
  extractShellCommand,
  scopeDisplayPath,
} from "./shellCommand";
import { parsePowerShellGetContentView } from "./powerShellViewScript";
import {
  parseFindSearch,
  parseHeadFileView,
  parseListDirectory,
  parsePipedFileView,
  parseSedView,
} from "./fileViews";
import { parseGrepLikeFileView, parseGrepLikeSearch } from "./grep";
import { splitShellWords } from "./shellSyntax";

const CHECK_SCRIPTS = new Set([
  "lint",
  "typecheck",
  "typecheck:compat",
  "test",
  "fmt",
  "format",
  "fmt:check",
]);

function labelled(
  label: CommandTitleLabel,
  text: string | undefined,
  kind: CommandIntent["kind"],
): CommandIntent {
  return { kind, title: { kind: "label", label, ...(text === undefined ? {} : { text }) } };
}

function view(text: string, path?: string, lines?: string, filePath?: boolean): CommandIntent {
  return {
    kind: "view",
    title: { kind: "view", text, ...(lines === undefined ? {} : { lines }) },
    ...(path === undefined
      ? {}
      : { path: { path, ...(filePath === undefined ? {} : { filePath }) } }),
  };
}

/** Interprets shell text as data; this module has no renderer or locale state. */
export function deriveCommandIntent(
  fullCommandLine: string,
  options?: { retainInput?: boolean },
): CommandIntent {
  // Request-scoped readers need not retain source text in the client cache.
  const command =
    options?.retainInput === false
      ? extractShellCommand(fullCommandLine)
      : readCachedExtractedCommand(fullCommandLine);
  return interpret(command) ?? labelled("run", finalizeTitle(command), "command");
}

function interpret(trimmed: string): CommandIntent | null {
  const ps = parsePowerShellGetContentView(trimmed);
  if (ps) {
    if (ps.aggregateLabel) return view(ps.aggregateLabel);
    return view(
      ps.lines ? ps.path : basenameFromPath(ps.path),
      ps.path,
      ps.lines,
      !ps.path.includes("$"),
    );
  }

  const type = /^type\s+(.+)$/i.exec(trimmed);
  if (type) {
    const path = type[1]!.trim().replace(/^['"]|['"]$/g, "");
    return view(basenameFromPath(path), path, undefined, true);
  }
  const file = parseSedView(trimmed) ?? parsePipedFileView(trimmed) ?? parseHeadFileView(trimmed);
  if (file) return view(file.path, file.path, file.lines);

  const grepView = parseGrepLikeFileView(trimmed);
  if (grepView)
    return view(
      grepView.lines ? grepView.path : basenameFromPath(grepView.path),
      grepView.path,
      grepView.lines,
      true,
    );

  const grep = parseGrepLikeSearch(trimmed);
  if (grep) {
    const rawScope =
      grep.scopes.length === 1 && grep.scopes[0] !== "." ? grep.scopes[0] : undefined;
    return {
      kind: "search",
      title: {
        kind: "search",
        query: grep.patterns[0]!,
        ...(rawScope ? { scope: scopeDisplayPath(rawScope) } : {}),
        ...(grep.patterns.length > 1 ? { additionalPatterns: grep.patterns.length - 1 } : {}),
      },
    };
  }
  const find = parseFindSearch(trimmed);
  if (find)
    return find.pattern
      ? { kind: "search", title: { kind: "search", query: find.pattern } }
      : labelled("search", find.scope, "search");

  const directory = parseListDirectory(trimmed);
  if (directory) return labelled("list", directory, "list");

  const run = /^(pnpm|npm|yarn)\s+run\s+(\S+)/i.exec(trimmed);
  if (run) {
    const pm = run[1]!.toLowerCase(),
      script = run[2]!.replace(/['",]/g, "");
    return CHECK_SCRIPTS.has(script)
      ? labelled("check", `${pm} run ${script}`, "check")
      : labelled("run", `${pm} run ${script}`, "command");
  }
  const packageManager = parsePackageManager(trimmed);
  if (packageManager) return packageManager;

  const exec = /^(pnpm|npm)\s+exec\s+(.+)$/i.exec(trimmed);
  if (exec) {
    const rest = exec[2]!.trim();
    return /^oxfmt\b/i.test(rest)
      ? labelled("format-files", undefined, "command")
      : labelled("run", rest.length > 72 ? `${rest.slice(0, 71)}…` : rest, "command");
  }
  if (/^git\s+/i.test(trimmed))
    return labelled("git", trimmed.length > 72 ? `${trimmed.slice(0, 71)}…` : trimmed, "git");
  return null;
}

function parsePackageManager(command: string): CommandIntent | null {
  const words = splitShellWords(command),
    pm = words[0]?.toLowerCase();
  if (pm !== "pnpm" && pm !== "npm" && pm !== "yarn") return null;
  const firstArg = words[1]?.toLowerCase();
  if (firstArg === "--version" || firstArg === "-v")
    return labelled("package-manager", `${pm} ${firstArg}`, "package");
  const sub = words.find((word, index) => index > 0 && !word.startsWith("-"))?.toLowerCase();
  if (!sub) return null;
  if (sub === "install" || sub === "add")
    return labelled("install-packages", `${pm} ${sub}`, "install");
  if (sub === "list" || sub === "ls") return labelled("list-packages", `${pm} ${sub}`, "list");
  if (sub === "config") {
    const action = words.find((word, index) => index > 1 && !word.startsWith("-")) ?? "";
    return labelled("package-config", action ? `${pm} config ${action}` : pm, "package");
  }
  return sub === "version" ? labelled("package-manager", `${pm} ${sub}`, "package") : null;
}
