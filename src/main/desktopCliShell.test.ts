import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerPosixDesktopCli } from "./desktopCliRegistration";
import { registerPosixDesktopCliForShell } from "./desktopCliShell";

const probe = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<{ stdout: string }>>());
vi.mock("node:child_process", () => ({ execFile: probe }));
vi.mock("node:util", () => ({ promisify: () => probe }));
vi.mock("./desktopCliRegistration", () => ({
  registerPosixDesktopCli: vi.fn<typeof registerPosixDesktopCli>(),
}));

describe.skipIf(process.platform === "win32")("desktop CLI shell setup", () => {
  let root: string;
  let input: Parameters<typeof registerPosixDesktopCliForShell>[0];
  beforeEach(() => {
    vi.clearAllMocks();
    mkdirSync(resolve("tmp"), { recursive: true });
    root = mkdtempSync(resolve("tmp/desktop-cli-shell-"));
    input = {
      resourcesDir: join(root, "Resources"),
      executablePath: join(root, "Poracode"),
      appVersion: "2.0.0",
      electronVersion: "44.4.4",
      channel: "stable",
      appDataDir: root,
      homeDirectory: root,
      path: "/usr/bin:/bin",
      env: { HOME: root, SHELL: "/bin/zsh" },
    };
    probe.mockResolvedValue({ stdout: "\n__PORACODE_CLI_PATH__\n/usr/bin:/bin\n" });
    vi.mocked(registerPosixDesktopCli).mockReturnValue({
      state: "unavailable",
      commandName: "poracode",
      launcherPath: join(root, "poracode"),
      detail: "unavailable",
    });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function useFallback() {
    const bin = join(root, ".local", "bin");
    mkdirSync(bin, { recursive: true });
    vi.mocked(registerPosixDesktopCli).mockReturnValue({
      state: "registered",
      commandName: "poracode",
      launcherPath: join(root, "poracode"),
      linkPath: join(bin, "poracode"),
      detail: "registered",
    });
    return bin;
  }

  it("uses the interactive login PATH despite shell banners and Finder's minimal PATH", async () => {
    probe.mockResolvedValue({
      stdout: "Welcome!\n\n__PORACODE_CLI_PATH__\n/opt/homebrew/bin:/usr/bin:/bin\n",
    });
    await registerPosixDesktopCliForShell(input);
    expect(probe).toHaveBeenCalledWith(
      "/bin/zsh",
      ["-lic", expect.stringContaining("/usr/bin/printenv PATH")],
      expect.objectContaining({ cwd: root, timeout: 6_000, env: input.env }),
    );
    expect(registerPosixDesktopCli).toHaveBeenCalledWith(
      expect.objectContaining({ path: `/opt/homebrew/bin:/usr/bin:/bin:${root}/.local/bin` }),
    );
    expect(existsSync(join(root, ".zshrc"))).toBe(false);
  });

  it("falls back to the inherited PATH when shell startup fails", async () => {
    probe.mockRejectedValue(new Error("shell startup timed out"));
    await registerPosixDesktopCliForShell(input);
    expect(registerPosixDesktopCli).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${input.path}:${root}/.local/bin` }),
    );
  });

  it("appends zsh setup once, preserving the user's existing configuration", async () => {
    useFallback();
    const profile = join(root, ".zshrc");
    writeFileSync(profile, "# user settings\nexport EDITOR=vim");
    await registerPosixDesktopCliForShell(input);
    const first = readFileSync(profile, "utf8");
    await registerPosixDesktopCliForShell(input);
    expect(first).toContain("# user settings\nexport EDITOR=vim\n");
    expect(first).toContain('export PATH="$PATH:$HOME/.local/bin"');
    expect(readFileSync(profile, "utf8")).toBe(first);
  });

  it("honors ZDOTDIR discovered inside zsh startup", async () => {
    useFallback();
    const config = join(root, "zsh settings");
    probe.mockResolvedValue({
      stdout: `\n__PORACODE_CLI_PATH__\n/usr/bin:/bin\n__PORACODE_CLI_CONFIG__${config}\n`,
    });
    await registerPosixDesktopCliForShell(input);
    expect(readFileSync(join(config, ".zshrc"), "utf8")).toContain("Poracode desktop CLI PATH");
    expect(existsSync(join(root, ".zshrc"))).toBe(false);
  });

  it("appends fish setup at the shell's actual config directory", async () => {
    useFallback();
    const config = join(root, "custom config", "fish");
    probe.mockResolvedValue({
      stdout: `\n__PORACODE_CLI_PATH__\n/usr/bin:/bin\n__PORACODE_CLI_CONFIG__${config}\n`,
    });
    await registerPosixDesktopCliForShell({ ...input, env: { ...input.env, SHELL: "/bin/fish" } });
    expect(readFileSync(join(config, "config.fish"), "utf8")).toContain(
      'fish_add_path --path --append "$HOME/.local/bin"',
    );
    expect(existsSync(join(root, ".zshrc"))).toBe(false);
  });

  it("sets up bash login and interactive startup without hiding an existing .profile", async () => {
    useFallback();
    writeFileSync(join(root, ".profile"), "# existing login settings\n");
    await registerPosixDesktopCliForShell({ ...input, env: { ...input.env, SHELL: "/bin/bash" } });
    for (const name of [".profile", ".bashrc"])
      expect(readFileSync(join(root, name), "utf8")).toContain("Poracode desktop CLI PATH");
    expect(existsSync(join(root, ".bash_profile"))).toBe(false);
  });

  it("does not change shell files when a collision prevents registration", async () => {
    vi.mocked(registerPosixDesktopCli).mockReturnValue({
      state: "collision",
      commandName: "poracode",
      launcherPath: join(root, "poracode"),
      detail: "preserved existing command",
    });
    await registerPosixDesktopCliForShell(input);
    expect(existsSync(join(root, ".zshrc"))).toBe(false);
  });

  it("leaves configured user-bin paths alone and avoids shell file writes", async () => {
    const bin = useFallback();
    probe.mockResolvedValue({ stdout: `\n__PORACODE_CLI_PATH__\n${bin}:/usr/bin:/bin\n` });
    await registerPosixDesktopCliForShell(input);
    expect(existsSync(join(root, ".zshrc"))).toBe(false);
  });

  it("preserves linked shell configuration instead of overwriting its target", async () => {
    useFallback();
    const target = join(root, "dotfiles");
    writeFileSync(target, "# preserved settings\n");
    symlinkSync(target, join(root, ".zshrc"));
    await expect(registerPosixDesktopCliForShell(input)).rejects.toThrow(/ELOOP/u);
    expect(readFileSync(target, "utf8")).toBe("# preserved settings\n");
  });

  it("does not configure a fallback for unsupported shells", async () => {
    await registerPosixDesktopCliForShell({ ...input, env: { ...input.env, SHELL: "/bin/nu" } });
    expect(registerPosixDesktopCli).toHaveBeenCalledWith(
      expect.not.objectContaining({ fallbackDirectory: expect.anything() }),
    );
  });
});
