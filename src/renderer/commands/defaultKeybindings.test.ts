import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_KEYBINDINGS } from "@/shared/keybindings";
import { getCurrentProjectId } from "@/renderer/actions/currentProject";
import { useAppStore } from "@/renderer/state/appStore";
import { bindingForPlatform, canonicalizeKeybinding, type PlatformName } from "./keybindingMatcher";
import { buildCommandRegistry, buildWhenContext } from "./registry";
import { evaluateWhenClause } from "./when";

const PLATFORMS: PlatformName[] = ["darwin", "win32", "linux"];

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
      expect(commandIds.has(binding.command)).toBe(true);
    }
  });

  it("do not collide on any supported platform", () => {
    for (const platform of PLATFORMS) {
      const seen = new Map<string, string>();
      for (const binding of DEFAULT_KEYBINDINGS.keybindings) {
        const key = bindingForPlatform(binding, platform);
        const normalized = key ? canonicalizeKeybinding(key, platform) : undefined;
        if (!normalized) continue;

        expect(seen.get(normalized)).toBeUndefined();
        seen.set(normalized, binding.command);
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
    expect(evaluateWhenClause(bindings["editor.save"]?.when, { editorFocus: true })).toBe(true);
    expect(evaluateWhenClause(bindings["editor.save"]?.when, { editorOpen: true })).toBe(false);
    expect(evaluateWhenClause(bindings["star.toggle"]?.when, idleThreadContext)).toBe(true);
    expect(
      evaluateWhenClause(bindings["star.toggle"]?.when, {
        ...idleThreadContext,
        inputFocus: true,
      }),
    ).toBe(false);
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
    const starCommand = buildCommandRegistry().find((command) => command.id === "star.toggle");

    expect(getCurrentProjectId()).toBe(draftProject.id);
    expect(context.draftView).toBe(true);
    expect(context.hasProject).toBe(true);
    expect(starCommand).toBeDefined();
    expect(evaluateWhenClause(starCommand?.when, context)).toBe(true);
  });
});
