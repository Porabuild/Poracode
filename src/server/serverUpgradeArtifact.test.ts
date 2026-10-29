import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findTarball, runTar, tarballSupportsD4 } from "./serverUpgradeArtifact";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function scratch() {
  const root = mkdtempSync(join(tmpdir(), "poracode-d4-sniff-unit-"));
  roots.push(root);
  return root;
}

/** Stage the given archive members under `stageDir`, then pack it into `tarball`. */
function packTarball(stageDir: string, members: Record<string, string>, tarball: string) {
  for (const [member, contents] of Object.entries(members)) {
    const path = join(stageDir, member);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, contents);
  }
  runTar(["-czf", tarball, "-C", stageDir, "."], { stdio: "pipe" });
  return tarball;
}

const ENTRY_BENIGN = "console.log('server entrypoint without markers');";
const ENTRY_D4 =
  "answer({ ok: false, error: { code: 'not-staging' }, admit: 'identity-mismatch' });";
const CHUNK_D4 =
  "ownershipServer.refuse = 'not-staging'; ownershipServer.guard = 'identity-mismatch';";
const INSTALL_RECIPE = "export async function serverReleaseInstall() {}";

describe("tarballSupportsD4", () => {
  it("accepts the markers carried by a shipped lib chunk when the entrypoint is split", () => {
    const root = scratch();
    const tarball = packTarball(
      join(root, "stage"),
      {
        "lib/server.cjs": ENTRY_BENIGN,
        "lib/backendHost.cjs": CHUNK_D4,
        "scripts/server-release-install.mjs": INSTALL_RECIPE,
      },
      join(root, "poracode-server-2.0.0-nightly.tar.gz"),
    );
    expect(tarballSupportsD4(tarball)).toBe(true);
  });

  it("accepts the markers inlined in the entrypoint of a single-file bundle", () => {
    const root = scratch();
    const tarball = packTarball(
      join(root, "stage"),
      {
        "lib/server.cjs": ENTRY_D4,
        "scripts/server-release-install.mjs": INSTALL_RECIPE,
      },
      join(root, "poracode-server-2.0.0.tar.gz"),
    );
    expect(tarballSupportsD4(tarball)).toBe(true);
  });

  it("refuses a pre-D4 bundle without the authenticated operations", () => {
    const root = scratch();
    const tarball = packTarball(
      join(root, "stage"),
      {
        "lib/server.cjs": ENTRY_BENIGN,
        "lib/backendHost.cjs": "console.log('no markers here');",
        "scripts/server-release-install.mjs": INSTALL_RECIPE,
      },
      join(root, "poracode-server-1.0.0.tar.gz"),
    );
    expect(tarballSupportsD4(tarball)).toBe(false);
  });

  it("refuses an archive without the server entrypoint", () => {
    const root = scratch();
    const tarball = packTarball(
      join(root, "stage"),
      {
        "lib/backendHost.cjs": CHUNK_D4,
        "scripts/server-release-install.mjs": INSTALL_RECIPE,
      },
      join(root, "poracode-server-2.0.0.tar.gz"),
    );
    expect(tarballSupportsD4(tarball)).toBe(false);
  });
});

describe("findTarball", () => {
  it("picks the newest tarball carrying the current install recipe", () => {
    const dist = scratch();
    packTarball(
      join(dist, "stale-stage"),
      { "lib/server.cjs": ENTRY_BENIGN },
      join(dist, "poracode-server-1.0.0.tar.gz"),
    );
    const current = packTarball(
      join(dist, "current-stage"),
      {
        "lib/server.cjs": ENTRY_BENIGN,
        "scripts/server-release-install.mjs": INSTALL_RECIPE,
      },
      join(dist, "poracode-server-1.0.1.tar.gz"),
    );
    expect(findTarball(dist)).toBe(current);
  });

  it("returns null when no candidate carries the install recipe or the dist is missing", () => {
    const dist = scratch();
    packTarball(
      join(dist, "stage"),
      { "lib/server.cjs": ENTRY_BENIGN },
      join(dist, "poracode-server-1.0.0.tar.gz"),
    );
    expect(findTarball(dist)).toBe(null);
    expect(findTarball(join(dist, "missing"))).toBe(null);
  });
});
