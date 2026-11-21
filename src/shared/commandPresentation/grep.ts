import { splitShellPipeline, splitShellWords } from "./shellSyntax";
import {
  parseSelectObjectLineWindow,
  splitPowerShellPipeline,
  splitPowerShellWords,
  type PowerShellFileView,
} from "./powerShellViewScript";

export interface GrepLikeSearch {
  patterns: string[];
  scopes: string[];
}

const GREP_LIKE_EXECUTABLES = new Set([
  "rg",
  "ripgrep",
  "grep",
  "egrep",
  "fgrep",
  "ggrep",
  "rgrep",
]);

const RIPGREP_EXECUTABLES = new Set(["rg", "ripgrep"]);

const RIPGREP_VALUE_OPTIONS = new Set([
  "-A",
  "-B",
  "-C",
  "-m",
  "-j",
  "-M",
  "-t",
  "-T",
  "-g",
  "-E",
  "-d",
  "-r",
  "--context",
  "--after-context",
  "--before-context",
  "--max-count",
  "--threads",
  "--max-columns",
  "--type",
  "--type-not",
  "--glob",
  "--iglob",
  "--encoding",
  "--max-depth",
  "--max-filesize",
  "--sort",
  "--sortr",
  "--color",
  "--colors",
  "--context-separator",
  "--field-match-separator",
  "--path-separator",
  "--replace",
  "--pre",
  "--pre-glob",
  "--type-add",
  "--ignore-file",
  "--engine",
]);

const GREP_VALUE_OPTIONS = new Set([
  "-A",
  "-B",
  "-C",
  "-m",
  "-d",
  "-D",
  "--context",
  "--after-context",
  "--before-context",
  "--max-count",
  "--include",
  "--exclude",
  "--exclude-dir",
  "--label",
  "--directories",
  "--devices",
  "--color",
]);

function grepLikeOptionConsumesValue(word: string, executable: string): boolean {
  if (word.startsWith("--") && word.includes("=")) return false;
  const options = RIPGREP_EXECUTABLES.has(executable) ? RIPGREP_VALUE_OPTIONS : GREP_VALUE_OPTIONS;
  return options.has(word);
}

export function parseGrepLikeFileView(command: string): PowerShellFileView | null {
  const parts = splitPowerShellPipeline(command);
  const words = splitPowerShellWords(parts[0] ?? command);
  const executable = words[0]?.split(/[/\\]/).pop()?.toLowerCase() ?? "";
  const path = extractGrepLikeFileViewPath(words, executable);
  if (!path) return null;

  const lines = parts
    .slice(1)
    .map((part) => parseSelectObjectLineWindow(splitPowerShellWords(part)))
    .find((lineWindow): lineWindow is string => !!lineWindow);
  return { path, ...(lines ? { lines } : {}) };
}

function extractGrepLikeFileViewPath(words: string[], executable: string): string | undefined {
  if (!executable || !GREP_LIKE_EXECUTABLES.has(executable)) return undefined;

  const patterns: string[] = [];
  const paths: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") {
      if (patterns.length === 0) {
        const next = words[++i];
        if (next) patterns.push(next);
      } else {
        paths.push(...words.slice(i + 1));
      }
      break;
    }
    if (word === "-e" || word === "--regexp" || word === "-f" || word === "--file") {
      const value = words[++i];
      if (value) patterns.push(value);
      continue;
    }
    if (word.startsWith("--regexp=")) {
      patterns.push(word.slice("--regexp=".length));
      continue;
    }
    if (word.startsWith("--file=")) {
      patterns.push(word.slice("--file=".length));
      continue;
    }
    if (grepLikeOptionConsumesValue(word, executable)) {
      i++;
      continue;
    }
    if (word.startsWith("-")) continue;
    if (patterns.length === 0) {
      patterns.push(word);
      continue;
    }
    paths.push(word);
  }

  const pattern = patterns[0];
  return pattern && isAllLinesRegex(pattern) && paths.length === 1 ? paths[0] : undefined;
}

function isAllLinesRegex(pattern: string): boolean {
  return pattern.replace(/^'+/u, "") === "^";
}

export function parseGrepLikeSearch(command: string): GrepLikeSearch | null {
  const words = splitShellWords(splitShellPipeline(command)[0] ?? command);
  if (words.length < 2) return null;
  const executable = words[0]!.split(/[/\\]/).pop()?.toLowerCase();
  if (!executable || !GREP_LIKE_EXECUTABLES.has(executable)) return null;

  const patterns: string[] = [];
  const paths: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") {
      if (patterns.length === 0) {
        const next = words[++i];
        if (next) patterns.push(next);
      } else {
        paths.push(...words.slice(i + 1));
      }
      break;
    }
    if (word === "-e" || word === "--regexp" || word === "-f" || word === "--file") {
      const value = words[++i];
      if (value) patterns.push(value);
      continue;
    }
    if (word.startsWith("--regexp=")) {
      patterns.push(word.slice("--regexp=".length));
      continue;
    }
    if (word.startsWith("--file=")) {
      patterns.push(word.slice("--file=".length));
      continue;
    }
    if (grepLikeOptionConsumesValue(word, executable)) {
      i++;
      continue;
    }
    if (word.startsWith("-")) continue;
    if (patterns.length === 0) {
      patterns.push(word);
      continue;
    }
    paths.push(word);
  }

  if (patterns.length === 0) return null;
  return { patterns, scopes: paths };
}
