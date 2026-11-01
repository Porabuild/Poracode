// @vitest-environment node

import { describe, expect, it } from "vitest";
import "./codex";
import "./cursor";
import "./muse";
import {
  resolveAvailableSlashCommands,
  resolveLocalSlashCommandAction,
} from "../thread/threadSlashCommands";
import { getGuiSlashCommands } from "./providerSlashCommands";

describe("provider slash-command registry", () => {
  it("builds Codex commands from the active control capabilities", () => {
    const registration = getGuiSlashCommands("codex:work");

    expect(registration).toBeDefined();
    expect(
      registration?.buildCommands({ hasEffort: false, supportsFast: false }).map(({ id }) => id),
    ).toEqual(["model", "crew", "plan", "agent", "goal"]);
    expect(
      registration?.buildCommands({ hasEffort: true, supportsFast: true }).map(({ id }) => id),
    ).toEqual(["model", "crew", "plan", "agent", "goal", "effort", "fast"]);
  });

  it("builds Cursor commands from the active control capabilities", () => {
    const registration = getGuiSlashCommands("cursor");

    expect(registration).toBeDefined();
    expect(
      registration?.buildCommands({ hasEffort: false, supportsFast: false }).map(({ id }) => id),
    ).toEqual(["model", "crew", "plan", "agent"]);
    expect(
      registration?.buildCommands({ hasEffort: true, supportsFast: true }).map(({ id }) => id),
    ).toEqual(["model", "crew", "plan", "agent", "effort", "fast"]);
  });

  it("builds Muse commands without unsupported plan modes", () => {
    const registration = getGuiSlashCommands("muse");

    expect(registration).toBeDefined();
    // `/compact` and `/goal` are the Muse TUI built-ins the session protocol
    // exposes; both submit to the provider.
    expect(
      registration?.buildCommands({ hasEffort: false, supportsFast: false }).map(({ id }) => id),
    ).toEqual(["model", "crew", "compact", "goal"]);
    expect(
      registration?.buildCommands({ hasEffort: true, supportsFast: false }).map(({ id }) => id),
    ).toEqual(["model", "crew", "compact", "goal", "effort"]);
  });

  it("offers Cursor local commands only under the SDK runtime", () => {
    const sdk = resolveAvailableSlashCommands(undefined, undefined, {
      agentKind: "cursor",
      presentationMode: "gui",
      runtimeLabel: "SDK",
    });
    expect(sdk.map(({ id }) => id)).toEqual(["model", "crew", "plan", "agent"]);

    // ACP sessions keep the commands cursor-agent reports itself.
    const acp = resolveAvailableSlashCommands(
      [{ id: "summarize", label: "summarize" }],
      undefined,
      { agentKind: "cursor", presentationMode: "gui", runtimeLabel: "ACP" },
    );
    expect(acp.map(({ id }) => id)).toEqual(["summarize"]);

    expect(
      resolveLocalSlashCommandAction("/model", {
        agentKind: "cursor",
        presentationMode: "gui",
        runtimeLabel: "SDK",
      }),
    ).toEqual({ kind: "open-control", target: "model" });
    expect(
      resolveLocalSlashCommandAction("/model", {
        agentKind: "cursor",
        presentationMode: "gui",
        runtimeLabel: "ACP",
      }),
    ).toBeNull();
  });

  it.each([
    [" /MODEL ", { kind: "open-control", target: "model" }],
    ["/effort", { kind: "open-control", target: "effort" }],
    ["/fast", { kind: "toggle-fast" }],
    ["/plan", { kind: "set-mode", mode: "plan" }],
    ["/agent", { kind: "set-mode", mode: "agent" }],
    ["/goal", null],
  ])("resolves local action %s", (typed, expected) => {
    expect(getGuiSlashCommands("codex")?.resolveLocalAction(typed)).toEqual(expected);
    expect(getGuiSlashCommands("cursor")?.resolveLocalAction(typed)).toEqual(expected);
  });

  it("appends session commands after the local set when the registration opts in", () => {
    const commands = resolveAvailableSlashCommands(
      [{ id: "summarize", label: "summarize" }],
      undefined,
      {
        agentKind: "cursor",
        presentationMode: "gui",
        runtimeLabel: "SDK",
        skillCommands: [{ id: "one", label: "one", section: "skills" }],
      },
    );

    expect(commands.map(({ id }) => id)).toEqual([
      "model",
      "crew",
      "plan",
      "agent",
      "summarize",
      "one",
    ]);
  });

  it("drops session commands colliding with local commands or skills", () => {
    const commands = resolveAvailableSlashCommands(
      [
        { id: "model", label: "model" },
        { id: "one", label: "one" },
        { id: "summarize", label: "summarize" },
      ],
      undefined,
      {
        agentKind: "cursor",
        presentationMode: "gui",
        runtimeLabel: "SDK",
        skillCommands: [{ id: "one", label: "one", section: "skills" }],
      },
    );

    expect(commands.map(({ id }) => id)).toEqual([
      "model",
      "crew",
      "plan",
      "agent",
      "summarize",
      "one",
    ]);
  });

  it("ignores session commands when the registration does not opt in", () => {
    const commands = resolveAvailableSlashCommands(
      [{ id: "summarize", label: "summarize" }],
      undefined,
      { agentKind: "codex", presentationMode: "gui" },
    );

    expect(commands.map(({ id }) => id)).not.toContain("summarize");
  });

  it("never appends the install-time capability catalog as session commands", () => {
    const commands = resolveAvailableSlashCommands(
      undefined,
      [{ id: "capability-only", label: "capability-only" }],
      { agentKind: "cursor", presentationMode: "gui", runtimeLabel: "SDK" },
    );

    expect(commands.map(({ id }) => id)).toEqual(["model", "crew", "plan", "agent"]);
  });

  it.each([
    [" /MODEL ", { kind: "open-control", target: "model" }],
    ["/effort", { kind: "open-control", target: "effort" }],
    ["/fast", null],
    ["/plan", null],
    ["/agent", null],
    ["/goal", null],
  ])("resolves Muse local action %s", (typed, expected) => {
    expect(getGuiSlashCommands("muse")?.resolveLocalAction(typed)).toEqual(expected);
  });
});
