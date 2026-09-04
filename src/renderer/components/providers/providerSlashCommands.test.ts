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
    ).toEqual(["model", "plan", "agent", "goal"]);
    expect(
      registration?.buildCommands({ hasEffort: true, supportsFast: true }).map(({ id }) => id),
    ).toEqual(["model", "plan", "agent", "goal", "effort", "fast"]);
  });

  it("builds Cursor commands from the active control capabilities", () => {
    const registration = getGuiSlashCommands("cursor");

    expect(registration).toBeDefined();
    expect(
      registration?.buildCommands({ hasEffort: false, supportsFast: false }).map(({ id }) => id),
    ).toEqual(["model", "plan", "agent"]);
    expect(
      registration?.buildCommands({ hasEffort: true, supportsFast: true }).map(({ id }) => id),
    ).toEqual(["model", "plan", "agent", "effort", "fast"]);
  });

  it("builds Muse commands without unsupported plan or goal modes", () => {
    const registration = getGuiSlashCommands("muse");

    expect(registration).toBeDefined();
    expect(
      registration?.buildCommands({ hasEffort: false, supportsFast: false }).map(({ id }) => id),
    ).toEqual(["model"]);
    expect(
      registration?.buildCommands({ hasEffort: true, supportsFast: false }).map(({ id }) => id),
    ).toEqual(["model", "effort"]);
  });

  it("offers Cursor local commands only under the SDK runtime", () => {
    const sdk = resolveAvailableSlashCommands(undefined, undefined, {
      agentKind: "cursor",
      presentationMode: "gui",
      runtimeLabel: "SDK",
    });
    expect(sdk.map(({ id }) => id)).toEqual(["model", "plan", "agent"]);

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
