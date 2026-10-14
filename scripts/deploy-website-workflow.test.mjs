import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { GET as androidLinks } from "../website/src/app/.well-known/assetlinks.json/route.ts";
import { GET as appleLinks } from "../website/src/app/.well-known/apple-app-site-association/route.ts";

const rootPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const workflow = parse(
  await readFile(new URL("../.github/workflows/deploy-website.yml", import.meta.url), "utf8"),
);
const validation = workflow.jobs.web.steps.find(
  (step) => step.name === "Validate Vercel configuration",
);
const verification = workflow.jobs.web.steps.find(
  (step) => step.name === "Verify native app-link association documents",
);
const teamId = "ABCDE12345";
const fingerprint = Array(32).fill("AB").join(":");
const otherFingerprint = Array(32).fill("CD").join(":");

void test("website build overrides the workspace global store through pnpm's environment", async () => {
  const scratchRoot = new URL("../tmp/", import.meta.url);
  await mkdir(scratchRoot, { recursive: true });
  const fixture = await mkdtemp(new URL("website-pnpm-config-", scratchRoot));
  try {
    await writeFile(
      resolve(fixture, "package.json"),
      JSON.stringify({ private: true, packageManager: rootPackage.packageManager }),
    );
    await writeFile(resolve(fixture, "pnpm-workspace.yaml"), "enableGlobalVirtualStore: true\n");
    const env = { ...process.env };
    delete env.PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE;
    delete env.pnpm_config_enable_global_virtual_store;
    delete env.PNPM_CONFIG_VIRTUAL_STORE_TYPE;
    delete env.pnpm_config_virtual_store_type;
    const configured = spawnSync("pnpm", ["config", "get", "enableGlobalVirtualStore"], {
      cwd: fixture,
      env,
      encoding: "utf8",
    });
    assert.equal(configured.status, 0, configured.stderr);
    assert.equal(configured.stdout.trim(), "true");

    const build = spawnSync("pnpm", ["config", "get", "enableGlobalVirtualStore"], {
      cwd: fixture,
      env: { ...env, ...workflow.jobs.web.env },
      encoding: "utf8",
    });
    assert.equal(build.status, 0, build.stderr);
    assert.equal(build.stdout.trim(), "false");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

async function routeDocuments(fingerprints) {
  const settings = {
    PORACODE_MOBILE_APP_ID: "com.lightcodeapp.mobile",
    PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS: fingerprints,
    PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINT: "",
    PORACODE_MOBILE_APPLE_TEAM_ID: teamId,
  };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, settings);
    return { android: await androidLinks().json(), apple: await appleLinks().json() };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const fixtureCurl = `
curl() {
  local url="" output="" origin="deployment"
  while (($#)); do
    case "$1" in
      --output) output="$2"; shift 2 ;;
      --fail-with-body|--silent|--show-error) shift ;;
      https://*) url="$1"; shift ;;
      *) return 1 ;;
    esac
  done
  case "$url" in "$CANONICAL_ORIGIN/"*) origin="canonical" ;; esac
  if [ "$origin" = deployment ]; then
    [ "\${AUTHENTICATED_DEPLOYMENT_REQUEST:-}" = 1 ] || return 22
  else
    [ "\${AUTHENTICATED_DEPLOYMENT_REQUEST:-}" != 1 ] || return 23
  fi
  [ "\${REQUEST_FAILURE:-}" != "$origin" ] || return 22
  local file=""
  case "$url" in
    *assetlinks.json*) file="assetlinks.json" ;;
    *apple-app-site-association*) file="apple-app-site-association" ;;
    *) return 1 ;;
  esac
  cp "$FIXTURE_DIR/$origin/$file" "$output"
}
vercel() {
  [ "$1" = curl ] || return 1
  shift
  local url="$1"
  shift
  [ -n "$VERCEL_TOKEN" ] || return 1
  [ "$1" = -- ] || return 1
  shift
  case "$url" in "$DEPLOYMENT_URL/.well-known/"*) ;; *) return 1 ;; esac
  AUTHENTICATED_DEPLOYMENT_REQUEST=1 curl "$url" "$@"
}
`;

void test("website configuration permits an unconfigured Android signer and still requires iOS", () => {
  const env = {
    ...process.env,
    VERCEL_ORG_ID: "qa-team",
    VERCEL_PROJECT_ID: "qa-project",
    VERCEL_TOKEN: "qa-fixture-token",
    PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS: "",
    PORACODE_MOBILE_APPLE_TEAM_ID: teamId,
  };
  assert.equal(spawnSync("bash", ["-euc", validation.run], { env }).status, 0);
  assert.equal(
    spawnSync("bash", ["-euc", validation.run], {
      env: { ...env, PORACODE_MOBILE_APPLE_TEAM_ID: "" },
    }).status,
    1,
  );
  for (const key of [
    "PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS",
    "PORACODE_MOBILE_APPLE_TEAM_ID",
    "VERCEL_TOKEN",
  ]) {
    const build = workflow.jobs.web.steps.find((step) => step.name === "Build");
    assert.equal(verification.env[key], build.env[key]);
  }
});

void test("website deployment verifies the generated routes on both deployment and canonical origins", async (t) => {
  const configuredAndroid = (await routeDocuments(fingerprint)).android;
  const cases = [
    { name: "unconfigured Android trusts no signer", fingerprints: "", pass: true },
    {
      name: "deployment authentication failure fails qualification",
      fingerprints: "",
      requestFailure: "deployment",
      status: 22,
    },
    {
      name: "canonical origin must remain publicly readable",
      fingerprints: "",
      requestFailure: "canonical",
      status: 22,
    },
    { name: "configured Android signer matches", fingerprints: fingerprint, pass: true },
    {
      name: "signer rotation accepts comma/newline configuration",
      fingerprints: ` ${fingerprint.toLowerCase()},\n${otherFingerprint} `,
      pass: true,
    },
    { name: "invalid fingerprint", fingerprints: "not-a-certificate", pass: false },
    {
      name: "unconfigured Android rejects an unexpected signer",
      fingerprints: "",
      mutate: (d) => {
        d.android = structuredClone(configuredAndroid);
      },
    },
    {
      name: "configured Android rejects missing associations",
      fingerprints: fingerprint,
      mutate: (d) => {
        d.android = [];
      },
    },
    {
      name: "configured Android rejects a different valid signer",
      fingerprints: fingerprint,
      error: "Android association verification failed at https://deployment.example",
      mutate: (d) => {
        d.android[0].target.sha256_cert_fingerprints = [otherFingerprint];
      },
    },
    {
      name: "Android rejects a different package",
      fingerprints: fingerprint,
      mutate: (d) => {
        d.android[0].target.package_name = "com.example.other";
      },
    },
    {
      name: "Android rejects additional associations",
      fingerprints: fingerprint,
      mutate: (d) => {
        d.android.push(structuredClone(d.android[0]));
      },
    },
    {
      name: "iOS rejects a different team",
      fingerprints: "",
      mutate: (d) => {
        d.apple.applinks.details[0].appIDs = ["OTHER12345.com.lightcodeapp.mobile"];
      },
    },
    {
      name: "iOS rejects the stale response without the root entry",
      fingerprints: "",
      mutate: (d) => {
        d.apple.applinks.details[0].components.shift();
      },
    },
    {
      name: "iOS rejects an excluded pairing route",
      fingerprints: "",
      mutate: (d) => {
        d.apple.applinks.details[0].components[1].exclude = true;
      },
    },
    {
      name: "iOS rejects a different webcredentials app",
      fingerprints: "",
      mutate: (d) => {
        d.apple.webcredentials.apps = ["OTHER12345.com.lightcodeapp.mobile"];
      },
    },
    {
      name: "a correct deployment cannot hide a stale canonical alias",
      fingerprints: "",
      canonicalOnly: true,
      error: "iOS association verification failed at https://canonical.example",
      mutate: (d) => {
        d.apple.applinks.details[0].components.shift();
      },
    },
  ];
  await mkdir(resolve("tmp"), { recursive: true });
  const dir = await mkdtemp(resolve("tmp/deploy-website-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const original = await routeDocuments(fixture.fingerprints);
      const modified = structuredClone(original);
      fixture.mutate?.(modified);
      for (const origin of ["deployment", "canonical"]) {
        const documents = fixture.canonicalOnly && origin === "deployment" ? original : modified;
        const target = resolve(dir, origin);
        await mkdir(target, { recursive: true });
        await writeFile(resolve(target, "assetlinks.json"), JSON.stringify(documents.android));
        await writeFile(
          resolve(target, "apple-app-site-association"),
          JSON.stringify(documents.apple),
        );
      }
      const result = spawnSync("bash", ["-euc", fixtureCurl + verification.run], {
        encoding: "utf8",
        env: {
          ...process.env,
          FIXTURE_DIR: dir,
          RUNNER_TEMP: dir,
          CANONICAL_ORIGIN: "https://canonical.example",
          DEPLOYMENT_URL: "https://deployment.example",
          VERCEL_TOKEN: "qa-fixture-token",
          REQUEST_FAILURE: fixture.requestFailure ?? "",
          GITHUB_SHA: "qa-commit",
          PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS: fixture.fingerprints,
          PORACODE_MOBILE_APPLE_TEAM_ID: teamId,
        },
      });
      assert.equal(result.status, fixture.status ?? (fixture.pass ? 0 : 1), result.stderr);
      if (fixture.error) assert.ok(result.stderr.includes(fixture.error), result.stderr);
    });
  }
});
