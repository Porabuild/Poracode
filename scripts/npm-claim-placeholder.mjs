#!/usr/bin/env node
/**
 * Maintainer helper: claim the unscoped `poracode` npm name before the first
 * release publishes the real launcher. npm trusted publishing (OIDC) can only
 * be configured for a package that already exists, so the first version must
 * come from a maintainer account (2FA, `npm login`).
 *
 * The placeholder is `0.0.0`: its `poracode` bin explains where to get the CLI
 * and exits non-zero, so `npx poracode` never runs anything else under this
 * name. The first real release supersedes `latest`; deprecate 0.0.0 afterwards.
 *
 * Usage:
 *   node scripts/npm-claim-placeholder.mjs            # build + `npm pack --dry-run`
 *   node scripts/npm-claim-placeholder.mjs --publish  # publish it (prompts for OTP)
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PLACEHOLDER_VERSION = "0.0.0";

export const PLACEHOLDER_BIN = `#!/usr/bin/env node
process.stderr.write(
  "This is a placeholder for the Poracode CLI; no release has been published to npm yet.\\n" +
    "Install it with: curl -fsSL https://poracode.com/install.sh | sh\\n" +
    "Windows: irm https://poracode.com/install.ps1 | iex\\n" +
    "Or download the desktop app: https://poracode.com/download\\n",
);
process.exit(1);
`;

export function writePlaceholderPackage(directory) {
  mkdirSync(join(directory, "bin"), { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    `${JSON.stringify(
      {
        name: "poracode",
        version: PLACEHOLDER_VERSION,
        description:
          "Placeholder for the Poracode CLI. Real releases are published from GitHub Actions.",
        homepage: "https://poracode.com/",
        license: "Apache-2.0",
        repository: { type: "git", url: "https://github.com/Porabuild/Poracode" },
        bin: { poracode: "./bin/poracode.mjs" },
        files: ["bin", "README.md"],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(directory, "bin", "poracode.mjs"), PLACEHOLDER_BIN, { mode: 0o755 });
  writeFileSync(
    join(directory, "README.md"),
    "# poracode\n\nPlaceholder for the [Poracode](https://poracode.com) CLI. Install it with\n" +
      "`curl -fsSL https://poracode.com/install.sh | sh` (Windows: " +
      "`irm https://poracode.com/install.ps1 | iex`).\n",
  );
  return directory;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const publish = process.argv.includes("--publish");
  const directory = writePlaceholderPackage(mkdtempSync(join(tmpdir(), "poracode-placeholder-")));
  try {
    const args = publish ? ["publish", "--access", "public"] : ["pack", "--dry-run"];
    const result = spawnSync("npm", args, {
      cwd: directory,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
    process.stdout.write(
      publish
        ? "\nPublished poracode@0.0.0. Next, with npm >= 11.15 and 2FA (npm allows up to 10\n" +
            "trusted publishers per package; one dispatched publish-npm.yml keeps a single\n" +
            "entry to audit):\n" +
            "  npm trust github poracode --file publish-npm.yml --repo Porabuild/Poracode --allow-publish\n" +
            "Then set the repository variable NPM_PUBLISH_ENABLED=true.\n"
        : "\nDry run only. Re-run with --publish while logged in as a maintainer.\n",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
