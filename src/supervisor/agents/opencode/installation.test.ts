import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openCodeDetectionSpec } from "./detection";
import { OPENCODE_INSTALL_COMMANDS } from "@/renderer/components/providers/opencode/installCommands";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runInstaller(failure = "") {
  mkdirSync("tmp", { recursive: true });
  const root = mkdtempSync(join(process.cwd(), "tmp", "opencode-install-"));
  roots.push(root);
  const home = join(root, "home with spaces");
  const tools = join(root, "tools");
  mkdirSync(tools);
  writeFileSync(
    join(tools, "npm"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$HOME/commands"
if [ "$1" = install ]; then
  [ "$FAILURE" != install ] || exit 17
  mkdir -p "$HOME/.opencode2/node_modules/@opencode/cli/bin"
  printf '#!/bin/sh\\nexit 1\\n' > "$HOME/.opencode2/node_modules/@opencode/cli/bin/opencode.exe"
else
  [ "$FAILURE" != postinstall ] || exit 18
  if [ "$FAILURE" = version ]; then exit 0; fi
  printf '#!/bin/sh\\necho "opencode v2.4.1"\\n' > "$HOME/.opencode2/node_modules/@opencode/cli/bin/opencode.exe"
fi
chmod +x "$HOME/.opencode2/node_modules/@opencode/cli/bin/opencode.exe"
`,
    { mode: 0o755 },
  );
  mkdirSync(home);
  const installer = openCodeDetectionSpec.update!.installer!.posix;
  const result = spawnSync(installer.binary, installer.args, {
    env: { ...process.env, HOME: home, PATH: `${tools}:${process.env.PATH}`, FAILURE: failure },
    encoding: "utf8",
  });
  return { result, commands: readFileSync(join(home, "commands"), "utf8") };
}

describe.skipIf(process.platform === "win32")("OpenCode managed installation", () => {
  it("finishes a lifecycle-blocked install and verifies the managed executable", () => {
    const { result, commands } = runInstaller();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("opencode v2.4.1");
    expect(commands).toContain("install --ignore-scripts --include=optional --prefix");
    expect(commands).toContain("@opencode/cli@^2.4.1");
    expect(commands.trim().split("\n")).toHaveLength(2);
    expect(commands).toContain("run postinstall");
  });

  it.each([
    ["install", 17, 1],
    ["postinstall", 18, 2],
    ["version", 1, 2],
  ] as const)("reports %s failure instead of success", (failure, code, calls) => {
    const { result, commands } = runInstaller(failure);
    expect(result.status).toBe(code);
    expect(result.stdout).not.toContain("opencode v");
    expect(commands.trim().split("\n")).toHaveLength(calls);
  });
});

it("keeps native install commands aligned with the supervisor updater on both platforms", () => {
  const installers = openCodeDetectionSpec.update!.installer!;
  expect(OPENCODE_INSTALL_COMMANDS.posix).toBe(installers.posix.args.at(-1));
  expect(OPENCODE_INSTALL_COMMANDS.windows).toBe(installers.windows.args.at(-1));
});
