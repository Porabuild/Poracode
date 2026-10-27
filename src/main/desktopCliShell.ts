import { execFile } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { homedir, userInfo } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { registerPosixDesktopCli } from "./desktopCliRegistration";

const execFileAsync = promisify(execFile);
const PATH_MARKER = "__PORACODE_CLI_PATH__";
const CONFIG_MARKER = "__PORACODE_CLI_CONFIG__";
// Additive shell startup snippets, independent of registration format 1.
const SHELL_PATH_MARKER = "# Poracode desktop CLI PATH v1";

/** Finder's environment omits PATH additions from login/interactive startup files. */
export async function registerPosixDesktopCliForShell(
  input: Parameters<typeof registerPosixDesktopCli>[0] & {
    readonly env: NodeJS.ProcessEnv;
    readonly homeDirectory?: string;
  },
) {
  const home = input.homeDirectory ?? homedir();
  const shell =
    input.env.SHELL ||
    userInfo().shell ||
    (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
  const shellName = basename(shell);
  const supportsFallback = ["zsh", "bash", "fish"].includes(shellName);
  const fallback = join(home, ".local", "bin");
  let path = input.path;
  let configDirectory =
    shellName === "fish"
      ? join(input.env.XDG_CONFIG_HOME || join(home, ".config"), "fish")
      : input.env.ZDOTDIR || home;
  try {
    const configVariable = shellName === "fish" ? "$__fish_config_dir" : "$ZDOTDIR";
    const { stdout } = await execFileAsync(
      shell,
      [
        "-lic",
        `printf '\\n${PATH_MARKER}\\n'; /usr/bin/printenv PATH; printf '${CONFIG_MARKER}%s\\n' "${configVariable}"`,
      ],
      { env: input.env, cwd: home, encoding: "utf8", timeout: 6_000, maxBuffer: 64 * 1024 },
    );
    const lines = stdout.split(/\r?\n/u);
    const marker = lines.lastIndexOf(PATH_MARKER);
    const shellPath = marker >= 0 ? lines[marker + 1] : undefined;
    if (shellPath) path = shellPath;
    const shellConfig = lines.findLast((line) => line.startsWith(CONFIG_MARKER));
    const directory = shellConfig?.slice(CONFIG_MARKER.length);
    if (directory && isAbsolute(directory)) configDirectory = directory;
  } catch {
    // Broken or slow shell startup must not prevent registration or app startup.
  }
  const result = registerPosixDesktopCli({
    ...input,
    // Include an existing fallback in collision checks and in-place upgrade repair.
    path: supportsFallback ? `${path}:${fallback}` : path,
    ...(supportsFallback
      ? {
          fallbackDirectory: fallback,
          // Version managers and virtualenvs add disposable directories to PATH.
          // Never publish a durable command into one of those shell sessions.
          installationDirectories: [
            fallback,
            join(home, "bin"),
            "/usr/local/bin",
            "/opt/homebrew/bin",
          ],
        }
      : {}),
  });
  if (
    result.state === "registered" &&
    result.linkPath &&
    existsSync(fallback) &&
    dirname(result.linkPath) === realpathSync.native(fallback) &&
    !path.split(":").includes(fallback)
  ) {
    const profiles =
      shellName === "fish"
        ? [join(configDirectory, "config.fish")]
        : shellName === "zsh"
          ? [join(configDirectory, ".zshrc")]
          : [
              [".bash_profile", ".bash_login", ".profile"]
                .map((name) => join(home, name))
                .find(existsSync) ?? join(home, ".bash_profile"),
              join(home, ".bashrc"),
            ];
    const snippet =
      shellName === "fish"
        ? 'fish_add_path --path --append "$HOME/.local/bin"'
        : 'case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$PATH:$HOME/.local/bin" ;; esac';
    for (const profile of profiles) appendShellPath(profile, snippet);
  }
  return result;
}

function appendShellPath(profile: string, snippet: string): void {
  mkdirSync(dirname(profile), { recursive: true });
  const fd = openSync(
    profile,
    constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
    0o644,
  );
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.uid !== process.getuid?.() || info.size > 1024 * 1024)
      throw new Error(`Desktop CLI cannot safely append PATH setup to ${profile}.`);
    const contents = readFileSync(fd, "utf8");
    if (!contents.split(/\r?\n/u).includes(snippet))
      writeFileSync(fd, `\n${SHELL_PATH_MARKER}\n${snippet}\n`);
  } finally {
    closeSync(fd);
  }
}
