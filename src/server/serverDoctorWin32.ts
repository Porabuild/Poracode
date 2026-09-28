import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultOwnerAclExec, type OwnerAclExec } from "@/shared/restrictToOwner";
import type { ServerInstallLayout } from "./serverInstallLayout";
import type { ServerDoctorCheck } from "./serverDoctorTypes";

/**
 * Windows-only doctor checks: owner-only profile ACL, the ConPTY runtime
 * files, and the MAX_PATH preflight. Every OS seam is injectable so the win32
 * branches run under unit tests on any platform.
 */

const DOCTOR_EXEC_TIMEOUT_MS = 10_000;
/** Below MAX_PATH (260) with headroom for the file name Windows appends. */
export const WIN32_PATH_LENGTH_THRESHOLD = 240;
const LONG_PATHS_KEY = "HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem";
const ARTIFACT_METADATA_FILE = "server-artifact.json";
const CONPTY_REQUIRED_FILES: readonly string[] = ["conpty.node", "conpty/OpenConsole.exe"];

export interface Win32DoctorInput {
  /** Owned profile root whose ACL is audited. */
  readonly profileRoot: string;
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
  readonly exec?: OwnerAclExec;
  readonly exists?: (path: string) => boolean;
  readonly readText?: (path: string) => string;
}

/** Broad principals whose presence in the ACL exposes the profile to others. */
const BROAD_PRINCIPALS: readonly RegExp[] = [
  /^Everyone$/iu,
  /^BUILTIN\\Users$/iu,
  /^NT AUTHORITY\\Authenticated Users$/iu,
  /^\*?S-1-1-0$/iu,
  /^\*?S-1-5-32-545$/iu,
  /^\*?S-1-5-11$/iu,
];

/**
 * Principals holding a non-deny ACE, parsed from `icacls <path>` output. The
 * first line carries the path, continuation lines are indented; each ACE reads
 * `<principal>:(flags)(rights)`.
 */
export function broadIcaclsPrincipals(output: string, path: string): string[] {
  const found = new Set<string>();
  for (const rawLine of output.split(/\r?\n/u)) {
    let line = rawLine.trim();
    // The first ACE shares its line with the audited path.
    if (line.toLowerCase().startsWith(path.toLowerCase())) line = line.slice(path.length).trim();
    const split = line.lastIndexOf(":(");
    if (split <= 0) continue;
    const principal = line.slice(0, split).trim();
    const rights = line.slice(split + 1);
    if (/\(DENY\)/iu.test(rights)) continue;
    if (BROAD_PRINCIPALS.some((pattern) => pattern.test(principal))) found.add(principal);
  }
  return [...found];
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function checkOwnerAcl(input: Win32DoctorInput, exec: OwnerAclExec): ServerDoctorCheck {
  let output: string;
  try {
    output = exec("icacls", [input.profileRoot], { timeout: DOCTOR_EXEC_TIMEOUT_MS });
  } catch (error) {
    return {
      name: "owner-acl",
      status: "warn",
      detail: `Could not read the ACL of ${input.profileRoot}: ${describeError(error)}`,
    };
  }
  const broad = broadIcaclsPrincipals(output, input.profileRoot);
  if (broad.length === 0) {
    return {
      name: "owner-acl",
      status: "ok",
      detail: `${input.profileRoot} grants no access to Everyone, Users or Authenticated Users.`,
    };
  }
  return {
    name: "owner-acl",
    status: "warn",
    detail:
      `${input.profileRoot} is accessible to ${broad.join(", ")}; relay secrets, credentials and ` +
      "backups under it are readable by other local users. Restrict it with " +
      `\`icacls "${input.profileRoot}" /inheritance:r /grant:r "%USERNAME%":(OI)(CI)(F)\`.`,
  };
}

function checkConpty(
  input: Win32DoctorInput,
  layout: ServerInstallLayout,
  exists: (path: string) => boolean,
): ServerDoctorCheck {
  const dir = join(layout.root, "node_modules", "node-pty", "prebuilds", `win32-${input.arch}`);
  const missing = CONPTY_REQUIRED_FILES.filter((file) => !exists(join(dir, ...file.split("/"))));
  return missing.length === 0
    ? { name: "conpty", status: "ok", detail: `ConPTY runtime present at ${dir}.` }
    : {
        name: "conpty",
        status: "error",
        detail:
          `ConPTY runtime file(s) missing from ${dir}: ${missing.join(", ")}. Terminal sessions ` +
          "cannot start; reinstall the release so the native overlay is applied.",
      };
}

function readLongPathsEnabled(exec: OwnerAclExec): boolean | null {
  try {
    const output = exec("reg", ["query", LONG_PATHS_KEY, "/v", "LongPathsEnabled"], {
      timeout: DOCTOR_EXEC_TIMEOUT_MS,
    });
    const match = /LongPathsEnabled\s+REG_DWORD\s+(0x[0-9a-f]+|\d+)/iu.exec(output);
    return match?.[1] === undefined ? null : Number(match[1]) !== 0;
  } catch {
    // A missing value (older Windows, never set) means long paths are off.
    return false;
  }
}

function checkPathLength(
  input: Win32DoctorInput,
  layout: ServerInstallLayout,
  exec: OwnerAclExec,
  readText: (path: string) => string,
): ServerDoctorCheck {
  let longest: string | undefined;
  try {
    const parsed: unknown = JSON.parse(readText(join(layout.root, ARTIFACT_METADATA_FILE)));
    const value =
      parsed !== null && typeof parsed === "object"
        ? (parsed as { longestMemberPath?: unknown }).longestMemberPath
        : undefined;
    if (typeof value === "string") longest = value;
  } catch {
    // Absent or unreadable metadata is reported below, not fatal.
  }
  if (longest === undefined) {
    return {
      name: "path-length",
      status: "ok",
      detail: `${ARTIFACT_METADATA_FILE} carries no longestMemberPath; the MAX_PATH preflight is not available for this release.`,
    };
  }
  const total = layout.root.length + 1 + longest.length;
  if (total <= WIN32_PATH_LENGTH_THRESHOLD) {
    return {
      name: "path-length",
      status: "ok",
      detail: `Longest release path is ${total} characters (limit ${WIN32_PATH_LENGTH_THRESHOLD}).`,
    };
  }
  const longPaths = readLongPathsEnabled(exec);
  return longPaths === true
    ? {
        name: "path-length",
        status: "ok",
        detail: `Longest release path is ${total} characters; LongPathsEnabled is set.`,
      }
    : {
        name: "path-length",
        status: "warn",
        detail:
          `Longest release path is ${total} characters (limit ${WIN32_PATH_LENGTH_THRESHOLD}) and ` +
          `Windows LongPathsEnabled is ${longPaths === null ? "unreadable" : "not set"}. ` +
          "Install under a shorter prefix or enable long paths (HKLM\\SYSTEM\\CurrentControlSet\\" +
          "Control\\FileSystem\\LongPathsEnabled = 1).",
      };
}

/** Empty off Windows; layout-dependent checks are skipped on a layout error. */
export function buildWin32Checks(
  input: Win32DoctorInput,
  layout: ServerInstallLayout | { readonly error: string },
): ServerDoctorCheck[] {
  if ((input.platform ?? process.platform) !== "win32") return [];
  const exec = input.exec ?? defaultOwnerAclExec;
  const resolved: Win32DoctorInput = { ...input, arch: input.arch ?? process.arch };
  const checks: ServerDoctorCheck[] = [];
  if ((input.exists ?? existsSync)(input.profileRoot)) checks.push(checkOwnerAcl(resolved, exec));
  if (!("error" in layout)) {
    checks.push(checkConpty(resolved, layout, input.exists ?? existsSync));
    checks.push(
      checkPathLength(resolved, layout, exec, input.readText ?? ((p) => readFileSync(p, "utf8"))),
    );
  }
  return checks;
}
