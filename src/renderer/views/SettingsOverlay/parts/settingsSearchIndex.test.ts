// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MessageDescriptor } from "@lingui/core";
import { i18n } from "@/renderer/i18n/i18n";
import { SETTINGS_SEARCH_INDEX, searchSettings } from "./settingsSearchIndex";

/** Anchor literals wired onto rows across the section components. */
function anchorsDeclaredInComponents(): Set<string> {
  const dir = import.meta.dirname;
  const anchorAttr =
    /(?:anchorId|data-settings-anchor|useIgnoreFilesAnchorId|excludePatternsAnchorId)(?:=|:\s*)"([^"]+)"/g;
  const anchors = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".tsx") || file.includes(".test.")) continue;
    const source = readFileSync(join(dir, file), "utf8");
    for (const match of source.matchAll(anchorAttr)) anchors.add(match[1]!);
  }
  return anchors;
}

const t = (descriptor: MessageDescriptor) => i18n._(descriptor);

describe("SETTINGS_SEARCH_INDEX", () => {
  it("uses unique anchors", () => {
    const anchors = SETTINGS_SEARCH_INDEX.map((entry) => entry.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  // The whole point of the index is to reuse existing catalog strings so it
  // costs no new translations. If a title/description here drifts from the real
  // source text, it would silently ship untranslated — fail loudly instead.
  // Drift guard: the index is hand-maintained alongside the JSX rows, so keep
  // the two in lockstep. Every entry must have a matching anchor wired onto a
  // row, and every wired anchor must have an entry — no orphans either way.
  it("stays in sync with the anchors wired into the section components", () => {
    const indexAnchors = new Set(SETTINGS_SEARCH_INDEX.map((entry) => entry.anchor));
    const componentAnchors = anchorsDeclaredInComponents();

    const missingFromComponents = [...indexAnchors].filter((a) => !componentAnchors.has(a));
    const orphanedInComponents = [...componentAnchors].filter((a) => !indexAnchors.has(a));

    expect(missingFromComponents).toEqual([]);
    expect(orphanedInComponents).toEqual([]);
  });

  it("references only strings present in the source catalog", () => {
    const catalog = i18n.messages;
    const missing: string[] = [];
    for (const entry of SETTINGS_SEARCH_INDEX) {
      for (const descriptor of [entry.title, entry.description]) {
        if (!descriptor) continue;
        const id = String(descriptor.id);
        if (!(id in catalog)) missing.push(`${entry.anchor}: "${id}"`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("searchSettings", () => {
  it("returns nothing for a blank query", () => {
    expect(searchSettings("", t)).toEqual([]);
    expect(searchSettings("   ", t)).toEqual([]);
  });

  it("matches a setting title and shows no snippet (the title is the line)", () => {
    const results = searchSettings("prevent sleep", t);
    const hit = results.find((r) => r.anchor === "general.preventSleep");
    expect(hit).toBeDefined();
    expect(hit?.title).toBe("Prevent sleep");
    expect(hit?.snippet).toBeNull();
  });

  it("matches description-only and surfaces the description snippet", () => {
    // "awake" is in the description, not the title.
    const results = searchSettings("awake", t);
    const hit = results.find((r) => r.anchor === "general.preventSleep");
    expect(hit).toBeDefined();
    expect(hit?.snippet).not.toBeNull();
    expect(hit?.snippet?.toLowerCase()).toContain("awake");
  });

  it("matches keywords and falls back to the title when there is no description", () => {
    // "frosted" is only a keyword of Translucent sidebar, which has no description.
    const results = searchSettings("frosted", t);
    const hit = results.find((r) => r.anchor === "appearance.translucentSidebar");
    expect(hit).toBeDefined();
    expect(hit?.title).toBe("Translucent sidebar");
    expect(hit?.snippet).toBeNull();
  });

  it("is case-insensitive", () => {
    const lower = searchSettings("cookies", t).map((r) => r.anchor);
    const upper = searchSettings("COOKIES", t).map((r) => r.anchor);
    expect(upper).toEqual(lower);
    expect(lower).toContain("browser.allowDataAccess");
  });

  it("finds the Skills and MCP settings", () => {
    expect(searchSettings("skills", t).map((result) => result.anchor)).toContain("skills.manage");
    expect(searchSettings("shared", t).map((result) => result.anchor)).toContain("skills.manage");
    expect(searchSettings("mcp", t).map((result) => result.anchor)).toContain("mcpServers.manage");
    expect(searchSettings("crossagent routing", t).map((result) => result.anchor)).toContain(
      "mcpServers.manage",
    );
  });

  it("hides dev-only settings unless dev mode is on", () => {
    const anchor = "dev.disableCliHookPlugin";
    expect(searchSettings("hook plugin", t).map((r) => r.anchor)).not.toContain(anchor);
    expect(searchSettings("hook plugin", t, { devMode: true }).map((r) => r.anchor)).toContain(
      anchor,
    );
  });

  it("hides desktop-only settings in remote sessions", () => {
    const anchors = searchSettings("auto", t, { remoteSession: true }).map((r) => r.anchor);
    expect(anchors).not.toContain("threads.autoArchiveDoneAfter");
    expect(anchors).not.toContain("usage.autoRefreshMinutes");
    expect(anchors).not.toContain("terminal.autoShowTerminalPanel");
    expect(
      searchSettings("side-by-side", t, { remoteSession: true }).map((r) => r.anchor),
    ).not.toContain("general.defaultNewThread");
    expect(
      searchSettings("home scope", t, { remoteSession: true }).map((r) => r.anchor),
    ).not.toContain("general.homeScope");
    expect(searchSettings("lsp", t, { remoteSession: true }).map((r) => r.anchor)).not.toContain(
      "general.editorLsp",
    );
    expect(
      searchSettings("quick remove", t, { remoteSession: true }).map((r) => r.anchor),
    ).not.toContain("threads.defaultThreadRemoval");
    expect(
      searchSettings("confirm delete", t, { remoteSession: true }).map((r) => r.anchor),
    ).not.toContain("threads.confirmThreadDelete");
    expect(searchSettings("panel", t, { remoteSession: true }).map((r) => r.anchor)).not.toContain(
      "terminal.terminalPosition",
    );
    expect(searchSettings("picker", t, { remoteSession: true }).map((r) => r.anchor)).not.toContain(
      "terminal.cliPickerTarget",
    );
    expect(searchSettings("glass", t, { remoteSession: true }).map((r) => r.anchor)).not.toContain(
      "appearance.translucentSidebar",
    );
    expect(
      searchSettings("review mode", t, { remoteSession: true }).map((r) => r.anchor),
    ).not.toContain("git.gitReviewMode");
    expect(
      searchSettings("cookies", t, { remoteSession: true }).map((r) => r.anchor),
    ).not.toContain("browser.allowDataAccess");
  });

  it("hides Windows-only settings on other desktop platforms", () => {
    const nonWindows = searchSettings("windows terminal shell", t, { windows: false }).map(
      (result) => result.anchor,
    );
    const windows = searchSettings("windows terminal shell", t, { windows: true }).map(
      (result) => result.anchor,
    );

    expect(nonWindows).not.toContain("terminal.windowsShell");
    expect(nonWindows).not.toContain("terminal.windowsInternalShell");
    expect(nonWindows).not.toContain("terminal.windowsShellArguments");
    expect(windows).toContain("terminal.windowsShell");
    expect(windows).toContain("terminal.windowsInternalShell");
    expect(windows).toContain("terminal.windowsShellArguments");
    expect(searchSettings("powershell", t).map((result) => result.anchor)).not.toContain(
      "terminal.windowsShell",
    );
  });

  it("truncates long description snippets", () => {
    const results = searchSettings("subscription plans", t);
    const hit = results.find((r) => r.anchor === "usage.showEstimatedCost");
    expect(hit?.snippet).toBeDefined();
    expect(hit?.snippet?.endsWith("…")).toBe(true);
  });
});
