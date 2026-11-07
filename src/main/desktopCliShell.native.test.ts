import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerPosixDesktopCli } from "./desktopCliRegistration";
import { registerPosixDesktopCliForShell } from "./desktopCliShell";

vi.mock("./desktopCliRegistration", () => ({
  registerPosixDesktopCli: vi.fn<typeof registerPosixDesktopCli>(),
}));

// Run the actual installed shells against disposable startup files. Registration
// is replaced so global PATH directories and the real profile cannot be changed.
describe.skipIf(process.platform === "win32")("native shell PATH discovery", () => {
  let root: string;
  beforeEach(() => {
    mkdirSync(resolve("tmp"), { recursive: true });
    root = mkdtempSync(resolve("tmp/cli shell's home-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const shells = ["/bin/bash", "/bin/zsh", "/opt/homebrew/bin/fish", "/usr/bin/fish"].filter(
    existsSync,
  );
  for (const shell of shells) {
    it(`makes the fallback command available in new login and interactive ${shell} shells`, async () => {
      const bin = join(root, ".local", "bin");
      const command = `poracode-native-path-fixture-${process.pid}`;
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, command), '#!/bin/sh\nprintf "%s\\n" "$@"\n', {
        mode: 0o755,
      });
      vi.mocked(registerPosixDesktopCli).mockReturnValue({
        state: "registered",
        commandName: command,
        launcherPath: join(root, "launcher"),
        linkPath: join(bin, command),
        detail: "registered fixture",
      });
      const env = {
        HOME: root,
        SHELL: shell,
        ZDOTDIR: root,
        XDG_CONFIG_HOME: join(root, ".config"),
        PATH: "/usr/bin:/bin",
        TERM: "dumb",
      };
      if (shell.endsWith("fish")) {
        mkdirSync(join(root, ".config", "fish"), { recursive: true });
        writeFileSync(join(root, ".config", "fish", "config.fish"), "set -gx PATH /usr/bin /bin\n");
      }
      await registerPosixDesktopCliForShell({
        resourcesDir: root,
        executablePath: join(root, "app"),
        appVersion: "2.0.0",
        electronVersion: "44.4.4",
        channel: "nightly",
        appDataDir: root,
        homeDirectory: root,
        path: env.PATH,
        env,
      });
      for (const mode of ["-lic", "-ic"]) {
        const output = execFileSync(
          shell,
          [mode, `command -v ${command}; ${command} --one 'two words'`],
          { env, cwd: root, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] },
        );
        expect(output).toContain(join(bin, command));
        expect(output).toContain("--one\ntwo words\n");
      }
      const profile = shell.endsWith("fish")
        ? join(root, ".config", "fish", "config.fish")
        : join(root, shell.endsWith("zsh") ? ".zshrc" : ".bashrc");
      expect(readFileSync(profile, "utf8")).toContain("Poracode desktop CLI PATH v1");
    });
  }
});
