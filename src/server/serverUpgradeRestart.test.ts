import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveServerServiceTarget,
  ServerUpgradeServiceTargetError,
  startServerService,
} from "./serverUpgradeRestart";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function unitFixture(execStart: string): {
  fragment: string;
  run: (command: string, args: readonly string[]) => string;
} {
  const dir = mkdtempSync(join(tmpdir(), "poracode-upgrade-unit-"));
  dirs.push(dir);
  const fragment = join(dir, "poracode-server.service");
  writeFileSync(
    fragment,
    [
      "[Unit]",
      "Description=Poracode server",
      "[Service]",
      execStart,
      "[Install]",
      "WantedBy=multi-user.target",
      "",
    ].join("\n"),
  );
  return {
    fragment,
    run: (command, args) => {
      if (command === "systemctl" && args[0] === "show") return `${fragment}\n`;
      return "";
    },
  };
}

describe("upgrade service targeting (D4)", () => {
  it("never touches the global service for an unrelated custom prefix", () => {
    let calls = 0;
    const target = resolveServerServiceTarget({
      prefix: "/srv/poracode",
      platform: "linux",
      run: () => {
        calls += 1;
        return "";
      },
    });
    expect(target).toEqual({ kind: "direct", unit: null });
    expect(calls).toBe(0);
  });

  it("uses the shipped unit only when ExecStart launches this prefix", () => {
    const { run } = unitFixture("ExecStart=/usr/bin/node /opt/poracode/current/lib/server.cjs");
    expect(resolveServerServiceTarget({ prefix: "/opt/poracode", platform: "linux", run })).toEqual(
      {
        kind: "systemd",
        unit: "poracode-server",
      },
    );
    // systemd line continuations are folded before matching.
    const continued = unitFixture(
      "ExecStart=/usr/bin/node \\\n  /opt/poracode/current/lib/server.cjs",
    );
    expect(
      resolveServerServiceTarget({
        prefix: "/opt/poracode",
        platform: "linux",
        run: continued.run,
      }),
    ).toEqual({ kind: "systemd", unit: "poracode-server" });
  });

  it("fails closed when the installed unit launches a different path", () => {
    const { run } = unitFixture("ExecStart=/usr/bin/node /opt/other/current/lib/server.cjs");
    expect(() =>
      resolveServerServiceTarget({ prefix: "/opt/poracode", platform: "linux", run }),
    ).toThrow(ServerUpgradeServiceTargetError);
    const unrelated = unitFixture("ExecStart=/usr/bin/node /srv/other/server.cjs");
    expect(() =>
      resolveServerServiceTarget({
        prefix: "/opt/poracode",
        platform: "linux",
        run: unrelated.run,
      }),
    ).toThrow(/different path/u);
  });

  it("refuses a unit that only mentions the prefix entrypoint as an argument (F7)", () => {
    const { run } = unitFixture(
      'ExecStart=/bin/sh -c "exec /opt/other/server.cjs --watch /opt/poracode/current/lib/server.cjs"',
    );
    expect(() =>
      resolveServerServiceTarget({ prefix: "/opt/poracode", platform: "linux", run }),
    ).toThrow(ServerUpgradeServiceTargetError);
    const otherScript = unitFixture(
      "ExecStart=/usr/bin/node /srv/other/server.cjs /opt/poracode/current/lib/server.cjs",
    );
    expect(() =>
      resolveServerServiceTarget({
        prefix: "/opt/poracode",
        platform: "linux",
        run: otherScript.run,
      }),
    ).toThrow(ServerUpgradeServiceTargetError);
  });

  it("accepts shell, env and quoted forms that launch the exact entrypoint (F7)", () => {
    const shell = unitFixture(
      'ExecStart=/bin/sh -c "exec /usr/bin/node /opt/poracode/current/lib/server.cjs"',
    );
    expect(
      resolveServerServiceTarget({ prefix: "/opt/poracode", platform: "linux", run: shell.run }),
    ).toEqual({ kind: "systemd", unit: "poracode-server" });
    const env = unitFixture(
      "ExecStart=/usr/bin/env NODE_ENV=production /usr/bin/node /opt/poracode/current/lib/server.cjs",
    );
    expect(
      resolveServerServiceTarget({ prefix: "/opt/poracode", platform: "linux", run: env.run }),
    ).toEqual({ kind: "systemd", unit: "poracode-server" });
    const quoted = unitFixture('ExecStart=/usr/bin/node "/opt/poracode/current/lib/server.cjs"');
    expect(
      resolveServerServiceTarget({ prefix: "/opt/poracode", platform: "linux", run: quoted.run }),
    ).toEqual({ kind: "systemd", unit: "poracode-server" });
  });

  it("treats a missing unit as an unmanaged direct install", () => {
    const target = resolveServerServiceTarget({
      prefix: "/opt/poracode",
      platform: "linux",
      run: () => "",
    });
    expect(target).toEqual({ kind: "direct", unit: null });
    const missing = resolveServerServiceTarget({
      prefix: "/opt/poracode",
      platform: "linux",
      run: () => {
        throw new Error("systemctl unavailable");
      },
    });
    expect(missing).toEqual({ kind: "direct", unit: null });
  });

  it("spawns a direct candidate with the staging admission contract", async () => {
    const prefix = mkdtempSync(join(tmpdir(), "poracode-upgrade-spawn-"));
    dirs.push(prefix);
    const lib = join(prefix, "current", "lib");
    mkdirSync(lib, { recursive: true });
    const marker = join(prefix, "staging-env.txt");
    writeFileSync(
      join(lib, "server.cjs"),
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, ` +
        `String(process.env.PORACODE_UPGRADE_STAGING ?? "unset"));\n`,
    );
    const child = await startServerService({ kind: "direct", unit: null }, prefix, {
      staging: true,
    });
    expect(child?.pid).toBeGreaterThan(0);
    const deadline = Date.now() + 10_000;
    while (!readFileSyncSafe(marker) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(readFileSync(marker, "utf8")).toBe("1");
    expect(readFileSync(join(prefix, "poracode-server.pid"), "utf8").trim()).toBe(
      String(child?.pid),
    );
  });
});

function readFileSyncSafe(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
