import path from "node:path";
import { parseArgs } from "node:util";
import { deriveLocationFromPath } from "@/shared/createProject";
import { projectIdentityKey } from "@/shared/projectIdentity";
import type { Project } from "@/shared/contracts";
import { resolveTargetDirectory } from "./target-directory";

const baseDir = process.env.PORACODE_BASE_DIR;
if (!baseDir)
  throw new Error("PORACODE_BASE_DIR must point at an isolated running Poracode server");

const server = path.resolve(import.meta.dir, "../../../dist/main/server.cjs");
const cwd = resolveTargetDirectory(process.argv, process.env.INIT_CWD, process.cwd());
const home = path.resolve(process.env.PORACODE_TUI_HOME ?? path.join(baseDir, "tui"));
const env = { ...process.env, PORACODE_BASE_DIR: path.resolve(baseDir) };

function cli(...args: string[]) {
  const result = Bun.spawnSync(["node", server, ...args], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr).trim() || "Poracode server CLI failed");
  }
  return JSON.parse(new TextDecoder().decode(result.stdout)) as unknown;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function projects(value: unknown): Project[] {
  const parsed = Array.isArray(value) ? value : object(value).projects;
  return Array.isArray(parsed) ? (parsed as Project[]) : [];
}

const pairing = object(cli("pair", "--json"));
const pairingUrl = String(pairing.pairingUrl ?? pairing.url ?? "");
if (!pairingUrl) throw new Error("Poracode server did not return a pairing URL");

const desiredLocation = deriveLocationFromPath(cwd, process.platform);
const known = projects(cli("projects", "list", "--json")).find(
  (project) => projectIdentityKey(project) === projectIdentityKey({ location: desiredLocation }),
);
const added = known ? undefined : object(cli("projects", "add", cwd, "--json"));
const nestedProject = object(added?.project);
const projectId = known?.id ?? String(added?.projectId ?? nestedProject.id ?? "");
if (!projectId) throw new Error("Poracode server did not return the current project ID");

const packageInfo = object(
  await Bun.file(path.resolve(import.meta.dir, "../../../package.json")).json(),
);
const parsedArgs = parseArgs({
  allowPositionals: true,
  options: {
    continue: { type: "boolean" },
    session: { type: "string" },
    prompt: { type: "string" },
    auto: { type: "boolean" },
  },
});
process.env.PORACODE_TUI_HOME = home;
process.env.PORACODE_TUI_BOOTSTRAP = JSON.stringify({
  version: 1,
  appVersion: String(packageInfo.version ?? "0.0.0"),
  home,
  pairingUrl,
  directory: cwd,
  projectId,
  args: {
    ...(parsedArgs.values.continue !== undefined ? { continue: parsedArgs.values.continue } : {}),
    ...(parsedArgs.values.session ? { sessionId: parsedArgs.values.session } : {}),
    ...(parsedArgs.values.prompt !== undefined ? { prompt: parsedArgs.values.prompt } : {}),
    ...(parsedArgs.values.auto !== undefined ? { auto: parsedArgs.values.auto } : {}),
  },
});
await import("../main");
