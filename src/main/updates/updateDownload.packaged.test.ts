import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("creates updater cancellation tokens in a bundle without unpackaged dependencies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "poracode-packaged-updater-"));
  const bundledPath = join(directory, "updateDownload.cjs");
  try {
    await build({
      entryPoints: [fileURLToPath(new URL("./updateDownload.ts", import.meta.url))],
      outfile: bundledPath,
      bundle: true,
      platform: "node",
      format: "cjs",
      define: { "import.meta.url": JSON.stringify(pathToFileURL(bundledPath).href) },
      plugins: [
        {
          name: "electron-runtime",
          setup(builder) {
            // Electron supplies this module in the shipped app. Token creation
            // does not need its app or native updater; npm modules must be bundled.
            builder.onResolve({ filter: /^electron$/ }, () => ({
              path: "electron",
              namespace: "electron-runtime",
            }));
            builder.onLoad({ filter: /.*/, namespace: "electron-runtime" }, () => ({
              contents: "module.exports = {};",
              loader: "js",
            }));
          },
        },
      ],
    });
    // Use a fresh Node process so Vitest's resolver cannot supply the checkout's
    // dependencies to the otherwise self-contained shipped bundle.
    const output = execFileSync(
      process.execPath,
      [
        "--eval",
        `
          const assert = require("node:assert/strict");
          const requireFromBundle = require("node:module").createRequire(process.argv[1]);
          assert.throws(() => requireFromBundle.resolve("electron-updater"), { code: "MODULE_NOT_FOUND" });
          const token = requireFromBundle(process.argv[1]).createUpdaterCancellationToken();
          assert.equal(token.cancelled, false);
          token.cancel();
          console.log(token.cancelled);
        `,
        bundledPath,
      ],
      {
        cwd: directory,
        env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" },
        encoding: "utf8",
      },
    );

    expect(output.trim()).toBe("true");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
