import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const tempDirs: string[] = [];

function makeTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "lightcode-antigravity-"));
  tempDirs.push(dir);
  return dir;
}

async function loadSessionModule(home: string) {
  vi.resetModules();
  vi.doMock("node:os", async (importActual) => {
    const actual = await importActual<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => home,
    };
  });
  return import("./session");
}

async function loadAdapterModule(home: string) {
  vi.resetModules();
  vi.doMock("node:os", async (importActual) => {
    const actual = await importActual<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => home,
    };
  });
  return import(".");
}

afterEach(() => {
  vi.doUnmock("node:os");
  vi.resetModules();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Antigravity session files", () => {
  const location: ProjectLocation = {
    kind: "windows",
    path: "C:\\repo",
  };

  it("watches the Antigravity config root so cache and conversation writes wake discovery", async () => {
    const home = makeTempHome();
    const configDir = join(home, ".gemini", "antigravity-cli");
    mkdirSync(join(configDir, "conversations"), { recursive: true });

    const { resolveAntigravityWatchPaths } = await loadSessionModule(home);

    expect(resolveAntigravityWatchPaths(location)).toEqual([configDir, join(home, ".gemini")]);
  });

  it("reads the cwd mapping and newest new conversation id", async () => {
    const home = makeTempHome();
    const configDir = join(home, ".gemini", "antigravity-cli");
    const conversationsDir = join(configDir, "conversations");
    mkdirSync(join(configDir, "cache"), { recursive: true });
    mkdirSync(conversationsDir, { recursive: true });
    writeFileSync(
      join(configDir, "cache", "last_conversations.json"),
      JSON.stringify({ [location.path]: "conversation-new" }),
      "utf8",
    );
    const oldPath = join(conversationsDir, "conversation-old.pb");
    const newPath = join(conversationsDir, "conversation-new.pb");
    writeFileSync(oldPath, "");
    writeFileSync(newPath, "");
    utimesSync(oldPath, new Date("2026-05-20T00:00:00.000Z"), new Date("2026-05-20T00:00:00.000Z"));
    utimesSync(newPath, new Date("2026-05-20T00:00:01.000Z"), new Date("2026-05-20T00:00:01.000Z"));

    const {
      readAntigravityConversationIds,
      readAntigravityLastConversationForCwd,
      readNewestAntigravityConversationId,
    } = await loadSessionModule(home);

    expect(readAntigravityLastConversationForCwd(location, location.path)).toBe("conversation-new");
    expect(readAntigravityConversationIds(location)).toEqual(
      new Set(["conversation-old", "conversation-new"]),
    );
    expect(readNewestAntigravityConversationId(location, new Set(["conversation-old"]))).toBe(
      "conversation-new",
    );
  });

  it("discovers the new conversation id after launch", async () => {
    const home = makeTempHome();
    const configDir = join(home, ".gemini", "antigravity-cli");
    const conversationsDir = join(configDir, "conversations");
    mkdirSync(join(configDir, "cache"), { recursive: true });
    mkdirSync(conversationsDir, { recursive: true });
    writeFileSync(
      join(configDir, "cache", "last_conversations.json"),
      JSON.stringify({ [location.path]: "conversation-old" }),
      "utf8",
    );
    writeFileSync(join(conversationsDir, "conversation-old.pb"), "");

    const { createAntigravityAdapter } = await loadAdapterModule(home);
    const adapter = createAntigravityAdapter();

    adapter.buildLaunchArgv(location, { model: "auto" }, "hello");
    writeFileSync(
      join(configDir, "cache", "last_conversations.json"),
      JSON.stringify({ [location.path]: "conversation-new" }),
      "utf8",
    );
    writeFileSync(join(conversationsDir, "conversation-new.pb"), "");

    await expect(adapter.discoverSessionRef?.(location)).resolves.toMatchObject({
      providerSessionId: "conversation-new",
    });
  });
});
