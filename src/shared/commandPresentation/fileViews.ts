import {
  splitShellPipeline,
  splitShellWords,
  firstShellStatement,
  readNonNegativeInteger,
} from "./shellSyntax";

interface SedView {
  path: string;
  lines: string;
}

interface PipedFileView {
  path: string;
  lines: string;
}

interface FindSearch {
  scope: string;
  pattern: string | undefined;
}

export function parseSedView(command: string): SedView | null {
  // Codex commonly batches several reads into one shell invocation:
  // `sed ... first.ts; sed ... second.ts`. Parse only the first statement so
  // its `;` separator does not become part of the displayed path (and turn a
  // highlightable `.ts` extension into the unknown `.ts;` extension).
  const words = splitShellWords(firstShellStatement(command));
  if (words.length < 3) return null;
  const executable = words[0]!.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "sed" && executable !== "gsed") return null;

  let script: string | undefined;
  let path: string | undefined;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") continue;
    if (word === "-e") {
      script = words[++i];
      continue;
    }
    if (word.startsWith("-")) continue;
    if (script === undefined) {
      script = word;
      continue;
    }
    path = word;
    break;
  }

  if (!script || !path || path === "-") return null;
  const range = /^(\d+)(?:,(\d+))?p$/.exec(script.trim());
  if (!range) return null;
  const start = range[1]!;
  const end = range[2];
  return { path, lines: end ? `${start}-${end}` : start };
}

export function parsePipedFileView(command: string): PipedFileView | null {
  const parts = splitShellPipeline(command);
  if (parts.length < 2) return null;
  const path = extractPipedReadableFilePath(splitShellWords(parts[0]!));
  if (!path) return null;

  const sedPart = parts.find((part, index) => {
    if (index === 0) return false;
    const executable = splitShellWords(part)[0]?.split(/[/\\]/).pop()?.toLowerCase();
    return executable === "sed" || executable === "gsed";
  });
  if (!sedPart) return null;

  const sed = parseSedView(`${sedPart} ${path}`);
  return sed ? { path, lines: sed.lines } : null;
}

export function parseHeadFileView(command: string): PipedFileView | null {
  const parts = splitShellPipeline(command);
  // A filter between the reader and head (`cat f | grep x | head`) changes what
  // head sees, so only the direct `<reader> | head` and bare `head file` forms
  // map cleanly to a 1..N window of a single file. An empty pipeline (blank or
  // pipe-only command) has no segment to inspect.
  if (parts.length === 0 || parts.length > 2) return null;
  const invocation = parseHeadInvocation(splitShellWords(parts[parts.length - 1]!));
  if (!invocation) return null;

  const path =
    parts.length === 2 ? extractPipedReadableFilePath(splitShellWords(parts[0]!)) : invocation.path;
  if (!path) return null;
  return { path, lines: invocation.lines };
}

function parseHeadInvocation(words: string[]): { path: string | undefined; lines: string } | null {
  const executable = words[0]?.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "head" && executable !== "ghead") return null;

  let count = 10; // `head`'s default line count
  let path: string | undefined;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") {
      path = words[i + 1] ?? path;
      break;
    }
    const legacy = /^-(\d+)$/.exec(word);
    if (legacy) {
      count = Number(legacy[1]);
      continue;
    }
    if (word === "-n" || word === "--lines") {
      const value = readNonNegativeInteger(words[++i]);
      if (value === undefined) return null;
      count = value;
      continue;
    }
    const attached = /^-n(\d+)$/.exec(word) ?? /^--lines=(\d+)$/.exec(word);
    if (attached) {
      count = Number(attached[1]);
      continue;
    }
    // Byte windows aren't line-addressable (covers -c, -c200, -c-200, --bytes, --bytes=N).
    if (/^-c/.test(word) || /^--bytes(=|$)/.test(word)) return null;
    if (word === "-") continue; // explicit stdin
    if (/^\d*>/.test(word)) continue; // shell redirection (e.g. 2>/dev/null), not a path
    if (word.startsWith("-")) continue; // -q/-v/-z and other flags
    // First file operand. Keep scanning so trailing flags still apply (GNU permutes
    // operands and options, e.g. `head file -n 40`).
    if (path === undefined) path = word;
  }

  if (count <= 0) return null;
  return { path, lines: count === 1 ? "1" : `1-${count}` };
}

function extractPipedReadableFilePath(words: string[]): string | undefined {
  const executable = words[0]?.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "cat" && executable !== "type" && executable !== "nl") return undefined;

  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") return words[i + 1];
    if (word.startsWith("-")) {
      if (executable === "nl" && consumesNlOptionValue(word)) i++;
      continue;
    }
    if (/^\d*>/.test(word)) continue;
    return word;
  }
  return undefined;
}

function consumesNlOptionValue(option: string): boolean {
  return (
    /^-(b|d|f|h|i|l|n|s|v|w)$/.test(option) ||
    /^--(body-numbering|section-delimiter|footer-numbering|header-numbering|line-increment|join-blank-lines|number-format|number-separator|starting-line-number|number-width)$/.test(
      option,
    )
  );
}

export function parseFindSearch(command: string): FindSearch | null {
  const words = splitShellWords(splitShellPipeline(command)[0] ?? command);
  if (words.length < 2) return null;
  const executable = words[0]!.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "find" && executable !== "gfind") return null;

  const scopes: string[] = [];
  let pattern: string | undefined;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "-name" || word === "-iname" || word === "-path" || word === "-regex") {
      pattern = words[++i];
      continue;
    }
    if (word.startsWith("-")) {
      const nextConsumesValue =
        word === "-maxdepth" ||
        word === "-mindepth" ||
        word === "-type" ||
        word === "-perm" ||
        word === "-mtime" ||
        word === "-size";
      if (nextConsumesValue) i++;
      continue;
    }
    if (word === "-o" || word === "(" || word === ")") continue;
    if (!word.startsWith("!")) scopes.push(word);
  }

  if (scopes.length === 0) return null;
  return { scope: scopes.join(" "), pattern };
}

export function parseListDirectory(command: string): string | null {
  const words = splitShellWords(splitShellPipeline(command)[0] ?? command);
  if (words.length < 2) return null;
  const executable = words[0]!.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "ls" && executable !== "dir") return null;

  const path = words.find((word, index) => index > 0 && !word.startsWith("-"));
  return path ?? ".";
}
