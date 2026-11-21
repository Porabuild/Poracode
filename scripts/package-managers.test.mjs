import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  parseSha256Sums,
  renderAll,
  renderAurDesktopPkgbuild,
  renderAurPkgbuild,
  renderHomebrewFormula,
  renderOmarchyPackage,
  renderScoopManifest,
  renderWingetManifests,
} from "./package-managers.mjs";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const version = "2.1.0";
const names = [
  "poracode-2.1.0-darwin-arm64.tar.gz",
  "poracode-2.1.0-darwin-x64.tar.gz",
  "poracode-2.1.0-linux-arm64.tar.gz",
  "poracode-2.1.0-linux-x64.tar.gz",
  "poracode-2.1.0-win32-x64.zip",
  "Poracode-2.1.0-arm64.dmg",
  "Poracode-2.1.0-x64.dmg",
  "Poracode-Setup-2.1.0-x64.exe",
  "Poracode-Setup-2.1.0-arm64.exe",
  "Poracode-2.1.0-x64.pacman",
  "Poracode-2.1.0-aarch64.pacman",
];
const sums = parseSha256Sums(
  names.map((name, index) => `${index.toString(16).repeat(64).slice(0, 64)}  ${name}`).join("\n"),
);

void test("manifests pin release URLs and the published SHA256SUMS hashes", () => {
  const formula = renderHomebrewFormula(version, sums);
  assert.match(formula, /class PoracodeCli < Formula/u);
  assert.match(
    formula,
    /url "https:\/\/github\.com\/Porabuild\/Poracode\/releases\/download\/v2\.1\.0\/poracode-2\.1\.0-darwin-arm64\.tar\.gz"/u,
  );
  assert.match(formula, new RegExp(`sha256 "${sums.get(names[3])}"`, "u"));
  assert.match(formula, /bin\.install_symlink libexec\/"bin\/poracode"/u);

  const scoop = JSON.parse(renderScoopManifest(version, sums));
  assert.equal(scoop.architecture["64bit"].hash, sums.get("poracode-2.1.0-win32-x64.zip"));
  assert.deepEqual(scoop.bin, [["bin\\poracode.cmd", "poracode"]]);

  const winget = renderWingetManifests(version, sums);
  assert.match(winget["Porabuild.Poracode.installer.yaml"], /InstallerType: nullsoft/u);
  assert.match(
    winget["Porabuild.Poracode.installer.yaml"],
    new RegExp(sums.get("Poracode-Setup-2.1.0-arm64.exe").toUpperCase(), "u"),
  );

  const pkgbuild = renderAurPkgbuild(
    "2.2.0",
    parseSha256Sums(
      ["linux-x64", "linux-arm64"]
        .map((target) => `${"a".repeat(64)}  poracode-2.2.0-${target}.tar.gz`)
        .join("\n"),
    ),
  );
  assert.match(pkgbuild, /^pkgver=2\.2\.0$/mu);
  assert.match(pkgbuild, /ln -s \/opt\/poracode-cli\/bin\/poracode/u);

  const desktopAur = renderAurDesktopPkgbuild(version, sums);
  assert.match(desktopAur, /^pkgname=poracode-bin$/mu);
  assert.match(desktopAur, /^arch=\('x86_64' 'aarch64'\)$/mu);
  assert.match(
    desktopAur,
    new RegExp(`sha256sums_x86_64=\\('${sums.get("Poracode-2.1.0-x64.pacman")}'\\)`, "u"),
  );
  assert.match(
    desktopAur,
    new RegExp(`sha256sums_aarch64=\\('${sums.get("Poracode-2.1.0-aarch64.pacman")}'\\)`, "u"),
  );
  assert.match(desktopAur, /'libsecret'/u);
  assert.match(desktopAur, /'xdg-desktop-portal'/u);
  assert.match(desktopAur, /chmod 0755 "\$pkgdir\/opt\/Poracode\/chrome-sandbox"/u);

  const omarchy = renderOmarchyPackage(version, sums);
  assert.match(omarchy.PKGBUILD, /^pkgname=poracode$/mu);
  assert.match(omarchy.PKGBUILD, /^COMPRESSZST=\(zstd -c -z -q --ultra -22 --threads=0 -\)$/mu);
  const omarchyMeta = JSON.parse(omarchy[".omarchy/package.json"]);
  assert.deepEqual(omarchyMeta, {
    source: "local",
    release_ring: "fast",
    upstream: {
      watch: {
        github: "Porabuild/Poracode",
        pattern: "v(?P<version>[0-9]+(?:\\.[0-9]+)*)",
      },
    },
  });
});

void test("renderAll refuses a non-plain version", () => {
  const out = mkdtempSync(join(tmpdir(), "poracode-package-managers-"));
  tempDirs.push(out);
  assert.throws(() => renderAll("2.2.0-nightly.202611080110", sums, out), /plain X\.Y\.Z/u);
  assert.throws(() => renderAll("v2.1.0", sums, out), /plain X\.Y\.Z/u);
});

void test("a release missing an asset fails instead of rendering a broken manifest", () => {
  const partial = new Map(sums);
  partial.delete("poracode-2.1.0-linux-x64.tar.gz");
  assert.throws(
    () => renderHomebrewFormula(version, partial),
    /does not list poracode-2\.1\.0-linux-x64/u,
  );
});

void test("renderAll writes every manifest", () => {
  const out = mkdtempSync(join(tmpdir(), "poracode-package-managers-"));
  tempDirs.push(out);
  const written = renderAll(version, sums, out);
  assert.deepEqual(written, [
    "aur/poracode-bin/PKGBUILD",
    "aur/poracode-cli-bin/PKGBUILD",
    "homebrew/Casks/poracode.rb",
    "homebrew/Formula/poracode-cli.rb",
    "omarchy/pkgbuilds/poracode/.omarchy/package.json",
    "omarchy/pkgbuilds/poracode/PKGBUILD",
    "scoop/poracode.json",
    "winget/Porabuild.Poracode.installer.yaml",
    "winget/Porabuild.Poracode.locale.en-US.yaml",
    "winget/Porabuild.Poracode.yaml",
  ]);
  assert.match(readFileSync(join(out, "homebrew/Casks/poracode.rb"), "utf8"), /auto_updates true/u);
});

void test("the publish workflow is manual, release-pinned and gated per channel", async () => {
  const { parse } = await import("yaml");
  const workflow = parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        ".github",
        "workflows",
        "publish-package-managers.yml",
      ),
      "utf8",
    ),
  );
  const trigger = workflow.on ?? workflow[true];
  assert.deepEqual(Object.keys(trigger), ["workflow_dispatch"]);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  const steps = workflow.jobs.render.steps;
  const render = steps.find((step) => step.name === "Render from the release\x27s SHA256SUMS");
  assert.match(render.run, /\*\[!0-9\.\]\*/u, "prereleases never reach package managers");
  assert.match(
    render.run,
    /gh release download "v\$RELEASE_VERSION"[^\n]*\\\n\s*--pattern SHA256SUMS/u,
  );
  assert.match(render.run, /package-managers\.mjs --version "\$RELEASE_VERSION"/u);
  const tap = steps.find((step) => step.name === "Push the Homebrew tap");
  assert.equal(tap.if, "${{ vars.HOMEBREW_TAP_REPO != \x27\x27 }}");
  const bucket = steps.find((step) => step.name === "Push the Scoop bucket");
  assert.equal(bucket.if, "${{ vars.SCOOP_BUCKET_REPO != \x27\x27 }}");
  const aur = steps.find((step) => step.name === "Push the AUR package");
  assert.match(aur.run, /if \[ -z "\$AUR_KEY" \]; then[\s\S]*exit 0/u);
  const aurDesktop = steps.find((step) => step.name === "Push the AUR desktop package");
  assert.equal(aurDesktop.if, "${{ vars.AUR_DESKTOP_PUBLISH_ENABLED == 'true' }}");
  assert.match(aurDesktop.run, /aur\/poracode-bin\/PKGBUILD/u);
  const winget = workflow.jobs.winget.steps[0];
  assert.match(winget.run, /if \(-not \$env:WINGET_TOKEN\)[^\n]*exit 0/u);
});
