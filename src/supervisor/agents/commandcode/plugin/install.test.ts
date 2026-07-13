import { describe, expect, it } from "vitest";
import { mergeCommandCodeSettings, removeCommandCodeHooks } from "./install";

// A command head that matches PORACODE_FORWARD_RE (staged wrapper path).
const HEAD = "'/home/u/.poracode/agent-plugins/commandcode/poracode-hook.sh'";
const EVENTS = ["PreToolUse", "PostToolUse", "Stop"] as const;

function commandsFor(doc: Record<string, unknown>, event: string): string[] {
  const hooks = doc.hooks as Record<string, unknown> | undefined;
  const entries = hooks?.[event];
  if (!Array.isArray(entries)) return [];
  const out: string[] = [];
  for (const entry of entries) {
    const inner = (entry as { hooks?: unknown }).hooks;
    if (!Array.isArray(inner)) continue;
    for (const h of inner) {
      const cmd = (h as { command?: unknown }).command;
      if (typeof cmd === "string") out.push(cmd);
    }
  }
  return out;
}

describe("mergeCommandCodeSettings", () => {
  it("adds a Poracode hook for all three events", () => {
    const doc = mergeCommandCodeSettings({}, HEAD);
    for (const ev of EVENTS) {
      expect(commandsFor(doc, ev)).toEqual([`${HEAD} ${ev}`]);
    }
  });

  it("preserves unrelated top-level settings keys", () => {
    const doc = mergeCommandCodeSettings({ model: "kimi", tasteOnboarding: true }, HEAD);
    expect(doc.model).toBe("kimi");
    expect(doc.tasteOnboarding).toBe(true);
  });

  it("preserves the user's own non-Poracode hooks", () => {
    const existing = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: "my-own-hook.sh" }] }] },
    };
    const cmds = commandsFor(mergeCommandCodeSettings(existing, HEAD), "Stop");
    expect(cmds).toContain("my-own-hook.sh");
    expect(cmds).toContain(`${HEAD} Stop`);
    expect(cmds).toHaveLength(2);
  });

  it("is idempotent — reinstall replaces, never duplicates, the Poracode entry", () => {
    const twice = mergeCommandCodeSettings(mergeCommandCodeSettings({}, HEAD), HEAD);
    for (const ev of EVENTS) {
      expect(commandsFor(twice, ev)).toEqual([`${HEAD} ${ev}`]);
    }
  });

  it("replaces legacy Lightcode wrapper entries", () => {
    const legacyHead = "'/home/u/.poracode/agent-plugins/commandcode/lightcode-hook.sh'";
    const migrated = mergeCommandCodeSettings(mergeCommandCodeSettings({}, legacyHead), HEAD);
    for (const ev of EVENTS) {
      expect(commandsFor(migrated, ev)).toEqual([`${HEAD} ${ev}`]);
    }
  });
});

describe("removeCommandCodeHooks", () => {
  it("removes only Poracode entries, preserving user hooks and other keys", () => {
    const installed = mergeCommandCodeSettings(
      {
        model: "kimi",
        hooks: { Stop: [{ hooks: [{ type: "command", command: "my-own-hook.sh" }] }] },
      },
      HEAD,
    );
    const removed = removeCommandCodeHooks(installed);
    expect(removed.model).toBe("kimi");
    expect(commandsFor(removed, "Stop")).toEqual(["my-own-hook.sh"]);
    const hooks = removed.hooks as Record<string, unknown>;
    expect(hooks.PreToolUse).toBeUndefined();
    expect(hooks.PostToolUse).toBeUndefined();
  });

  it("drops the hooks key entirely when nothing else remains", () => {
    const removed = removeCommandCodeHooks(mergeCommandCodeSettings({}, HEAD));
    expect(removed.hooks).toBeUndefined();
  });
});
