import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  linkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Simulate a host where file symlinks and hard links are unavailable (Windows
// without developer mode, some network/FAT volumes): every state file then
// falls back to a plain copy.
const linkMode = vi.hoisted(() => ({ fail: false }));
vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  const refuse = (): never => {
    throw Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
  };
  return {
    ...actual,
    symlinkSync: (...args: Parameters<typeof actual.symlinkSync>) =>
      linkMode.fail && args[2] !== "dir" && args[2] !== "junction"
        ? refuse()
        : actual.symlinkSync(...args),
    linkSync: (...args: Parameters<typeof actual.linkSync>) =>
      linkMode.fail ? refuse() : actual.linkSync(...args),
  };
});

import { seedNativeCodexHome } from "./install";
import { refreshProfileOverlayStateFile } from "./profileOverlay";

let root: string;
let source: string;
let overlay: string;

function age(path: string, secondsAgo: number): void {
  const at = new Date(Date.now() - secondsAgo * 1000);
  utimesSync(path, at, at);
}

beforeEach(() => {
  linkMode.fail = false;
  root = mkdtempSync(join(tmpdir(), "codex-profile-overlay-"));
  source = join(root, "account");
  overlay = join(root, "overlay");
  mkdirSync(source);
  mkdirSync(overlay);
});

afterEach(() => {
  linkMode.fail = false;
});

describe("seedNativeCodexHome for a profile overlay with the copy fallback", () => {
  it("keeps a token Codex refreshed inside the overlay and writes it back to the profile home", () => {
    linkMode.fail = true;
    writeFileSync(join(source, "auth.json"), '{"token":"original"}');
    seedNativeCodexHome(overlay, source, { profileOverlay: true });
    const overlayAuth = join(overlay, "auth.json");
    expect(lstatSync(overlayAuth).isSymbolicLink()).toBe(false);
    expect(readFileSync(overlayAuth, "utf8")).toBe('{"token":"original"}');

    // Codex refreshes the token in the home it runs under: the overlay copy.
    age(join(source, "auth.json"), 120);
    writeFileSync(overlayAuth, '{"token":"refreshed"}');

    seedNativeCodexHome(overlay, source, { profileOverlay: true });
    expect(readFileSync(overlayAuth, "utf8")).toBe('{"token":"refreshed"}');
    expect(readFileSync(join(source, "auth.json"), "utf8")).toBe('{"token":"refreshed"}');
  });

  it("picks up a re-login in the profile home over an older overlay copy", () => {
    linkMode.fail = true;
    writeFileSync(join(source, "auth.json"), '{"token":"old-account"}');
    seedNativeCodexHome(overlay, source, { profileOverlay: true });
    age(join(overlay, "auth.json"), 120);
    writeFileSync(join(source, "auth.json"), '{"token":"new-login"}');

    seedNativeCodexHome(overlay, source, { profileOverlay: true });
    expect(readFileSync(join(overlay, "auth.json"), "utf8")).toBe('{"token":"new-login"}');
  });

  it("never touches an overlay session index copy, which session discovery reads directly", () => {
    linkMode.fail = true;
    seedNativeCodexHome(overlay, source, { profileOverlay: true });
    const overlayIndex = join(overlay, "session_index.jsonl");
    writeFileSync(overlayIndex, '{"id":"overlay-only"}\n');
    age(overlayIndex, 120);
    writeFileSync(join(source, "session_index.jsonl"), '{"id":"source"}\n');

    seedNativeCodexHome(overlay, source, { profileOverlay: true });
    expect(readFileSync(overlayIndex, "utf8")).toBe('{"id":"overlay-only"}\n');
  });

  it("drops a stale credential copy after logout instead of resurrecting it", () => {
    linkMode.fail = true;
    writeFileSync(join(source, "auth.json"), "{}");
    seedNativeCodexHome(overlay, source, { profileOverlay: true });
    // `codex logout` ran against the real profile home.
    rmSync(join(source, "auth.json"));

    seedNativeCodexHome(overlay, source, { profileOverlay: true });
    expect(existsSync(join(overlay, "auth.json"))).toBe(false);
    expect(existsSync(join(source, "auth.json"))).toBe(false);
  });
});

describe("refreshProfileOverlayStateFile with real links", () => {
  it("leaves a correct symlink in place", () => {
    const sourceAuth = join(source, "auth.json");
    const target = join(overlay, "auth.json");
    writeFileSync(sourceAuth, "{}");
    symlinkSync(sourceAuth, target, "file");
    const before = lstatSync(target).ino;

    refreshProfileOverlayStateFile(sourceAuth, target, "credential");
    expect(lstatSync(target).ino).toBe(before);
    expect(readlinkSync(target)).toBe(sourceAuth);
  });

  it("leaves a hard link to the source in place", () => {
    const sourceAuth = join(source, "auth.json");
    const target = join(overlay, "auth.json");
    writeFileSync(sourceAuth, "{}");
    linkSync(sourceAuth, target);

    refreshProfileOverlayStateFile(sourceAuth, target, "credential");
    expect(statSync(target).ino).toBe(statSync(sourceAuth).ino);
  });

  it("re-points a symlink that targets a different home", () => {
    const sourceAuth = join(source, "auth.json");
    const otherAuth = join(root, "other-auth.json");
    const target = join(overlay, "auth.json");
    writeFileSync(sourceAuth, '{"account":"profile"}');
    writeFileSync(otherAuth, '{"account":"other"}');
    symlinkSync(otherAuth, target, "file");

    refreshProfileOverlayStateFile(sourceAuth, target, "credential");
    expect(readFileSync(target, "utf8")).toBe('{"account":"profile"}');
    expect(readFileSync(otherAuth, "utf8")).toBe('{"account":"other"}');
  });

  it("restores config the overlay holds when the profile home has none", () => {
    const target = join(overlay, "config.toml");
    writeFileSync(target, 'model = "gpt-5.5"\n');

    refreshProfileOverlayStateFile(join(source, "config.toml"), target, "config");
    expect(readFileSync(join(source, "config.toml"), "utf8")).toBe('model = "gpt-5.5"\n');
  });
});
