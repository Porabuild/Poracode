import { describe, expect, it, vi } from "vitest";
import type { ComputerUseLockedUseStatus } from "@/shared/contracts/computerUse";
import {
  LOCKED_USE_PLUGIN_BUNDLE_PATH,
  LOCKED_USE_RIGHT,
  LOCKED_USE_STATE_PATH,
  resolveLockedComputerUseResourcesDir,
} from "./constants";
import {
  LockedComputerUseService,
  type CommandResult,
  type CommandRunner,
  type LockedComputerUseFileSystem,
} from "./LockedComputerUseService";

function rulePlist(entries: string[], kOfN?: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>class</key>
	<string>rule</string>
	${kOfN === undefined ? "" : `<key>k-of-n</key>\n\t<integer>${kOfN}</integer>`}
	<key>rule</key>
	<array>
${entries.map((entry) => `\t\t<string>${entry}</string>`).join("\n")}
	</array>
	<key>version</key>
	<integer>1</integer>
</dict>
</plist>
`;
}

const INSTALLED_RULE = rulePlist([LOCKED_USE_RIGHT, "use-login-window-ui"], 1);
const STOCK_RULE = rulePlist(["use-login-window-ui"]);
const RESOURCES = "/App/Resources/locked-computer-use";
const INSTALLER = `${RESOURCES}/locked-computer-use-installer`;

const SIGNED_HELPER: ComputerUseLockedUseStatus = {
  supported: true,
  signed: true,
  paused: false,
  active: false,
  screenLocked: false,
};

interface Harness {
  service: LockedComputerUseService;
  runner: ReturnType<typeof vi.fn<CommandRunner>>;
  files: Map<string, string>;
}

function harness(
  options: {
    rule?: string | null;
    pluginVersion?: string;
    rightInstalled?: boolean;
    files?: Record<string, string>;
    helper?: ComputerUseLockedUseStatus | null;
    adminResult?: CommandResult;
    platform?: NodeJS.Platform;
    onAdmin?: (files: Map<string, string>) => void;
  } = {},
): Harness {
  const files = new Map(Object.entries(options.files ?? {}));
  let rule = options.rule === undefined ? STOCK_RULE : options.rule;
  const runner = vi.fn<CommandRunner>(async (file, args) => {
    if (file === INSTALLER && args[0] === "status") {
      const bundleInstalled = files.has(LOCKED_USE_PLUGIN_BUNDLE_PATH);
      const ruleInstalled = rule === INSTALLED_RULE;
      const rightInstalled = bundleInstalled && options.rightInstalled !== false;
      return {
        code: 0,
        stderr: "",
        stdout: JSON.stringify({
          installed: bundleInstalled && ruleInstalled && rightInstalled,
          bundleInstalled,
          ruleInstalled,
          rightInstalled,
          pluginVersion: bundleInstalled ? (options.pluginVersion ?? "1.0.0") : null,
          bundledPluginVersion: "1.0.0",
        }),
      };
    }
    if (file === "/usr/bin/osascript") {
      options.onAdmin?.(files);
      if (options.adminResult?.code === 0 || options.adminResult === undefined) {
        rule = files.has("__rule_installed") ? INSTALLED_RULE : rule;
      }
      return options.adminResult ?? { code: 0, stdout: "", stderr: "" };
    }
    throw new Error(`unexpected command ${file}`);
  });
  const fs: LockedComputerUseFileSystem = {
    exists: (path) => files.has(path),
    readText: (path) => files.get(path) ?? null,
  };
  const service = new LockedComputerUseService({
    resourcesDir: RESOURCES,
    helperStatus: async () => (options.helper === undefined ? SIGNED_HELPER : options.helper),
    platform: options.platform ?? "darwin",
    uid: 501,
    runCommand: runner,
    fs,
  });
  return { service, runner, files };
}

const INSTALLED_FILES: Record<string, string> = {
  [INSTALLER]: "",
  [LOCKED_USE_PLUGIN_BUNDLE_PATH]: "",
  [LOCKED_USE_STATE_PATH]: JSON.stringify({
    schemaVersion: 1,
    pluginVersion: "1.0.0",
    installedAt: "2026-11-04T00:00:00Z",
    backup: "original.plist",
    users: [501],
  }),
};

describe("LockedComputerUseService", () => {
  it("resolves the installer beside the computer-use helper", () => {
    expect(resolveLockedComputerUseResourcesDir("/App/Resources/computer-use-helper")).toBe(
      "/App/Resources/locked-computer-use",
    );
    expect(resolveLockedComputerUseResourcesDir("/repo/resources/computer-use-helper-dev")).toBe(
      "/repo/resources/locked-computer-use",
    );
  });

  it("reports unsupported platforms without running anything", async () => {
    const { service, runner } = harness({ platform: "win32" });
    await expect(service.status()).resolves.toMatchObject({
      platformSupported: false,
      installed: false,
    });
    await expect(service.install()).resolves.toMatchObject({
      ok: false,
      error: "unsupported_platform",
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("derives installed, repair, and helper state from the system", async () => {
    await expect(
      harness({ rule: INSTALLED_RULE, files: INSTALLED_FILES }).service.status(),
    ).resolves.toEqual({
      platformSupported: true,
      installed: true,
      needsRepair: false,
      signed: true,
      paused: false,
      active: false,
    });
    // Bundle present but the login rule was reset by an OS update.
    await expect(
      harness({ rule: STOCK_RULE, files: INSTALLED_FILES }).service.status(),
    ).resolves.toMatchObject({ installed: false, needsRepair: true });
    // Installed for a different console user only.
    await expect(
      harness({
        rule: INSTALLED_RULE,
        files: {
          ...INSTALLED_FILES,
          [LOCKED_USE_STATE_PATH]: JSON.stringify({ schemaVersion: 1, users: [502] }),
        },
      }).service.status(),
    ).resolves.toMatchObject({ installed: false, needsRepair: true });
    // Nothing installed.
    await expect(harness().service.status()).resolves.toMatchObject({
      installed: false,
      needsRepair: false,
    });
    // Helper gone: everything helper-derived reads false.
    await expect(
      harness({ rule: INSTALLED_RULE, files: INSTALLED_FILES, helper: null }).service.status(),
    ).resolves.toMatchObject({ installed: true, signed: false, paused: false });
  });

  it.each(["0.9.0", "2.0.0"])("refuses old/future plug-in version %s", async (pluginVersion) => {
    const { service } = harness({ rule: INSTALLED_RULE, files: INSTALLED_FILES, pluginVersion });
    await expect(service.status()).resolves.toMatchObject({ installed: false, needsRepair: true });
    await expect(service.isInstalledCached()).resolves.toBe(false);
  });

  it("does not submit through a missing or modified private right", async () => {
    const { service } = harness({
      rule: INSTALLED_RULE,
      files: INSTALLED_FILES,
      rightInstalled: false,
    });
    await expect(service.status()).resolves.toMatchObject({ installed: false, needsRepair: true });
  });

  it("refuses to install from an unsigned build before prompting", async () => {
    const { service, runner } = harness({
      files: { [INSTALLER]: "" },
      helper: { ...SIGNED_HELPER, signed: false },
    });
    await expect(service.install()).resolves.toMatchObject({ ok: false, error: "unsigned_build" });
    expect(runner).not.toHaveBeenCalledWith(
      "/usr/bin/osascript",
      expect.anything(),
      expect.anything(),
    );
  });

  it("refuses when the installer is not bundled", async () => {
    const { service, runner } = harness();
    await expect(service.install()).resolves.toMatchObject({
      ok: false,
      error: "installer_missing",
    });
    expect(runner).not.toHaveBeenCalledWith(
      "/usr/bin/osascript",
      expect.anything(),
      expect.anything(),
    );
  });

  it("installs through one administrator prompt and re-reads status", async () => {
    const { service, runner } = harness({
      files: { [INSTALLER]: "" },
      onAdmin: (files) => {
        for (const [path, text] of Object.entries(INSTALLED_FILES)) files.set(path, text);
        files.set("__rule_installed", "");
      },
    });
    await expect(service.install()).resolves.toEqual({
      ok: true,
      status: expect.objectContaining({ installed: true, needsRepair: false }),
    });
    const adminCalls = runner.mock.calls.filter(([file]) => file === "/usr/bin/osascript");
    expect(adminCalls).toHaveLength(1);
    expect(adminCalls[0]?.[1]).toEqual([
      "-e",
      `do shell script "'${INSTALLER}' install --user 501" with administrator privileges`,
    ]);
    await expect(service.isInstalledCached()).resolves.toBe(true);
  });

  it("maps a cancelled prompt and installer failures to typed errors", async () => {
    const cancelled = harness({
      files: { [INSTALLER]: "" },
      adminResult: { code: 1, stdout: "", stderr: "execution error: User canceled. (-128)" },
    });
    await expect(cancelled.service.install()).resolves.toMatchObject({
      ok: false,
      error: "cancelled",
    });
    const unsupported = harness({
      files: { [INSTALLER]: "" },
      adminResult: { code: 1, stdout: "", stderr: "execution error: unsupported rule (3)" },
    });
    await expect(unsupported.service.install()).resolves.toMatchObject({
      ok: false,
      error: "unsupported_rule",
    });
    const rolledBack = harness({
      files: { [INSTALLER]: "" },
      adminResult: { code: 1, stdout: "", stderr: "execution error: rolled back (4)" },
    });
    await expect(rolledBack.service.install()).resolves.toMatchObject({
      ok: false,
      error: "verification_failed",
    });
  });

  it("treats uninstalling something already gone as success", async () => {
    const { service, runner } = harness({
      files: { [INSTALLER]: "" },
      adminResult: { code: 1, stdout: "", stderr: "execution error: not installed (6)" },
    });
    await expect(service.uninstall()).resolves.toMatchObject({ ok: true });
    expect(runner).toHaveBeenCalledWith(
      "/usr/bin/osascript",
      ["-e", `do shell script "'${INSTALLER}' uninstall" with administrator privileges`],
      expect.anything(),
    );
  });

  it("refuses a second prompt while one is open", async () => {
    const gate = Promise.withResolvers<CommandResult>();
    const runner = vi.fn<CommandRunner>(async (file) =>
      file === "/usr/bin/osascript" ? gate.promise : { code: 0, stdout: STOCK_RULE, stderr: "" },
    );
    const service = new LockedComputerUseService({
      resourcesDir: RESOURCES,
      helperStatus: async () => SIGNED_HELPER,
      platform: "darwin",
      uid: 501,
      runCommand: runner,
      fs: { exists: (path) => path === INSTALLER, readText: () => null },
    });
    const first = service.install();
    await vi.waitFor(() =>
      expect(runner).toHaveBeenCalledWith(
        "/usr/bin/osascript",
        expect.anything(),
        expect.anything(),
      ),
    );
    await expect(service.uninstall()).resolves.toMatchObject({ ok: false, error: "busy" });
    gate.resolve({ code: 0, stdout: "", stderr: "" });
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it("caches the installed check for the per-tool gate", async () => {
    let now = 0;
    const { runner } = harness({ rule: INSTALLED_RULE, files: INSTALLED_FILES });
    const service = new LockedComputerUseService({
      resourcesDir: RESOURCES,
      helperStatus: async () => SIGNED_HELPER,
      platform: "darwin",
      uid: 501,
      runCommand: runner,
      fs: {
        exists: (path) => path in INSTALLED_FILES,
        readText: (path) => INSTALLED_FILES[path] ?? null,
      },
      now: () => now,
      installedCacheMs: 1_000,
    });
    await expect(service.isInstalledCached()).resolves.toBe(true);
    await expect(service.isInstalledCached()).resolves.toBe(true);
    expect(runner).toHaveBeenCalledTimes(1);
    now = 2_000;
    await expect(service.isInstalledCached()).resolves.toBe(true);
    expect(runner).toHaveBeenCalledTimes(2);
  });
});
