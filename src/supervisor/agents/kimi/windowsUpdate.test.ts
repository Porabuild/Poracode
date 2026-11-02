import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCommandOutputAsync } from "../base/processRuntime";
import { quotePowerShellLiteral } from "../base/shellBasics";
import { kimiDetectionSpec } from "./detection";

const installerUrl = "https://code.kimi.com/kimi-code/install.ps1";
const payload = "isolated installer checksum fixture";

describe.runIf(process.platform === "win32")("Kimi Windows updater modules", () => {
  const tempDirs: string[] = [];
  const servers: Server[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  async function runInstaller(polluted: boolean, previous = false) {
    const root = mkdtempSync(join(tmpdir(), "kimi update modules "));
    tempDirs.push(root);
    const fixture = join(root, "downloaded binary");
    writeFileSync(fixture, payload);

    // A newer edition's Utility module shadows Windows PowerShell's module.
    // No PowerShell 7 installation or real Kimi binary is needed on the runner.
    const modulePath = join(root, "modules");
    const utility = join(modulePath, "Microsoft.PowerShell.Utility", "7.0.0.0");
    mkdirSync(utility, { recursive: true });
    writeFileSync(
      join(utility, "Microsoft.PowerShell.Utility.psd1"),
      "@{ GUID = '1DA87E53-152B-403E-98DC-74D7B4D63D59'; ModuleVersion = '7.0.0.0'; PowerShellVersion = '3.0'; CompatiblePSEditions = @('Core'); RootModule = 'Utility.psm1'; FunctionsToExport = @('Get-FileHash') }",
    );
    writeFileSync(
      join(utility, "Utility.psm1"),
      "throw 'This fixture represents an incompatible Core module'; function Get-FileHash { throw 'wrong edition' }",
    );

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string" && key.toLowerCase() !== "psmodulepath") env[key] = value;
    }
    if (polluted) {
      env.PSModulePath = [
        modulePath,
        join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/Modules"),
      ].join(";");
    }

    // Serve an inert checksum step locally. Keep the real irm/iex commands:
    // replacing their PowerShell functions can itself load the native Utility
    // module and hide the original failure. Only the download URL changes.
    const script = `$ErrorActionPreference = 'Stop'; (Get-FileHash -LiteralPath ${quotePowerShellLiteral(fixture)} -Algorithm SHA256).Hash`;
    const server = createServer((_request, response) => {
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(script);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing installer server port");
    const installer = kimiDetectionSpec.update?.installer?.windows;
    if (!installer) throw new Error("Missing Kimi Windows installer");
    const command = previous ? `irm ${installerUrl} | iex` : installer.args.at(-1);
    if (!command) throw new Error("Missing Kimi Windows installer command");
    return readCommandOutputAsync(
      installer.binary,
      [
        ...installer.args.slice(0, -1),
        command.replace(installerUrl, `http://127.0.0.1:${address.port}/install.ps1`),
      ],
      { env, timeout: 10_000 },
    );
  }

  it("reproduces the released updater's checksum failure with Core modules first", async () => {
    const result = await runInstaller(true, true);
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("Get-FileHash");
  });

  it.each([true, false])(
    "checks the installer payload with polluted module path: %s",
    async (polluted) => {
      const result = await runInstaller(polluted);
      expect(result).toEqual({
        ok: true,
        stdout: createHash("sha256").update(payload).digest("hex").toUpperCase(),
        stderr: "",
      });
    },
  );
});
