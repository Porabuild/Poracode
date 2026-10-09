import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  DEVIN_PERSONA_DIR_FILES,
  parseDevinPersonaDefinition,
  validateDevinPersonaCatalog,
  validateDevinPersonaDefinition,
  type DevinPersonaDefinition,
  type DevinPersonaIssue,
  type DevinPersonaOrigin,
} from "./definitions";
import { devinPosixJoin } from "../accountRoots";
import type { DevinExecutionContext } from "../profileContext";

/**
 * Candidate persona catalog — a SCAN, not a provider-confirmed load.
 *
 * The native CLI has no persona list API; `devin doctor` reports the names
 * it loaded in that diagnostic invocation. Entries here remain candidates with visible
 * origin/scope, and `confirmed` is always false: proving the provider actually
 * loaded a definition needs a live session (plan G15, Q33). The scan covers
 * only the documented roots (`.devin/agents`, `.agents/agents`, global
 * `devin/agents` — no invented import/plugin roots; plugin contributions need
 * a verified native inventory before they can be enumerated). It is bounded
 * (entry count, scanned names, definition reads, per-file bytes) and strictly
 * read-only.
 */

export interface DevinPersonaScanRoot {
  origin: DevinPersonaOrigin;
  scope: "project" | "global";
  /** Absolute directory (execution-environment path). */
  path: string;
  /** Lower number = higher precedence; earlier roots win same-name collisions. */
  precedence: number;
  /** Imported/plugin origins must never be edited in place. */
  readOnly?: boolean | undefined;
}

export interface DevinPersonaCatalogEntry {
  definition: DevinPersonaDefinition;
  root: DevinPersonaScanRoot;
  scope: "project" | "global";
  /** Always false today: a scan cannot prove provider-effective loading. */
  confirmed: false;
  validation: readonly DevinPersonaIssue[];
}

export interface DevinPersonaCatalog {
  entries: DevinPersonaCatalogEntry[];
  /** Duplicate-name findings across roots (shadowed definitions, never merged). */
  crossRootIssues: readonly DevinPersonaIssue[];
  /**
   * True when the scan PROVED candidates existed beyond one of its bounds
   * (entry cap, scanned-name cap, or read cap) and they are not listed — a
   * projected truncation marker, never a silent short list.
   */
  truncated: boolean;
}

/** Filesystem adapter so scans are testable without touching real roots. */
export interface DevinPersonaReader {
  listDir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  /** File size in bytes, when the reader can stat (oversize guard). */
  byteLength?(path: string): Promise<number | undefined>;
}

export function createNodeDevinPersonaReader(): DevinPersonaReader {
  return {
    async listDir(path) {
      const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
      return entries.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name));
    },
    readFile(path) {
      return readFile(path, "utf8");
    },
    async byteLength(path) {
      const info = await stat(path).catch(() => undefined);
      return info?.isFile() ? info.size : undefined;
    },
  };
}

/** Single default reader instance: identity is how the WSL guard detects it. */
const NODE_PERSONA_READER: DevinPersonaReader = createNodeDevinPersonaReader();

/**
 * Segment join matched to the root's own path style: WSL/global roots are
 * POSIX Linux paths (also built on Windows hosts, where the platform join
 * would backslash them), while host project/APPDATA roots keep their native
 * separators.
 */
function personaJoin(root: DevinPersonaScanRoot, ...segments: readonly string[]): string {
  const windowsStyle = /^[A-Za-z]:[\\/]/.test(root.path) || root.path.includes("\\");
  const joiner = windowsStyle ? join : devinPosixJoin;
  return joiner(root.path, ...segments);
}

/** Scan bounds: a misbehaving root cannot balloon the catalog or memory. */
const MAX_CATALOG_ENTRIES = 500;
/** Total names walked across every root before the scan stops. */
const MAX_SCANNED_NAMES = 4000;
/** Total definition read attempts (stat + read) before the scan stops. */
const MAX_DEFINITION_READS = 1000;
const MAX_DEFINITION_BYTES = 256 * 1024;

async function readPersonaFile(
  reader: DevinPersonaReader,
  root: DevinPersonaScanRoot,
  pathId: string,
  filePath: string,
): Promise<DevinPersonaCatalogEntry | undefined> {
  if (reader.byteLength) {
    const size = await reader.byteLength(filePath).catch(() => undefined);
    if (size !== undefined && size > MAX_DEFINITION_BYTES) {
      return oversizeEntry(root, pathId, filePath);
    }
  }
  const content = await reader.readFile(filePath).catch(() => undefined);
  if (content === undefined) return undefined;
  // Reader without stat support: the byte bound is enforced after the read —
  // still bounded output, at the cost of one transient oversized buffer.
  if (Buffer.byteLength(content, "utf8") > MAX_DEFINITION_BYTES) {
    return oversizeEntry(root, pathId, filePath);
  }
  const parsed = parseDevinPersonaDefinition({
    content,
    pathId,
    filePath,
    origin: root.origin,
  });
  if (parsed.status === "malformed") {
    // Malformed definitions stay visible: the native CLI skips them with a
    // doctor warning, so hiding them here would disagree with the session.
    return {
      definition: {
        id: pathId,
        pathId,
        origin: root.origin,
        filePath,
        frontmatter: {
          name: undefined,
          description: undefined,
          model: undefined,
          allowedTools: [],
          maxNesting: undefined,
          unknown: {},
        },
        body: "",
        rawFrontmatter: "",
      },
      root,
      scope: root.scope,
      confirmed: false,
      validation: [{ code: "invalid-max-nesting", severity: "error", message: parsed.reason }],
    };
  }
  return {
    definition: parsed.definition,
    root,
    scope: root.scope,
    confirmed: false,
    validation: validateDevinPersonaDefinition(parsed.definition),
  };
}

function oversizeEntry(
  root: DevinPersonaScanRoot,
  pathId: string,
  filePath: string,
): DevinPersonaCatalogEntry {
  return {
    definition: {
      id: pathId,
      pathId,
      origin: root.origin,
      filePath,
      frontmatter: {
        name: undefined,
        description: undefined,
        model: undefined,
        allowedTools: [],
        maxNesting: undefined,
        unknown: {},
      },
      body: "",
      rawFrontmatter: "",
    },
    root,
    scope: root.scope,
    confirmed: false,
    validation: [
      {
        code: "invalid-max-nesting",
        severity: "error",
        message: `The definition exceeds the ${Math.floor(MAX_DEFINITION_BYTES / 1024)} KiB scan bound and was not parsed.`,
      },
    ],
  };
}

/**
 * Scan the given roots (highest precedence first) and produce the candidate
 * catalog. `<root>/<name>.md` files and `<root>/<name>/AGENT.md` directories
 * are both read; same-name definitions shadow later ones per root precedence
 * and are reported, never merged. Bounded BEFORE bytes are materialized: the
 * scan stops at the entry cap, the total scanned-name cap, or the total read
 * cap, and `truncated` is true exactly when candidates existed beyond the
 * bound that were not listed — never a silent short list.
 */
export async function scanDevinPersonaCatalog(
  roots: readonly DevinPersonaScanRoot[],
  reader: DevinPersonaReader = createNodeDevinPersonaReader(),
  options?: { signal?: AbortSignal | undefined },
): Promise<DevinPersonaCatalog> {
  const orderedRoots = [...roots].sort((left, right) => left.precedence - right.precedence);
  const entries: DevinPersonaCatalogEntry[] = [];
  let namesWalked = 0;
  let readsPerformed = 0;
  // Set only when a bound stopped the scan while candidates remained.
  let remainder = false;
  const atEntryCap = () => entries.length >= MAX_CATALOG_ENTRIES;
  const atScanCaps = () =>
    namesWalked >= MAX_SCANNED_NAMES || readsPerformed >= MAX_DEFINITION_READS;

  outer: for (const root of orderedRoots) {
    options?.signal?.throwIfAborted();
    const names = await reader.listDir(root.path).catch(() => [] as string[]);
    for (const name of names) {
      if (atEntryCap() || atScanCaps()) {
        remainder = true;
        break outer;
      }
      namesWalked += 1;
      if (name.endsWith("/")) {
        const dirName = name.slice(0, -1);
        for (const file of DEVIN_PERSONA_DIR_FILES) {
          if (atScanCaps()) {
            remainder = true;
            break outer;
          }
          readsPerformed += 1;
          const entry = await readPersonaFile(
            reader,
            root,
            dirName,
            personaJoin(root, dirName, file),
          );
          if (entry) {
            entries.push(entry);
            break;
          }
        }
      } else if (name.endsWith(".md")) {
        readsPerformed += 1;
        const entry = await readPersonaFile(
          reader,
          root,
          name.slice(0, -3),
          personaJoin(root, name),
        );
        if (entry) entries.push(entry);
      }
    }
  }
  const crossRootIssues: DevinPersonaIssue[] = remainder
    ? [
        {
          code: "scan-truncated",
          severity: "warning",
          message: `The persona scan stopped at its bounds (${MAX_CATALOG_ENTRIES} entries, ${MAX_SCANNED_NAMES} names, ${MAX_DEFINITION_READS} reads); further definitions exist but are not listed.`,
        },
      ]
    : [];
  return {
    entries: entries.slice(0, MAX_CATALOG_ENTRIES),
    crossRootIssues: [...crossRootIssues, ...validateDevinPersonaCatalog(entries)],
    truncated: remainder,
  };
}

/**
 * Scan roots for one execution context, resolved from the context's OWN
 * environment — never the supervisor's global env. The global root is the
 * config root the context redirects `XDG_CONFIG_HOME`/`APPDATA` to (native
 * default, account root, or org view); project roots stay in the project.
 * Custom-persona loading by the session still needs live proof (Q33), so
 * entries remain unconfirmed candidates.
 */
export function devinPersonaRootsForContext(
  context: DevinExecutionContext,
): DevinPersonaScanRoot[] {
  const roots: DevinPersonaScanRoot[] = [];
  const windowsLocation = context.location.kind === "windows";
  const globalBase = windowsLocation
    ? (context.env?.APPDATA ?? context.roots.configRoot)
    : (context.env?.XDG_CONFIG_HOME ?? context.roots.configRoot);
  // The global base is a Linux path for WSL contexts — POSIX-joined even on a
  // Windows host (the platform join would backslash it).
  const joinGlobal = windowsLocation ? join : devinPosixJoin;
  roots.push({
    origin: "global",
    scope: "global",
    path: joinGlobal(globalBase, "devin", "agents"),
    // Native duplicate-name QA: the global definition wins even when a
    // project definition specifies different tool restrictions.
    precedence: 0,
  });
  const projectBase =
    context.location.kind === "wsl" ? context.location.linuxPath : context.location.path;
  const joinProject = context.location.kind === "windows" ? join : devinPosixJoin;
  roots.push(
    {
      origin: "project",
      scope: "project",
      path: joinProject(projectBase, ".devin", "agents"),
      precedence: 1,
    },
    {
      origin: "project",
      scope: "project",
      path: joinProject(projectBase, ".agents", "agents"),
      precedence: 2,
    },
  );
  return roots;
}

export type DevinPersonaScanOutcome =
  | { status: "ok"; catalog: DevinPersonaCatalog }
  | { status: "unsupported-environment"; reason: string };

/**
 * Scan the persona catalog for one execution context. Fail closed on WSL:
 * the context's roots are Linux paths inside the distro and the node reader
 * would either miss them or read the wrong filesystem from the host. A
 * distro-side reader (through the shared WSL command helpers) is a future
 * qualification, not something to guess at here — callers get a typed
 * unsupported outcome instead of an empty-looking catalog that would
 * disagree with the session. Only the documented native roots are scanned;
 * nothing is fabricated.
 */
export async function scanDevinPersonasForContext(
  context: DevinExecutionContext,
  reader: DevinPersonaReader = NODE_PERSONA_READER,
  options?: { signal?: AbortSignal | undefined },
): Promise<DevinPersonaScanOutcome> {
  // Fail closed on WSL with the node reader: Linux paths inside the distro
  // must not be served from the host filesystem. An injected distro-side
  // reader passes through.
  if (context.location.kind === "wsl" && reader === NODE_PERSONA_READER) {
    return {
      status: "unsupported-environment",
      reason:
        "Devin persona roots for a WSL profile are Linux paths inside the distro; Poracode does not read them from the host filesystem. Persona discovery on WSL needs a distro-side reader that has not been qualified yet.",
    };
  }
  const catalog = await scanDevinPersonaCatalog(
    devinPersonaRootsForContext(context),
    reader,
    options,
  );
  return { status: "ok", catalog };
}
