import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCommandOutputAsync } from "./processRuntime";
import { quotePowerShellLiteral } from "./shellBasics";

const payload = "isolated installer checksum fixture";

export function createWindowsInstallerModuleFixture(
  installer: { readonly binary: string; readonly args: readonly string[] } | undefined,
  installerUrl: string,
) {
  const tempDirs: string[] = [];
  const servers: Server[] = [];

  async function cleanup() {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  }

  async function runInstaller(polluted: boolean, previous = false) {
    const root = mkdtempSync(join(tmpdir(), "windows installer modules "));
    tempDirs.push(root);
    const fixture = join(root, "downloaded binary");
    writeFileSync(fixture, payload);

    // A newer edition's Utility module shadows Windows PowerShell's module.
    const modulePath = join(root, "modules");
    const utility = join(modulePath, "Microsoft.PowerShell.Utility", "7.0.0.0");
    mkdirSync(utility, { recursive: true });
    writeFileSync(
      join(utility, "Microsoft.PowerShell.Utility.psd1"),
      "@{ GUID = '1DA87E53-152B-403E-98DC-74D7B4D63D59'; ModuleVersion = '7.0.0.0'; PowerShellVersion = '3.0'; CompatiblePSEditions = @('Core'); NestedModules = @('Microsoft.PowerShell.Commands.Utility.dll'); CmdletsToExport = @('Invoke-RestMethod', 'Invoke-Expression', 'Get-FileHash'); FunctionsToExport = @() }",
    );

    // The command reader overlays process.env, so omission would inherit this key.
    const modulePathKey =
      Object.keys(process.env).find((key) => key.toLowerCase() === "psmodulepath") ??
      "PSModulePath";
    const env = {
      [modulePathKey]: [
        ...(polluted ? [modulePath] : []),
        join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/Modules"),
      ].join(";"),
    };

    // Keep the real irm/iex commands: replacing their PowerShell functions can
    // load the native Utility module and hide the original failure.
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
    if (!installer) throw new Error("Missing Windows installer");
    const command = previous ? `irm ${installerUrl} | iex` : installer.args.at(-1);
    if (!command) throw new Error("Missing Windows installer command");
    return readCommandOutputAsync(
      installer.binary,
      [
        ...installer.args.slice(0, -1),
        command.replace(installerUrl, `http://127.0.0.1:${address.port}/install.ps1`),
      ],
      { env, timeout: 10_000 },
    );
  }

  return {
    runInstaller,
    cleanup,
    sha256: createHash("sha256").update(payload).digest("hex").toUpperCase(),
  };
}
