#!/usr/bin/env node
/**
 * Pack and publish the exact qualified `poracode` launcher (plan D3/D1).
 *
 * The npm package must never be built from a rebuild: this script consumes the
 * qualified `server-artifact.json` files plus the combined
 * `poracode-runtime-manifest.json` the artifact workflow emitted, verifies they
 * agree, copies the manifest into a staging copy of `packages/poracode-cli`,
 * packs that exact tree, and only then publishes it. It never edits the
 * checkout and never re-resolves a version from the registry.
 *
 * `--dry-run` performs every verification and the real `npm pack` but stops
 * before the registry preflight and publication, which is how the review and
 * local checks exercise the pipeline without publishing anything.
 *
 * Publication authorization is intentionally external: the release workflow
 * gates this on `vars.NPM_PUBLISH_ENABLED` and an `id-token: write` job
 * (npm trusted publishing). The preflight below fails with an actionable
 * message when the name exists but the current credentials cannot manage it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRuntimeManifest } from "./generate-runtime-manifest.mjs";
import { readServerArtifactMetadata } from "./server-artifact-metadata.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const NPM_PACKAGE_NAME = "poracode";
export const REQUIRED_PACKED_FILES = [
  "package.json",
  "LICENSE",
  "README.md",
  "runtime-manifest.json",
  "bin/poracode.mjs",
  "lib/launcher.mjs",
];

export function parseArgs(argv) {
  const options = {
    artifacts: [],
    packageDir: join(repoRoot, "packages", "poracode-cli"),
    tag: "latest",
    dryRun: false,
    verifyOnly: false,
    trustedPublishing: false,
    registry: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--artifact") options.artifacts.push(resolve(argv[++index]));
    else if (argument === "--manifest") options.manifest = resolve(argv[++index]);
    else if (argument === "--package-dir") options.packageDir = resolve(argv[++index]);
    else if (argument === "--tag") options.tag = argv[++index];
    else if (argument === "--registry") options.registry = argv[++index];
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--verify-only") options.verifyOnly = true;
    else if (argument === "--trusted-publishing") options.trustedPublishing = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function assertNoMutableLatest(manifest) {
  for (const [target, entry] of Object.entries(manifest.targets)) {
    if (/\/releases\/latest\//u.test(entry.url)) {
      throw new Error(`runtime manifest ${target} uses a mutable latest URL: ${entry.url}`);
    }
  }
}

/** Verify the qualified inputs and return the manifest the package must embed. */
export function verifyPublicationInputs(options) {
  if (!options.manifest || !existsSync(options.manifest)) {
    throw new Error("--manifest <poracode-runtime-manifest.json> is required");
  }
  if (options.artifacts.length === 0) {
    throw new Error("At least one --artifact <server-artifact.json> is required");
  }
  const artifacts = options.artifacts.map((path) => readServerArtifactMetadata(path));
  const manifest = JSON.parse(readFileSync(options.manifest, "utf8"));
  verifyRuntimeManifest(artifacts, manifest);
  assertNoMutableLatest(manifest);
  if (Object.keys(manifest.targets).length === 0) {
    throw new Error("runtime manifest advertises no targets; nothing may be published");
  }
  const packagePath = join(options.packageDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  if (packageJson.name !== NPM_PACKAGE_NAME) {
    throw new Error(
      `package ${packagePath} is named ${packageJson.name}, expected ${NPM_PACKAGE_NAME}`,
    );
  }
  if (packageJson.version !== manifest.version) {
    throw new Error(
      `packed package version ${packageJson.version} does not match the qualified manifest ` +
        `${manifest.version}`,
    );
  }
  if (!existsSync(join(options.packageDir, "LICENSE"))) {
    throw new Error("the publishable package is missing its LICENSE text");
  }
  return { artifacts, manifest, packageJson };
}

/** Stage a copy of the package with the qualified manifest and pack it. */
export function packQualifiedPackage(options, inputs, deps = {}) {
  const runCommand = deps.run ?? run;
  const stageDir = mkdtempSync(join(tmpdir(), "poracode-npm-publish-"));
  try {
    cpSync(options.packageDir, stageDir, { recursive: true });
    writeFileSync(
      join(stageDir, "runtime-manifest.json"),
      `${JSON.stringify(inputs.manifest, null, 2)}\n`,
    );
    const packOutput = runCommand("npm", ["pack", "--pack-destination", stageDir, "--json"], {
      cwd: stageDir,
    });
    const packResult = JSON.parse(packOutput);
    const packed = Array.isArray(packResult) ? packResult[0] : Object.values(packResult)[0];
    const tarball = join(stageDir, packed.filename);
    if (!existsSync(tarball)) throw new Error(`npm pack did not produce ${tarball}`);
    const files = packed.files.map((file) => file.path).sort();
    for (const required of REQUIRED_PACKED_FILES) {
      if (!files.includes(required)) {
        throw new Error(`packed package is missing ${required}; packed files: ${files.join(", ")}`);
      }
    }
    // Read the packed manifest back out of the tarball: the published bytes,
    // not the staging copy, must carry the qualified version and targets.
    const packedManifest = JSON.parse(
      runCommand("tar", ["-xOzf", tarball, "package/runtime-manifest.json"]),
    );
    if (JSON.stringify(packedManifest) !== JSON.stringify(inputs.manifest)) {
      throw new Error("packed runtime-manifest.json does not match the qualified manifest");
    }
    const packedPackage = JSON.parse(runCommand("tar", ["-xOzf", tarball, "package/package.json"]));
    if (packedPackage.version !== inputs.manifest.version) {
      throw new Error(
        `packed package version ${packedPackage.version} != manifest ${inputs.manifest.version}`,
      );
    }
    return { stageDir, tarball, packed, files };
  } catch (error) {
    rmSync(stageDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Fail with an actionable message unless the current credential set can prove
 * write authority for the package. The official semantics this relies on:
 * - `npm whoami` reports the traditional token/user account and fails with
 *   ENEEDAUTH when none exists; it never reflects OIDC authentication (npm
 *   docs, trusted publishers: "The npm whoami command will not reflect OIDC
 *   authentication status since the authentication occurs only during the
 *   publish or stage operation").
 * - `npm owner ls` lists the maintainers of a package; it is public
 *   information, so a successful listing proves nothing about the caller. A
 *   caller is authorized only when its own account appears in that list
 *   ("Either you can modify a package, or you can't", npm-owner).
 * - An E404 from `npm view` is namespace absence, not ownership and not an
 *   authorization result. A valid account may claim an unclaimed name on the
 *   first publish, and the registry enforces authority at publish time.
 * - Trusted publishing cannot be verified locally: it needs no token and the
 *   registry matches the configured trusted publisher during `npm publish`.
 *   Ambient CI OIDC environment variables only show that an OIDC token could
 *   be requested; they never prove a package trust relationship exists, so the
 *   trusted path requires explicit opt-in and reports its authority as
 *   unverified.
 */
export function assertRegistryOwnership(options, deps = {}) {
  const runCommand = deps.run ?? run;
  const env = deps.env ?? process.env;
  const registryArgs = options.registry ? ["--registry", options.registry] : [];
  const registry = readRegistryState(runCommand, registryArgs);
  const account = readCurrentAccount(runCommand, registryArgs);

  if (account) {
    if (!registry.exists) {
      process.stdout.write(
        `[publish] npm name ${NPM_PACKAGE_NAME} is absent from the registry (E404: namespace ` +
          `absence, not an ownership result). Credential account ${account} is valid; the first ` +
          "publish claims the name and the registry enforces authority at publish time.\n",
      );
      return {
        claimed: false,
        authority: "valid-account-first-publish",
        account,
        verified: true,
      };
    }
    const owners = runCommand("npm", ["owner", "ls", NPM_PACKAGE_NAME, ...registryArgs]);
    process.stdout.write(`[publish] ${NPM_PACKAGE_NAME} maintainers:\n${owners}`);
    const maintainers = parseMaintainers(owners);
    if (!maintainers.some((name) => name.toLowerCase() === account.toLowerCase())) {
      throw new Error(
        `The npm account ${account} is not a maintainer of ${NPM_PACKAGE_NAME}, so this credential ` +
          "cannot publish it. `npm owner ls` lists the maintainers (write access); listing them " +
          `does not grant or prove access. Maintainers: ${maintainers.join(", ") || "(none reported)"}. ` +
          "Log in as a maintainer or set NPM_TOKEN/NODE_AUTH_TOKEN for a maintainer account.",
      );
    }
    process.stdout.write(`[publish] account ${account} is a maintainer of ${NPM_PACKAGE_NAME}\n`);
    return {
      claimed: true,
      authority: "maintainer-account",
      account,
      maintainers,
      verified: true,
    };
  }

  const oidc = detectOidcEnvironment(env);
  if (options.trustedPublishing) {
    if (!oidc) {
      throw new Error(
        "--trusted-publishing was requested, but no CI OIDC token environment is present " +
          "(GitHub Actions ACTIONS_ID_TOKEN_REQUEST_URL/ACTIONS_ID_TOKEN_REQUEST_TOKEN with " +
          "`id-token: write`, or an NPM_ID_TOKEN from GitLab/CircleCI).",
      );
    }
    if (!registry.exists) {
      throw new Error(
        `${NPM_PACKAGE_NAME} is absent from the registry (E404). Trusted publishing matches a ` +
          "trusted-publisher configuration on an existing package; the first publish of a new " +
          "name must use a maintainer token credential.",
      );
    }
    process.stdout.write(
      `[publish] no traditional npm credential: ${oidc.provider} trusted publishing was requested. ` +
        "This script cannot verify package write authority locally (npm whoami does not reflect " +
        "OIDC); the registry enforces the configured trusted publisher during `npm publish`.\n",
    );
    return {
      claimed: true,
      authority: "trusted-publishing",
      provider: oidc.provider,
      verified: false,
    };
  }

  throw new Error(
    registry.exists
      ? `No npm credential is available for ${NPM_PACKAGE_NAME}. A successful \`npm owner ls\` only ` +
          "lists maintainers and never proves this caller can publish, and `npm whoami` does not " +
          "reflect OIDC authentication. Provide a maintainer NPM_TOKEN/NODE_AUTH_TOKEN (or log in), " +
          "or configure npm trusted publishing for this repository/workflow and pass " +
          "--trusted-publishing so the registry enforces it at publish time."
      : `${NPM_PACKAGE_NAME} is absent from the registry (E404: namespace absence, not an ` +
          "ownership result) and no npm credential is available. The first publish of an " +
          "unclaimed name requires a maintainer token credential (NPM_TOKEN/NODE_AUTH_TOKEN or " +
          "an interactive login); trusted publishing matches a trusted-publisher configuration " +
          "on an existing package.",
  );
}

function readRegistryState(runCommand, registryArgs) {
  try {
    const output = runCommand("npm", [
      "view",
      NPM_PACKAGE_NAME,
      "version",
      "--json",
      ...registryArgs,
    ]);
    return { exists: true, version: String(output).trim() };
  } catch (error) {
    const text = errorText(error);
    if (/\bE404\b|404 Not Found/u.test(text)) return { exists: false, version: null };
    throw new Error(
      `Cannot read ${NPM_PACKAGE_NAME} from the registry. Check network/registry access, then ` +
        `retry. npm said: ${text.trim().slice(-400)}`,
      { cause: error },
    );
  }
}

function readCurrentAccount(runCommand, registryArgs) {
  try {
    return runCommand("npm", ["whoami", ...registryArgs]).trim();
  } catch (error) {
    const text = errorText(error);
    if (/ENEEDAUTH|need auth|EAUTH|\b401\b|Unauthorized/iu.test(text)) return null;
    throw new Error(
      `Cannot determine the npm account for this credential set. Check network/registry access, ` +
        `then retry. npm said: ${text.trim().slice(-400)}`,
      { cause: error },
    );
  }
}

function errorText(error) {
  return `${error?.stderr ?? ""}${error?.stdout ?? ""}${error?.message ?? ""}`;
}

/** `npm owner ls` prints one `user <email>` line per maintainer. */
function parseMaintainers(output) {
  return String(output)
    .split("\n")
    .map((line) => line.trim().split(/\s+/u)[0] ?? "")
    .filter((name) => name.length > 0);
}

/** OIDC token availability, never proof of a package trust relationship. */
function detectOidcEnvironment(env) {
  if (env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    return { provider: "GitHub Actions OIDC" };
  }
  if (env.NPM_ID_TOKEN) return { provider: "CI OIDC" };
  return null;
}

export function publishQualifiedPackage(options, deps = {}) {
  const runCommand = deps.run ?? run;
  const inputs = verifyPublicationInputs(options);
  const packed = packQualifiedPackage(options, inputs, deps);
  try {
    if (options.verifyOnly) {
      process.stdout.write(
        `${JSON.stringify({ ok: true, verified: true, packed: packed.packed.filename, files: packed.files })}\n`,
      );
      return packed;
    }
    if (options.dryRun) {
      process.stdout.write(
        `${JSON.stringify({ ok: true, dryRun: true, packed: packed.packed.filename, files: packed.files })}\n`,
      );
      return packed;
    }
    const ownership = assertRegistryOwnership(options, deps);
    const publishArgs = [
      "publish",
      packed.tarball,
      "--access",
      "public",
      "--tag",
      options.tag,
      "--provenance",
    ];
    if (options.registry) publishArgs.push("--registry", options.registry);
    runCommand("npm", publishArgs, { stdio: "inherit" });
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        published: packed.packed.filename,
        version: inputs.manifest.version,
        tag: options.tag,
        claimed: ownership.claimed,
        authority: ownership.authority,
        targets: Object.keys(inputs.manifest.targets).sort(),
      })}\n`,
    );
    return packed;
  } finally {
    rmSync(packed.stageDir, { recursive: true, force: true });
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    publishQualifiedPackage(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exit(1);
  }
}
