import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COMPOSER_CONTROL_COMMAND_IDS,
  DEFAULT_KEYBINDINGS,
  QUICK_COMPOSER_COMMAND_ID,
} from "@/shared/keybindings";
import { getCurrentProjectId } from "@/renderer/actions/currentProject";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useFindFocusStore } from "@/renderer/state/findFocusStore";
import { bindingForPlatform, canonicalizeKeybinding, type PlatformName } from "./keybindingMatcher";
import { buildCommandRegistry, buildWhenContext } from "./registry";
import { evaluateWhenClause } from "./when";

const PLATFORMS: PlatformName[] = ["darwin", "win32", "linux"];

const COMPOSER_COMMANDS = new Set<string>(COMPOSER_CONTROL_COMMAND_IDS);

/** Composer-control bindings only fire while the composer is focused; the rest
 * are scoped to !composerFocus. Treat the two as separate keyspaces so they may
 * intentionally reuse a chord (e.g. Ctrl+P) without counting as a collision. */
function isComposerScoped(command: string): boolean {
  return COMPOSER_COMMANDS.has(command);
}

/** Surface-tab bindings fire only while the editor or terminal holds focus —
 * disjoint from both the composer and the global (chat) scope — so they may
 * intentionally reuse global chords (e.g. Ctrl+Shift+], owned by thread.next in
 * the disjoint chat scope). Bucket them as their own keyspace. */
const SURFACE_TAB_COMMANDS = new Set<string>(["tab.next", "tab.previous"]);

function keyspaceFor(command: string): "composer" | "surface" | "global" {
  if (COMPOSER_COMMANDS.has(command)) return "composer";
  if (SURFACE_TAB_COMMANDS.has(command)) return "surface";
  return "global";
}

describe("default keybindings", () => {
  beforeEach(() => {
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      view: { kind: "home" },
      focusedPaneId: null,
    }));
  });

  it("reference registered commands", () => {
    const commandIds = new Set(buildCommandRegistry().map((command) => command.id));

    for (const binding of DEFAULT_KEYBINDINGS.keybindings) {
      // Composer controls are dispatched locally by the focused composer, and
      // Quick Composer is registered globally by the main process.
      if (isComposerScoped(binding.command) || binding.command === QUICK_COMPOSER_COMMAND_ID) {
        continue;
      }
      expect(commandIds.has(binding.command)).toBe(true);
    }
  });

  it("do not collide on any supported platform within a keyspace", () => {
    for (const platform of PLATFORMS) {
      const seen = new Map<string, string>();
      for (const binding of DEFAULT_KEYBINDINGS.keybindings) {
        const key = bindingForPlatform(binding, platform);
        const normalized = key ? canonicalizeKeybinding(key, platform) : undefined;
        if (!normalized) continue;

        // Namespace by keyspace so chords in disjoint focus scopes (composer,
        // surface-tab, global) can intentionally coincide without colliding.
        const slot = `${keyspaceFor(binding.command)}:${normalized}`;
        expect(seen.get(slot)).toBeUndefined();
        seen.set(slot, binding.command);
      }
    }
  });

  it("match intended app contexts", () => {
    const bindings = Object.fromEntries(
      DEFAULT_KEYBINDINGS.keybindings.map((binding) => [binding.command, binding]),
    );
    const idleThreadContext = {
      hasProject: true,
      hasThread: true,
      threadView: true,
      inputFocus: false,
      editorFocus: false,
      terminalFocus: false,
    };

    expect(evaluateWhenClause(bindings["pane.close"]?.when, idleThreadContext)).toBe(true);
    expect(
      evaluateWhenClause(bindings["pane.close"]?.when, {
        ...idleThreadContext,
        inputFocus: true,
      }),
    ).toBe(false);
    expect(
      evaluateWhenClause(bindings["pane.close"]?.when, {
        ...idleThreadContext,
        panelFocus: true,
      }),
    ).toBe(false);
    expect(
      evaluateWhenClause(bindings["pane.close"]?.when, {
        ...idleThreadContext,
        browserFocus: true,
      }),
    ).toBe(false);
    expect(
      evaluateWhenClause(bindings["pane.close"]?.when, {
        ...idleThreadContext,
        composerFocus: true,
      }),
    ).toBe(false);
    expect(evaluateWhenClause(bindings["palette.open"]?.when, idleThreadContext)).toBe(true);
    expect(
      evaluateWhenClause(bindings["palette.open"]?.when, {
        ...idleThreadContext,
        panelFocus: true,
      }),
    ).toBe(false);
    expect(
      evaluateWhenClause(bindings["palette.open"]?.when, {
        ...idleThreadContext,
        browserFocus: true,
      }),
    ).toBe(false);
    expect(
      evaluateWhenClause(bindings["palette.open"]?.when, {
        ...idleThreadContext,
        composerFocus: true,
      }),
    ).toBe(false);
    expect(evaluateWhenClause(bindings["editor.save"]?.when, { editorFocus: true })).toBe(true);
    expect(evaluateWhenClause(bindings["editor.save"]?.when, { editorOpen: true })).toBe(false);

    // Archive-thread fires from the sidebar or a side panel, never while typing.
    const archive = bindings["thread.archive"]?.when;
    expect(evaluateWhenClause(archive, { hasThread: true, sidebarFocus: true })).toBe(true);
    expect(evaluateWhenClause(archive, { hasThread: true, panelFocus: true })).toBe(true);
    expect(evaluateWhenClause(archive, { hasThread: true, composerFocus: true })).toBe(false);
    expect(evaluateWhenClause(archive, { hasThread: false, sidebarFocus: true })).toBe(false);

    // Toggle-star shares archive's scope: sidebar or side panel, never typing.
    const star = bindings["thread.star"]?.when;
    expect(evaluateWhenClause(star, { hasThread: true, sidebarFocus: true })).toBe(true);
    expect(evaluateWhenClause(star, { hasThread: true, panelFocus: true })).toBe(true);
    expect(evaluateWhenClause(star, { hasThread: true, panelFocus: true, inputFocus: true })).toBe(
      false,
    );
    expect(evaluateWhenClause(star, { hasThread: true, composerFocus: true })).toBe(false);
    expect(evaluateWhenClause(star, { hasThread: false, sidebarFocus: true })).toBe(false);
    expect(evaluateWhenClause(star, { draftView: true })).toBe(true);
    expect(evaluateWhenClause(star, { draftView: true, inputFocus: true })).toBe(false);

    // Rename-chat shares archive/star's scope: sidebar or side panel, never typing.
    const rename = bindings["thread.rename"]?.when;
    expect(evaluateWhenClause(rename, { hasThread: true, sidebarFocus: true })).toBe(true);
    expect(evaluateWhenClause(rename, { hasThread: true, panelFocus: true })).toBe(true);
    expect(evaluateWhenClause(rename, { hasThread: true, composerFocus: true })).toBe(false);
    expect(evaluateWhenClause(rename, { hasThread: false, sidebarFocus: true })).toBe(false);

    // Focus-address-bar only fires while the in-app browser holds focus.
    const focusAddress = bindings["browser.focus-address-bar"]?.when;
    expect(evaluateWhenClause(focusAddress, { browserFocus: true })).toBe(true);
    expect(evaluateWhenClause(focusAddress, { browserFocus: false })).toBe(false);
    expect(evaluateWhenClause(focusAddress, { composerFocus: true })).toBe(false);

    // Open-browser-tab is browser-scoped too, so it can safely reuse Ctrl+T —
    // the composer owns that chord only within the disjoint composerFocus scope.
    const newTab = bindings["browser.tab.new"]?.when;
    expect(evaluateWhenClause(newTab, { browserFocus: true })).toBe(true);
    expect(evaluateWhenClause(newTab, { browserFocus: false })).toBe(false);
    expect(evaluateWhenClause(newTab, { composerFocus: true })).toBe(false);

    // Next/previous chat switch from anywhere in the chat shell — including while
    // composing — but yield to the editor, terminal, and in-app browser, where
    // these chords carry a local meaning.
    for (const id of ["thread.next", "thread.previous"] as const) {
      const when = bindings[id]?.when;
      expect(evaluateWhenClause(when, { hasThread: true })).toBe(true);
      expect(evaluateWhenClause(when, { hasThread: true, composerFocus: true })).toBe(true);
      expect(evaluateWhenClause(when, { hasThread: true, panelFocus: true })).toBe(true);
      expect(evaluateWhenClause(when, { hasThread: true, sidebarFocus: true })).toBe(true);
      expect(evaluateWhenClause(when, { hasThread: true, editorFocus: true })).toBe(false);
      expect(evaluateWhenClause(when, { hasThread: true, terminalFocus: true })).toBe(false);
      expect(evaluateWhenClause(when, { hasThread: true, browserFocus: true })).toBe(false);
      expect(evaluateWhenClause(when, { hasThread: false })).toBe(false);
    }

    // Next/previous tab switch only while the editor or terminal holds focus —
    // the exact complement of next/previous chat, which yields those surfaces.
    for (const id of ["tab.next", "tab.previous"] as const) {
      const when = bindings[id]?.when;
      expect(evaluateWhenClause(when, { editorFocus: true })).toBe(true);
      expect(evaluateWhenClause(when, { terminalFocus: true })).toBe(true);
      expect(evaluateWhenClause(when, {})).toBe(false);
      expect(evaluateWhenClause(when, { composerFocus: true })).toBe(false);
      expect(evaluateWhenClause(when, { browserFocus: true })).toBe(false);
    }
  });

  it("treats the focused split draft pane as draft context", () => {
    const firstProject = useAppStore.getState().addProject({ kind: "windows", path: "C:\\one" });
    const draftProject = useAppStore.getState().addProject({ kind: "windows", path: "C:\\two" });
    const thread = useAppStore.getState().createThread({
      projectId: firstProject.id,
      agentKind: "codex",
      config: { model: "gpt-5.5", effort: "high" },
      prompt: "hello",
    });
    useAppStore.getState().updateProjectDraftConfig(draftProject.id, {
      agentKind: "codex",
      model: "gpt-5.5",
      effort: "high",
      mode: "agent",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      worktreeMode: false,
    });

    const draftPaneId = `draft:${draftProject.id}#test`;
    useAppStore.setState({
      view: { kind: "thread", panes: [thread.id, draftPaneId] },
      focusedPaneId: draftPaneId,
    });

    const context = buildWhenContext(null);
    const starCommand = buildCommandRegistry().find((command) => command.id === "thread.star");

    expect(getCurrentProjectId()).toBe(draftProject.id);
    expect(context.draftView).toBe(true);
    expect(context.hasProject).toBe(true);
    expect(starCommand).toBeDefined();
    expect(evaluateWhenClause(starCommand?.when, context)).toBe(true);
  });
});

describe("command execution context", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    useFileEditorStore.setState({ tabs: [], activePath: null });
    useFindFocusStore.setState({ settingsFocusToken: 0, treeFocusToken: 0 });
    useDevTerminalStore.setState({
      activeProjectId: null,
      activeWorktreePath: null,
      tabs: [],
      activeTabId: null,
    });
  });

  it("cycles editor tabs from the originating target after focus moves", () => {
    document.body.innerHTML = `
      <div class="monaco-editor"><button id="origin">Editor</button></div>
      <input id="palette" />
    `;
    const origin = document.getElementById("origin");
    document.getElementById("palette")?.focus();
    useFileEditorStore.setState({ tabs: ["one.ts", "two.ts"], activePath: "one.ts" });

    const command = buildCommandRegistry().find((item) => item.id === "tab.next");
    void command?.run(undefined, { target: origin });

    expect(useFileEditorStore.getState().activePath).toBe("two.ts");
  });

  it("opens Find on the originating surface after focus moves", () => {
    document.body.innerHTML = `
      <div data-poracode-find-scope="settings"><button id="origin">Settings</button></div>
      <input id="palette" />
    `;
    const origin = document.getElementById("origin");
    document.getElementById("palette")?.focus();

    const command = buildCommandRegistry().find((item) => item.id === "find.open");
    void command?.run(undefined, { target: origin });

    expect(useFindFocusStore.getState().settingsFocusToken).toBe(1);
  });

  it("cycles terminal tabs from the originating target after focus moves", () => {
    document.body.innerHTML = `
      <div class="xterm"><button id="origin">Terminal</button></div>
      <input id="palette" />
    `;
    const origin = document.getElementById("origin");
    document.getElementById("palette")?.focus();
    useDevTerminalStore.setState({
      activeProjectId: "project-1",
      activeWorktreePath: null,
      tabs: [
        { id: "one", projectId: "project-1", title: "One", createdAt: "2026-01-01" },
        { id: "two", projectId: "project-1", title: "Two", createdAt: "2026-01-02" },
      ],
      activeTabId: "two",
    });

    const command = buildCommandRegistry().find((item) => item.id === "tab.previous");
    void command?.run(undefined, { target: origin });

    expect(useDevTerminalStore.getState().activeTabId).toBe("one");
  });

  it("focuses the address bar in the originating browser instance", () => {
    document.body.innerHTML = `
      <div data-poracode-browser>
        <button id="origin">Browser</button>
        <input data-poracode-browser-address value="https://poracode.dev" />
      </div>
      <input id="palette" />
    `;
    const origin = document.getElementById("origin");
    const address = document.querySelector<HTMLInputElement>("[data-poracode-browser-address]");
    document.getElementById("palette")?.focus();

    const command = buildCommandRegistry().find((item) => item.id === "browser.focus-address-bar");
    void command?.run(undefined, { target: origin });

    expect(document.activeElement).toBe(address);
    expect(address?.selectionStart).toBe(0);
    expect(address?.selectionEnd).toBe(address?.value.length);
  });
});
