import { msg } from "@/shared/messages";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, posix } from "node:path";
import { promisify } from "node:util";
import type { ProjectLocation } from "@/shared/contracts";
import { buildAgentCommand, primeProjectShellEnv } from "../agents/base";
import type { WslBridgeClient } from "../wsl/bridge/client";
import { resolveNodeForDistro } from "../wsl/runtime";
import type { ForgeHttp, ForgeHttpResponse } from "./api";

const exec = promisify(execFile);
const MAX_BYTES = 50 * 1024 * 1024;

// The same bounded fetch runs in the WSL runtime: its DNS, TLS trust, proxy and
// credentials must not silently become those of the Windows supervisor.
export const FORGE_FETCH_SCRIPT = `
(async () => {
  const input = JSON.parse(process.env.PORACODE_FORGE_REQUEST);
  const response = await fetch(input.url, { method: input.method, headers: input.headers,
    ...(input.body === undefined ? {} : {body: input.body}), redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const chunks = []; let length = 0;
  if (response.body) for await (const chunk of response.body) {
    length += chunk.length; if (length > 52428800) throw new Error('Source response is too large'); chunks.push(chunk);
  }
  process.stdout.write(JSON.stringify({status: response.status, headers: Object.fromEntries(response.headers),
    body: Buffer.concat(chunks).toString('utf8')}));
})().catch(() => { process.stderr.write('Source host request failed'); process.exitCode = 1; });`;

const ENV_KEYS = [
  "HOME",
  "APPDATA",
  "XDG_CONFIG_HOME",
  "GLAB_CONFIG_DIR",
  "TEA_CONFIG",
  "GITLAB_HOST",
  "GITLAB_URI",
  "GITLAB_SUBFOLDER",
  "GITLAB_TOKEN",
  "GITLAB_ACCESS_TOKEN",
  "GLAB_TOKEN",
  "GITEA_HOST",
  "GITEA_TOKEN",
  "FORGEJO_HOST",
  "FORGEJO_TOKEN",
  "BITBUCKET_ACCESS_TOKEN",
  "BITBUCKET_EMAIL",
  "BITBUCKET_API_TOKEN",
  "AZURE_DEVOPS_EXT_PAT",
  "AZURE_DEVOPS_ORG_SERVICE_URL",
  "CAFE_HOST",
  "CAFE_TOKEN",
  "CAFE_AUTH_FILE",
];

export class ForgeRuntime {
  constructor(private readonly wslClient: () => WslBridgeClient | undefined) {}

  async run(
    location: ProjectLocation,
    command: string,
    args: string[],
    env?: Record<string, string>,
    acceptDiff = false,
    input?: string,
  ): Promise<string> {
    if (location.kind === "wsl") {
      if (input !== undefined) {
        const { nodePath } = await resolveNodeForDistro(location.distro);
        return this.run(
          location,
          nodePath,
          [
            "-e",
            `const {execFileSync}=require('node:child_process');const command=JSON.parse(process.env.PORACODE_FORGE_COMMAND);try {process.stdout.write(execFileSync(command.binary,command.args,{input:process.env.PORACODE_FORGE_INPUT,timeout:28000,maxBuffer:52428800}));} catch {process.exitCode=1;}`,
          ],
          {
            ...env,
            PORACODE_FORGE_INPUT: input,
            PORACODE_FORGE_COMMAND: JSON.stringify({ binary: command, args }),
          },
        );
      }
      const client = this.wslClient();
      if (!client) throw new Error(msg("forge.wslUnavailable"));
      const result = await client.processExec(location, {
        command,
        args,
        cwd: location.linuxPath,
        loginEnv: true,
        timeoutMs: 30_000,
        ...(env ? { env } : {}),
      });
      if (result.ok || (acceptDiff && result.exitCode === 1)) return result.stdout;
      throw new Error(msg("forge.commandFailed", { command }));
    }
    if (location.kind === "posix") await primeProjectShellEnv(location.path);
    try {
      const spec = buildAgentCommand(location, command, args, undefined, env);
      const pending = exec(spec.command, spec.args, {
        cwd: spec.cwd ?? location.path,
        windowsHide: true,
        timeout: 30_000,
        maxBuffer: MAX_BYTES,
        env: { ...process.env, ...spec.env, ...env },
      });
      if (input !== undefined) {
        pending.child.stdin?.on("error", () => {});
        pending.child.stdin?.end(input);
      }
      return (await pending).stdout;
    } catch (error) {
      if (acceptDiff && (error as { code?: unknown }).code === 1)
        return String((error as { stdout?: unknown }).stdout ?? "");
      // Child-process error messages include argv/stdout. Credential commands
      // are deliberately diagnosed without serializing either.
      // eslint-disable-next-line preserve-caught-error -- The cause can contain credentials.
      throw new Error(msg("forge.commandFailed", { command }));
    }
  }

  async environment(location: ProjectLocation): Promise<Record<string, string>> {
    if (location.kind === "posix") await primeProjectShellEnv(location.path);
    if (location.kind !== "wsl")
      return Object.fromEntries(
        ENV_KEYS.flatMap((key) => (process.env[key] ? [[key, process.env[key]!]] : [])),
      );
    const { nodePath } = await resolveNodeForDistro(location.distro);
    return JSON.parse(
      await this.run(location, nodePath, [
        "-e",
        `process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(ENV_KEYS)}.flatMap(k => process.env[k] ? [[k,process.env[k]]] : []))))`,
      ]),
    ) as Record<string, string>;
  }

  async read(location: ProjectLocation, path: string): Promise<string | null> {
    try {
      if (location.kind !== "wsl") return await readFile(path, "utf8");
      const result = await this.wslClient()!.readFile(location, path, {
        maxBytes: 2 * 1024 * 1024,
      });
      return result.tooLarge ? null : Buffer.from(result.contentBase64, "base64").toString("utf8");
    } catch (error) {
      if (
        location.kind !== "wsl" &&
        !["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")
      )
        // eslint-disable-next-line preserve-caught-error -- Keep credential configuration diagnostics private.
        throw new Error(msg("forge.configUnreadable"));
      return null;
    }
  }

  async temporary<T>(
    location: ProjectLocation,
    files: Record<string, string>,
    operation: (dir: string) => Promise<T>,
  ): Promise<T> {
    const dir =
      location.kind === "wsl"
        ? (await this.run(location, "mktemp", ["-d", "/tmp/poracode-forge-XXXXXX"])).trim()
        : await mkdtemp(join(tmpdir(), "poracode-forge-"));
    if (!dir || (location.kind === "wsl" && !/^\/tmp\/poracode-forge-[A-Za-z0-9]+$/.test(dir)))
      throw new Error(msg("forge.responseInvalid"));
    try {
      for (const [name, body] of Object.entries(files)) {
        if (location.kind === "wsl")
          await this.wslClient()!.writeNewFile(location, `${dir}/${name}`, Buffer.from(body));
        else await writeFile(join(dir, name), body, { flag: "wx", mode: 0o600 });
      }
      return await operation(dir);
    } finally {
      if (location.kind === "wsl")
        await this.wslClient()!.rm(location, dir, { recursive: true, force: true });
      else await rm(dir, { recursive: true, force: true });
    }
  }

  http(location: ProjectLocation): ForgeHttp {
    return async (input) => {
      try {
        if (location.kind === "wsl") {
          const { nodePath } = await resolveNodeForDistro(location.distro);
          return JSON.parse(
            await this.run(location, nodePath, ["-e", FORGE_FETCH_SCRIPT], {
              PORACODE_FORGE_REQUEST: JSON.stringify(input),
            }),
          ) as ForgeHttpResponse;
        }
        const response = await fetch(input.url, {
          method: input.method,
          headers: input.headers,
          ...(input.body === undefined ? {} : { body: input.body }),
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
        });
        const chunks: Uint8Array[] = [];
        let length = 0;
        if (response.body)
          for await (const chunk of response.body) {
            length += chunk.length;
            if (length > MAX_BYTES) {
              await response.body.cancel().catch(() => {});
              throw new Error(msg("forge.diffUnavailable"));
            }
            chunks.push(chunk);
          }
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: Buffer.concat(chunks).toString("utf8"),
        };
      } catch {
        throw new Error(msg("forge.networkFailed"));
      }
    };
  }

  async patch(
    location: ProjectLocation,
    path: string,
    before: string | null,
    after: string | null,
    previousPath = path,
  ): Promise<string> {
    return this.temporary(location, { old: before ?? "", new: after ?? "" }, async (dir) => {
      const diff = await this.run(
        location,
        "git",
        ["diff", "--no-index", "--no-ext-diff", "--no-textconv", "--", `${dir}/old`, `${dir}/new`],
        undefined,
        true,
      );
      const hunk = diff.indexOf("@@ ");
      const a = JSON.stringify(`a/${previousPath}`),
        b = JSON.stringify(`b/${path}`);
      const header = `diff --git ${a} ${b}\n${before === null ? "new file mode 100644\n" : after === null ? "deleted file mode 100644\n" : previousPath !== path ? `rename from ${JSON.stringify(previousPath)}\nrename to ${JSON.stringify(path)}\n` : ""}`;
      if (hunk < 0)
        return diff.includes("Binary files")
          ? `${header}Binary files ${a} and ${b} differ\n`
          : before === null || after === null || previousPath !== path
            ? header
            : "";
      return `${header}--- ${before === null ? "/dev/null" : a}\n+++ ${after === null ? "/dev/null" : b}\n${diff.slice(hunk)}`;
    });
  }
}

export function runtimeConfigPath(env: Record<string, string>, ...parts: string[]): string {
  const paths = env.HOME?.startsWith("/") ? posix : { join };
  return paths.join(
    env.XDG_CONFIG_HOME || env.APPDATA || paths.join(env.HOME || homedir(), ".config"),
    ...parts,
  );
}
