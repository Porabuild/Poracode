import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCursorAgentCommand,
  buildCursorArgvSpec,
  resolveCursorWindowsLaunch,
} from "./windowsExecutable";

describe.skipIf(process.platform !== "win32")("Cursor Windows executable resolution", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeInstall(): {
    root: string;
    shim: string;
    node: string;
    script: string;
  } {
    const root = mkdtempSync(join(tmpdir(), "poracode-cursor-launch-"));
    tempDirs.push(root);
    const shim = join(root, "cursor-agent.cmd");
    writeFileSync(shim, "@echo off\r\n");
    const oldDir = join(root, "versions", "2026.07.08-0c04a8a");
    const latestDir = join(root, "versions", "2026.07.09-a3815c0");
    mkdirSync(oldDir, { recursive: true });
    mkdirSync(latestDir, { recursive: true });
    writeFileSync(join(oldDir, "node.exe"), "old");
    writeFileSync(join(oldDir, "index.js"), "old");
    const node = join(latestDir, "node.exe");
    const script = join(latestDir, "index.js");
    writeFileSync(node, "node");
    writeFileSync(script, "script");
    return { root, shim, node, script };
  }

  it("resolves the installer shim to the newest bundled Node entrypoint", () => {
    const install = makeInstall();

    expect(resolveCursorWindowsLaunch(install.shim)).toMatchObject({
      binary: install.node,
      argsPrefix: [install.script],
      env: { CURSOR_INVOKED_AS: "cursor-agent.cmd" },
    });
  });

  it("builds probes and launches without a PowerShell or cmd wrapper", () => {
    const install = makeInstall();
    const location = { kind: "windows" as const, path: install.root };

    const command = buildCursorAgentCommand(location, ["--version"], install.shim);
    expect(command.command).toBe(install.node);
    expect(command.args).toEqual([install.script, "--version"]);

    const argv = buildCursorArgvSpec(location, ["acp"], install.shim);
    expect(argv.binary).toBe(install.node);
    expect(argv.args).toEqual([install.script, "acp"]);
  });

  it("falls back when the installer has no complete runnable version", () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-cursor-launch-"));
    tempDirs.push(root);
    const shim = join(root, "cursor-agent.cmd");
    writeFileSync(shim, "@echo off\r\n");
    mkdirSync(join(root, "versions", "2026.07.09-a3815c0"), { recursive: true });

    expect(resolveCursorWindowsLaunch(shim)).toBeUndefined();
  });
});
