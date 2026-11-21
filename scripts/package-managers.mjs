#!/usr/bin/env node
/**
 * Render package-manager manifests for one published release from its
 * SHA256SUMS: a Homebrew formula (`poracode-cli`, the self-contained CLI) and
 * cask (`poracode`, the desktop app), a Scoop manifest (CLI), winget manifests
 * (desktop NSIS installers) and an AUR PKGBUILD (`poracode-cli-bin`). Every URL
 * is version-pinned and every hash comes from the release's own SHA256SUMS, so
 * the manifests can only describe bytes the release workflow published.
 *
 * Usage:
 *   node scripts/package-managers.mjs --version <version> --sums <SHA256SUMS> --out <dir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { standaloneArchiveName } from "./standalone-runtime.mjs";

const { ARCH_LINUX_DESKTOP_DEPENDS } = createRequire(import.meta.url)(
  "./electron-builder.shared.cjs",
);

export const REPOSITORY = "Porabuild/Poracode";
const HOMEPAGE = "https://poracode.com/";
const DESCRIPTION = "Universal orchestrator for AI coding agents";

export function parseSha256Sums(text) {
  const sums = new Map();
  for (const line of text.split(/\r?\n/u)) {
    const match = /^([0-9a-f]{64})\s+\*?(\S.*)$/u.exec(line.trim());
    if (match) sums.set(match[2], match[1]);
  }
  return sums;
}

function asset(sums, version, name) {
  const sha256 = sums.get(name);
  if (!sha256) throw new Error(`SHA256SUMS for ${version} does not list ${name}`);
  return { url: `https://github.com/${REPOSITORY}/releases/download/v${version}/${name}`, sha256 };
}

export function renderHomebrewFormula(version, sums) {
  const cli = (target) => asset(sums, version, standaloneArchiveName(version, target));
  const [macArm, macIntel, linuxArm, linuxIntel] = [
    cli("darwin-arm64"),
    cli("darwin-x64"),
    cli("linux-arm64"),
    cli("linux-x64"),
  ];
  return `class PoracodeCli < Formula
  desc "${DESCRIPTION} (terminal UI, server and web app)"
  homepage "${HOMEPAGE}"
  version "${version}"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "${macArm.url}"
      sha256 "${macArm.sha256}"
    end
    on_intel do
      url "${macIntel.url}"
      sha256 "${macIntel.sha256}"
    end
  end

  on_linux do
    on_arm do
      url "${linuxArm.url}"
      sha256 "${linuxArm.sha256}"
    end
    on_intel do
      url "${linuxIntel.url}"
      sha256 "${linuxIntel.sha256}"
    end
  end

  livecheck do
    url :stable
    strategy :github_latest
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"bin/poracode"
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/poracode --version").strip
  end
end
`;
}

export function renderHomebrewCask(version, sums) {
  const arm = asset(sums, version, `Poracode-${version}-arm64.dmg`);
  const intel = asset(sums, version, `Poracode-${version}-x64.dmg`);
  return `cask "poracode" do
  arch arm: "arm64", intel: "x64"

  version "${version}"
  sha256 arm:   "${arm.sha256}",
         intel: "${intel.sha256}"

  url "https://github.com/${REPOSITORY}/releases/download/v#{version}/Poracode-#{version}-#{arch}.dmg"
  name "Poracode"
  desc "${DESCRIPTION}"
  homepage "${HOMEPAGE}"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true

  app "Poracode.app"

  # Profile data in ~/.poracode is shared with the CLI and is never zapped.
  zap trash: [
    "~/Library/Application Support/Poracode",
    "~/Library/Preferences/com.lightcode.app.plist",
    "~/Library/Saved Application State/com.lightcode.app.savedState",
  ]
end
`;
}

export function renderScoopManifest(version, sums) {
  const zip = asset(sums, version, standaloneArchiveName(version, "win32-x64"));
  const manifest = {
    version,
    description: `${DESCRIPTION} (terminal UI, server and web app)`,
    homepage: HOMEPAGE,
    license: "Apache-2.0",
    architecture: { "64bit": { url: zip.url, hash: zip.sha256 } },
    bin: [["bin\\poracode.cmd", "poracode"]],
    checkver: { github: `https://github.com/${REPOSITORY}` },
    autoupdate: {
      architecture: {
        "64bit": {
          url: `https://github.com/${REPOSITORY}/releases/download/v$version/poracode-$version-win32-x64.zip`,
        },
      },
      hash: { url: `https://github.com/${REPOSITORY}/releases/download/v$version/SHA256SUMS` },
    },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function renderWingetManifests(version, sums, identifier = "Porabuild.Poracode") {
  const x64 = asset(sums, version, `Poracode-Setup-${version}-x64.exe`);
  const arm64 = asset(sums, version, `Poracode-Setup-${version}-arm64.exe`);
  const header = (type) =>
    `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${type}.1.10.0.schema.json\n`;
  return {
    [`${identifier}.yaml`]: `${header("version")}PackageIdentifier: ${identifier}\nPackageVersion: ${version}\nDefaultLocale: en-US\nManifestType: version\nManifestVersion: 1.10.0\n`,
    [`${identifier}.locale.en-US.yaml`]: `${header("defaultLocale")}PackageIdentifier: ${identifier}\nPackageVersion: ${version}\nPackageLocale: en-US\nPublisher: Porabuild\nPackageName: Poracode\nLicense: Apache-2.0\nShortDescription: ${DESCRIPTION}\nPackageUrl: ${HOMEPAGE}\nManifestType: defaultLocale\nManifestVersion: 1.10.0\n`,
    [`${identifier}.installer.yaml`]:
      `${header("installer")}PackageIdentifier: ${identifier}\nPackageVersion: ${version}\nInstallerType: nullsoft\nScope: user\nInstallers:\n` +
      `  - Architecture: x64\n    InstallerUrl: ${x64.url}\n    InstallerSha256: ${x64.sha256.toUpperCase()}\n` +
      `  - Architecture: arm64\n    InstallerUrl: ${arm64.url}\n    InstallerSha256: ${arm64.sha256.toUpperCase()}\n` +
      "ManifestType: installer\nManifestVersion: 1.10.0\n",
  };
}

export function renderAurPkgbuild(version, sums) {
  const x64 = asset(sums, version, standaloneArchiveName(version, "linux-x64"));
  const arm64 = asset(sums, version, standaloneArchiveName(version, "linux-arm64"));
  return `# Maintainer: Porabuild <https://github.com/${REPOSITORY}>
# Generated by scripts/package-managers.mjs from the release's SHA256SUMS.
pkgname=poracode-cli-bin
pkgver=${version}
pkgrel=1
pkgdesc="${DESCRIPTION} (terminal UI, server and web app)"
arch=('x86_64' 'aarch64')
url="${HOMEPAGE}"
license=('Apache-2.0')
provides=('poracode-cli')
conflicts=('poracode-cli')
options=('!strip')
source_x86_64=("${x64.url}")
source_aarch64=("${arm64.url}")
sha256sums_x86_64=('${x64.sha256}')
sha256sums_aarch64=('${arm64.sha256}')
noextract=()

package() {
  install -d "$pkgdir/opt/poracode-cli" "$pkgdir/usr/bin"
  cp -a "$srcdir"/. "$pkgdir/opt/poracode-cli/"
  rm -f "$pkgdir/opt/poracode-cli"/*.tar.gz
  ln -s /opt/poracode-cli/bin/poracode "$pkgdir/usr/bin/poracode"
}
`;
}

function renderArchDesktopPkgbuild(version, sums, { pkgname, omarchy = false }) {
  const x64Name = `Poracode-${version}-x64.pacman`;
  const arm64Name = `Poracode-${version}-aarch64.pacman`;
  const x64 = asset(sums, version, x64Name);
  const arm64 = asset(sums, version, arm64Name);
  const dependsLines = ARCH_LINUX_DESKTOP_DEPENDS.map((dep) => `  '${dep}'`).join("\n");
  const compressLine = omarchy ? "\nCOMPRESSZST=(zstd -c -z -q --ultra -22 --threads=0 -)\n" : "\n";
  const providesConflicts =
    pkgname === "poracode-bin"
      ? "provides=('poracode' 'poracode-desktop')\nconflicts=('poracode')\n"
      : "provides=('poracode-desktop')\nconflicts=('poracode-bin')\n";
  return `# Maintainer: Porabuild <https://github.com/${REPOSITORY}>
# Generated by scripts/package-managers.mjs from the release's SHA256SUMS.
pkgname=${pkgname}
pkgver=${version}
pkgrel=1
pkgdesc="${DESCRIPTION}"
arch=('x86_64' 'aarch64')
url="${HOMEPAGE}"
license=('Apache-2.0')
depends=(
${dependsLines}
)
optdepends=(
  'gnome-keyring: store credentials in a system keyring'
)
makedepends=('libarchive')
${providesConflicts}options=('!debug' '!strip')${compressLine}source_x86_64=("${x64.url}")
source_aarch64=("${arm64.url}")
sha256sums_x86_64=('${x64.sha256}')
sha256sums_aarch64=('${arm64.sha256}')
noextract=("Poracode-\${pkgver}-x64.pacman" "Poracode-\${pkgver}-aarch64.pacman")

package() {
  local archive
  case "$CARCH" in
    x86_64) archive="Poracode-\${pkgver}-x64.pacman" ;;
    aarch64) archive="Poracode-\${pkgver}-aarch64.pacman" ;;
    *) echo "Unsupported architecture: $CARCH" >&2; return 1 ;;
  esac
  bsdtar -xf "$srcdir/$archive" -C "$pkgdir" opt usr
  install -d "$pkgdir/usr/bin"
  ln -s /opt/Poracode/poracode-desktop "$pkgdir/usr/bin/poracode-desktop"
  if [ -f "$pkgdir/opt/Poracode/chrome-sandbox" ]; then
    chmod 0755 "$pkgdir/opt/Poracode/chrome-sandbox"
  fi
}
`;
}

export function renderAurDesktopPkgbuild(version, sums) {
  return renderArchDesktopPkgbuild(version, sums, { pkgname: "poracode-bin" });
}

export function renderOmarchyPackage(version, sums) {
  const metadata = {
    source: "local",
    release_ring: "fast",
    upstream: {
      watch: {
        github: REPOSITORY,
        pattern: "v(?P<version>[0-9]+(?:\\.[0-9]+)*)",
      },
    },
  };
  return {
    PKGBUILD: renderArchDesktopPkgbuild(version, sums, { pkgname: "poracode", omarchy: true }),
    ".omarchy/package.json": `${JSON.stringify(metadata, null, 2)}\n`,
  };
}

const PLAIN_VERSION = /^\d+\.\d+\.\d+$/u;

export function renderAll(version, sums, outDir) {
  if (!PLAIN_VERSION.test(version)) {
    throw new Error(`package managers track plain X.Y.Z releases only, got ${version}`);
  }
  const files = {
    "homebrew/Formula/poracode-cli.rb": renderHomebrewFormula(version, sums),
    "homebrew/Casks/poracode.rb": renderHomebrewCask(version, sums),
    "scoop/poracode.json": renderScoopManifest(version, sums),
    "aur/poracode-cli-bin/PKGBUILD": renderAurPkgbuild(version, sums),
    "aur/poracode-bin/PKGBUILD": renderAurDesktopPkgbuild(version, sums),
  };
  for (const [name, text] of Object.entries(renderOmarchyPackage(version, sums))) {
    files[`omarchy/pkgbuilds/poracode/${name}`] = text;
  }
  for (const [name, text] of Object.entries(renderWingetManifests(version, sums))) {
    files[`winget/${name}`] = text;
  }
  for (const [name, text] of Object.entries(files)) {
    const path = join(outDir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  return Object.keys(files).sort();
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const argv = process.argv.slice(2);
    const option = (name) => {
      const index = argv.indexOf(name);
      return index >= 0 ? argv[index + 1] : undefined;
    };
    const version = option("--version");
    const sumsPath = option("--sums");
    const outDir = option("--out");
    if (!version || !sumsPath || !outDir) {
      throw new Error("Usage: package-managers.mjs --version <v> --sums <SHA256SUMS> --out <dir>");
    }
    const written = renderAll(
      version,
      parseSha256Sums(readFileSync(sumsPath, "utf8")),
      resolve(outDir),
    );
    process.stdout.write(`${written.join("\n")}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
