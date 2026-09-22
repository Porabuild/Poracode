import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildRuntimeManifest } from "./generate-runtime-manifest.mjs";
import {
  assertRegistryOwnership,
  parseArgs,
  publishQualifiedPackage,
  REQUIRED_PACKED_FILES,
  verifyPublicationInputs,
} from "./publish-npm-package.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = join(repoRoot, "packages", "poracode-cli");
const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

const sha = (letter) => letter.repeat(64);

function writeInputs({ version = "1.8.1", targets = ["linux-x64"], url } = {}) {
  const root = tempDir("poracode-npm-publish-");
  const metadata = {
    formatVersion: 1,
    kind: "poracode-server-artifact",
    version,
    platform: "linux",
    arch: "x64",
    targets,
    tarball: {
      name: `poracode-server-${version}-linux-x64.tar.gz`,
      sha256: sha("a"),
      bytes: 1,
    },
    runtime: { nodePty: "1.1.0", betterSqlite3: "13.0.3" },
  };
  const artifactPath = join(root, "server-artifact-linux-x64.json");
  writeFileSync(artifactPath, `${JSON.stringify(metadata)}\n`);
  const manifest = buildRuntimeManifest(
    [metadata],
    url ?? `https://github.com/Porabuild/Poracode/releases/download/v${version}`,
  );
  const manifestPath = join(root, "poracode-runtime-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  return { root, artifactPath, manifestPath, metadata, manifest };
}

void test("parseArgs collects repeated artifacts and the publish mode", () => {
  const options = parseArgs([
    "--artifact",
    "a.json",
    "--artifact",
    "b.json",
    "--manifest",
    "m.json",
    "--tag",
    "nightly",
    "--dry-run",
  ]);
  assert.equal(options.artifacts.length, 2);
  assert.equal(options.tag, "nightly");
  assert.equal(options.dryRun, true);
  assert.equal(options.verifyOnly, false);
  assert.equal(options.trustedPublishing, false);
  assert.equal(parseArgs(["--trusted-publishing"]).trustedPublishing, true);
});

void test("verifyPublicationInputs refuses version, target, and mutable-latest problems", () => {
  const good = writeInputs();
  const inputs = verifyPublicationInputs({
    artifacts: [good.artifactPath],
    manifest: good.manifestPath,
    packageDir,
  });
  assert.equal(inputs.manifest.version, "1.8.1");
  assert.deepEqual(Object.keys(inputs.manifest.targets), ["linux-x64"]);

  const wrongVersion = writeInputs({ version: "9.9.9" });
  assert.throws(
    () =>
      verifyPublicationInputs({
        artifacts: [wrongVersion.artifactPath],
        manifest: wrongVersion.manifestPath,
        packageDir,
      }),
    /does not match the qualified manifest/u,
  );

  const emptyTargets = writeInputs({ targets: [] });
  assert.throws(
    () =>
      verifyPublicationInputs({
        artifacts: [emptyTargets.artifactPath],
        manifest: emptyTargets.manifestPath,
        packageDir,
      }),
    /targets must be a non-empty array|advertises no targets/u,
  );

  const mutable = writeInputs({
    url: "https://github.com/Porabuild/Poracode/releases/latest/download",
  });
  assert.throws(
    () =>
      verifyPublicationInputs({
        artifacts: [mutable.artifactPath],
        manifest: mutable.manifestPath,
        packageDir,
      }),
    /mutable latest URL/u,
  );

  const tampered = writeInputs();
  const tamperedManifest = structuredClone(tampered.manifest);
  tamperedManifest.targets["linux-x64"].sha256 = sha("b");
  writeFileSync(tampered.manifestPath, `${JSON.stringify(tamperedManifest)}\n`);
  assert.throws(
    () =>
      verifyPublicationInputs({
        artifacts: [tampered.artifactPath],
        manifest: tampered.manifestPath,
        packageDir,
      }),
    /sha256/u,
  );
});

void test(
  "the packed package carries the qualified manifest, version, and license",
  { timeout: 120_000 },
  () => {
    const good = writeInputs();
    const result = publishQualifiedPackage({
      artifacts: [good.artifactPath],
      manifest: good.manifestPath,
      packageDir,
      dryRun: true,
      tag: "latest",
    });
    assert.equal(result.packed.name, "poracode");
    for (const required of REQUIRED_PACKED_FILES) {
      assert.ok(result.files.includes(required), `packed package must include ${required}`);
    }
    assert.ok(result.files.includes("lib/install.mjs"));
  },
);

void test("the package LICENSE is the repository license", () => {
  assert.deepEqual(
    readFileSync(join(packageDir, "LICENSE")),
    readFileSync(join(repoRoot, "LICENSE")),
    "packages/poracode-cli/LICENSE drifted from the repository LICENSE",
  );
});

function cannedRunner(responses) {
  const calls = [];
  return {
    calls,
    run(command, args) {
      calls.push([command, ...args].join(" "));
      const response = responses[`${command} ${args[0]}`];
      if (typeof response === "function") return response(args);
      if (typeof response === "string") return response;
      if (response instanceof Error) throw response;
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
  };
}

function npmFailure(text) {
  const error = new Error(text);
  error.stderr = `npm error ${text}\n`;
  return error;
}

const GITHUB_OIDC_ENV = {
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/oidc",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "oidc-request-token",
};

void test("an unrelated account that can list owners cannot pass the registry preflight", () => {
  const runner = cannedRunner({
    "npm view": "1.8.1\n",
    "npm whoami": "stranger\n",
    "npm owner": "alice <alice@example.com>\nbob <bob@example.com>\n",
  });
  assert.throws(
    () => assertRegistryOwnership({}, { run: runner.run }),
    /stranger.*is not a maintainer|is not a maintainer.*stranger/su,
    "a public maintainer listing must never be treated as caller write authority",
  );
  assert.ok(runner.calls.includes("npm owner ls poracode"));
  assert.ok(!runner.calls.some((call) => call.startsWith("npm publish")));
});

void test("a maintainer account passes with owner-list evidence", () => {
  const runner = cannedRunner({
    "npm view": "1.8.1\n",
    "npm whoami": "alice\n",
    "npm owner": "alice <alice@example.com>\nbob <bob@example.com>\n",
  });
  const result = assertRegistryOwnership({}, { run: runner.run });
  assert.equal(result.claimed, true);
  assert.equal(result.authority, "maintainer-account");
  assert.equal(result.account, "alice");
  assert.equal(result.verified, true);
  assert.deepEqual(result.maintainers, ["alice", "bob"]);
});

void test("missing auth fails with truthful setup state and never claims ownership", () => {
  const runner = cannedRunner({
    "npm view": "1.8.1\n",
    "npm whoami": npmFailure("code ENEEDAUTH\nneed auth This command requires you to be logged in"),
  });
  assert.throws(
    () => assertRegistryOwnership({}, { run: runner.run, env: {} }),
    /No npm credential is available[\s\S]*does not reflect OIDC/su,
  );
  assert.ok(runner.calls.includes("npm whoami"));
  assert.ok(
    !runner.calls.some((call) => call.startsWith("npm owner") || call.startsWith("npm publish")),
  );
});

void test("an E404 package is namespace absence, not an ownership claim", () => {
  const runner = cannedRunner({
    "npm view": npmFailure("code E404\n404 Not Found - GET https://registry.npmjs.org/poracode"),
    "npm whoami": "alice\n",
  });
  const result = assertRegistryOwnership({}, { run: runner.run });
  assert.equal(result.claimed, false);
  assert.equal(result.authority, "valid-account-first-publish");
  assert.equal(result.verified, true);
  assert.equal("owners" in result, false, "a 404 must not be reported as ownership evidence");
  assert.ok(!runner.calls.some((call) => call.startsWith("npm owner")));
});

void test("trusted publishing is explicit, OIDC-backed, and reported as registry-enforced", () => {
  const runner = cannedRunner({
    "npm view": "1.8.1\n",
    "npm whoami": npmFailure("code ENEEDAUTH"),
  });
  // Ambient OIDC environment alone is not package trust: without the explicit
  // opt-in the preflight fails with the truthful setup state.
  assert.throws(
    () => assertRegistryOwnership({}, { run: runner.run, env: GITHUB_OIDC_ENV }),
    /No npm credential is available/u,
  );
  // The explicit opt-in still requires an actual OIDC environment.
  assert.throws(
    () => assertRegistryOwnership({ trustedPublishing: true }, { run: runner.run, env: {} }),
    /no CI OIDC token environment/u,
  );
  const result = assertRegistryOwnership(
    { trustedPublishing: true },
    { run: runner.run, env: GITHUB_OIDC_ENV },
  );
  assert.equal(result.authority, "trusted-publishing");
  assert.equal(result.verified, false, "local OIDC presence must not claim verified trust");
  assert.match(result.provider, /GitHub Actions/u);

  // Trusted publishing matches a configuration on an existing package; an
  // unclaimed name cannot carry one, so its first publish needs a token.
  const unclaimedRunner = cannedRunner({
    "npm view": npmFailure("code E404"),
    "npm whoami": npmFailure("code ENEEDAUTH"),
  });
  assert.throws(
    () =>
      assertRegistryOwnership(
        { trustedPublishing: true },
        { run: unclaimedRunner.run, env: GITHUB_OIDC_ENV },
      ),
    /first publish.*maintainer token|absent from the registry/u,
  );
});

void test("dry-run packs the exact bytes without touching the registry", () => {
  const calls = [];
  const runner = (command, args, options) => {
    calls.push([command, ...args].join(" "));
    if (command === "npm" && args[0] !== "pack") {
      throw new Error(`dry-run must not run a registry command: ${command} ${args.join(" ")}`);
    }
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
  };
  const good = writeInputs();
  const result = publishQualifiedPackage(
    {
      artifacts: [good.artifactPath],
      manifest: good.manifestPath,
      packageDir,
      dryRun: true,
      tag: "latest",
    },
    { run: runner },
  );
  assert.equal(result.packed.name, "poracode");
  assert.ok(calls.some((call) => call.startsWith("npm pack")));
  assert.ok(!calls.some((call) => /^npm (view|owner|whoami|publish)/u.test(call)));
});
