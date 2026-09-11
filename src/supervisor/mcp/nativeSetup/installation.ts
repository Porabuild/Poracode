import { getWindowsSystemCommand } from "../../agents/base/shellBasics";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { NativeMcpConfigFile } from "./configFile";

// New boundary: no proxy manifests are accepted as ownership of native servers.
const manifestSchema = z.object({
  version: z.literal(1),
  configPath: z.string(),
  entries: z.record(z.string(), z.array(z.string().regex(/^[a-f0-9]{64}$/u)).min(1)),
});
export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function entryDigest(value: unknown): string {
  return digest(JSON.stringify(canonical(value)));
}
export function readOptional(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
function rejectLinks(path: string): void {
  for (let current = path; ; current = dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new Error("Native MCP setup does not replace symbolic links");
    if (current === dirname(current)) break;
  }
}
function atomicWrite(path: string, text: string, expected: string | undefined): void {
  rejectLinks(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.poracode-${randomUUID()}`;
  try {
    // Establish file permissions before writing any credentials.
    writeFileSync(temp, "", { flag: "wx", mode: 0o600 });
    if (process.platform === "win32") {
      const identity = execFileSync(
        getWindowsSystemCommand("whoami.exe"),
        ["/user", "/fo", "csv", "/nh"],
        { encoding: "utf8", windowsHide: true },
      );
      const sid = identity.match(/S-1-[0-9-]+/u)?.[0];
      if (!sid) throw new Error("Windows security identity unavailable");
      execFileSync(
        getWindowsSystemCommand("icacls.exe"),
        [temp, "/inheritance:r", "/grant:r", `*${sid}:F`],
        { windowsHide: true },
      );
    }
    writeFileSync(temp, text);
    rejectLinks(path);
    if (readOptional(path) !== expected)
      throw new Error("Native MCP configuration changed; refresh before retrying");
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

export class NativeMcpInstallation {
  readonly manifestPath: string;
  constructor(
    readonly config: NativeMcpConfigFile,
    baseDir: string,
  ) {
    this.manifestPath = join(baseDir, "native-mcp-config", `${digest(config.path)}.json`);
  }
  snapshot() {
    const text = readOptional(this.config.path);
    const manifestText = readOptional(this.manifestPath);
    const parsed =
      manifestText === undefined ? undefined : manifestSchema.parse(JSON.parse(manifestText));
    if (parsed && parsed.configPath !== this.config.path)
      throw new Error("Native MCP ownership path mismatch");
    const entries = this.config.read(text ?? "");
    const owned = Object.keys(parsed?.entries ?? {}).filter(
      (name) =>
        Object.hasOwn(entries, name) && parsed!.entries[name]!.includes(entryDigest(entries[name])),
    );
    const modified = Object.keys(parsed?.entries ?? {}).filter(
      (name) => Object.hasOwn(entries, name) && !owned.includes(name),
    );
    return {
      text,
      manifestText,
      entries,
      owned,
      modified,
      revision: digest(JSON.stringify([text, manifestText])),
    };
  }
  /** Explicit settings action only. Launch and detection never call this method. */
  apply(revision: string, additions: Record<string, unknown>, removals: readonly string[]): void {
    const before = this.snapshot();
    if (before.revision !== revision)
      throw new Error("Native MCP configuration changed; refresh before retrying");
    rejectLinks(this.config.path);
    rejectLinks(this.manifestPath);
    for (const name of [...Object.keys(additions), ...removals]) {
      if (Object.hasOwn(before.entries, name) && !before.owned.includes(name))
        throw new Error("Native MCP server is not owned or was edited; leaving it unchanged");
    }
    let next = before.text ?? "";
    for (const name of removals) next = this.config.write(next, name, undefined);
    for (const [name, entry] of Object.entries(additions))
      next = this.config.write(next, name, entry);
    // Validate the entire edited document before creating directories or files.
    const nextEntries = this.config.read(next);
    const ownedNames = new Set([...before.owned, ...Object.keys(additions)]);
    for (const name of removals) ownedNames.delete(name);
    const entries = Object.fromEntries(
      [...ownedNames].map((name) => [name, [entryDigest(nextEntries[name])]]),
    );
    // Journal both exact versions before commit: interrupted updates/removals can be retried.
    const journal = new Map(Object.entries(entries));
    for (const name of before.owned)
      journal.set(name, [
        ...new Set([...(journal.get(name) ?? []), entryDigest(before.entries[name])]),
      ]);
    const pending = JSON.stringify({
      version: 1,
      configPath: this.config.path,
      entries: Object.fromEntries(journal),
    });
    atomicWrite(this.manifestPath, pending, before.manifestText);
    atomicWrite(this.config.path, next, before.text);
    atomicWrite(
      this.manifestPath,
      JSON.stringify({ version: 1, configPath: this.config.path, entries }),
      pending,
    );
  }
}
