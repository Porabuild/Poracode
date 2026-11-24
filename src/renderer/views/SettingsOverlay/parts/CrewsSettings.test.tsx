import { toast } from "@heroui/react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { SavedCrew } from "@/shared/crew";
import { pickRemoteSettings } from "@/shared/remote";
import { defaultSharedSettings } from "@/shared/settings";
import type { CrewHelperOptions } from "@/renderer/components/crew/crewHelperOptions";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { fakePairedHost } from "@/renderer/testUtils/pairedHost";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

const helperOptions = vi.hoisted(() => {
  const capabilities = {
    models: [
      { id: "codex-model", label: "Codex Model" },
      { id: "claude-model", label: "Claude Model" },
      { id: "gemini-model", label: "Gemini Model" },
      { id: "qwen-model", label: "Qwen Model" },
    ],
    efforts: ["low", "high"],
    modelEfforts: {
      "codex-model": ["low", "high"],
      "claude-model": ["low", "high"],
      "gemini-model": ["low", "high"],
      "qwen-model": ["low", "high"],
    },
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    presentationModes: ["gui"],
    mcpScope: { gui: "launch", terminal: "none" },
    settingDefs: [],
  };
  const providers = [
    { kind: "codex", label: "Codex", capabilities },
    { kind: "claude", label: "Claude", capabilities },
    { kind: "gemini", label: "Gemini", capabilities },
    { kind: "qwen", label: "Qwen", capabilities },
  ];
  return {
    providers,
    ranked: [],
    modelLabelOf: (selection: { model: string }) => selection.model,
    selectionFor: (agentKind: string, model: string) => ({
      agentKind,
      model,
      effort: "low",
    }),
    defaultSelectionFor: vi.fn<CrewHelperOptions["defaultSelectionFor"]>(() => ({
      agentKind: "claude",
      model: "claude-model",
      effort: "low",
    })),
  };
});

vi.mock("@/renderer/components/crew/crewHelperOptions", () => ({
  useCrewHelperOptions: () => helperOptions,
}));

import { CrewsSettings } from "./CrewsSettings";

const capabilities = {
  models: [{ id: "codex-model", label: "Codex Model" }],
  efforts: ["low", "high"],
  modelEfforts: { "codex-model": ["low", "high"] },
  modes: ["agent" as const],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server" as const,
  presentationMode: "gui" as const,
  presentationModes: ["gui" as const],
  mcpScope: { gui: "launch" as const, terminal: "none" as const },
  settingDefs: [],
};

const leadStatus: AgentStatus = {
  kind: "codex",
  label: "Codex",
  installed: true,
  authState: "authenticated",
  capabilities,
};

/** Types as a browser does: splice at the caret, move the caret, then raise `input`. */
function typeAtCaret(input: HTMLInputElement, text: string) {
  const caret = input.selectionStart ?? input.value.length;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
    input,
    input.value.slice(0, caret) + text + input.value.slice(caret),
  );
  input.setSelectionRange(caret + text.length, caret + text.length);
  fireEvent.input(input);
}

function caretOf(input: HTMLInputElement): [number | null, number | null] {
  return [input.selectionStart, input.selectionEnd];
}

describe("CrewsSettings", () => {
  beforeEach(() => {
    useSharedSettings.setState({
      crews: [],
      providerConfigs: {},
      hiddenModels: {},
      disabledAgents: [],
      crossagentPausedProviders: [],
      crossagentHiddenModels: {},
    });
    useAgentStatusesStore.setState({ agentStatuses: [leadStatus], wslAgentStatuses: [] });
    helperOptions.defaultSelectionFor.mockReset();
  });

  it("disables New crew when the new crew's lead has no helper model", () => {
    helperOptions.defaultSelectionFor.mockReturnValue(undefined);
    renderWithI18n(<CrewsSettings />);
    expect(document.querySelector('button[aria-label="New crew"]')).toBeDisabled();
    expect(helperOptions.defaultSelectionFor).toHaveBeenCalledWith(
      expect.objectContaining({ agentKind: "codex", model: "codex-model" }),
    );
  });

  it("creates valid template crews on save, duplicates with a new id, and deletes after confirmation", async () => {
    renderWithI18n(<CrewsSettings />);
    fireEvent.click(document.querySelector('button[aria-label="New crew"]')!);
    fireEvent.click(await screen.findByRole("option", { name: /^Review board/u }));
    await screen.findByRole("dialog");

    // Draft edits stay local until Save is clicked.
    expect(useSharedSettings.getState().crews).toHaveLength(0);
    expect(screen.getByRole("textbox", { name: "Crew name" })).toHaveValue("Review board");
    fireEvent.change(screen.getByRole("textbox", { name: "Crew name" }), {
      target: { value: "Board v2" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Crew first" }));
    expect(useSharedSettings.getState().crews).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useSharedSettings.getState().crews).toHaveLength(1);
    const original = useSharedSettings.getState().crews[0]!;
    expect(original).toMatchObject({
      name: "Board v2",
      policy: "crew-first",
      lead: { agentKind: "codex", model: "codex-model" },
      roles: [
        { id: "reviewer", label: "Reviewer", noEdits: true, parallel: 2 },
        { id: "sidekick", label: "Sidekick" },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Duplicate Board v2" }));
    await screen.findByRole("dialog");
    expect(useSharedSettings.getState().crews).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Crew name" })).toHaveValue("Board v2 copy");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useSharedSettings.getState().crews).toHaveLength(2);
    const duplicate = useSharedSettings.getState().crews.find((crew) => crew.id !== original.id)!;
    expect(duplicate.name).toBe("Board v2 copy");
    expect(duplicate.id).not.toBe(original.id);

    fireEvent.click(screen.getByRole("button", { name: "Delete Board v2 copy" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(useSharedSettings.getState().crews.some((crew) => crew.id === duplicate.id)).toBe(
        false,
      ),
    );
  });

  it("discards unsaved edits when closing via the X button or Cancel, and discards unsaved new/duplicated crews", async () => {
    renderWithI18n(<CrewsSettings />);

    // Cancelling a new template via the X button does not persist it.
    fireEvent.click(document.querySelector('button[aria-label="New crew"]')!);
    fireEvent.click(await screen.findByRole("option", { name: /^Blank crew/u }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByRole("textbox", { name: "Crew name" }), {
      target: { value: "Throwaway" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useSharedSettings.getState().crews).toHaveLength(0);

    // Save a crew, then edit and discard via X and Cancel.
    fireEvent.click(document.querySelector('button[aria-label="New crew"]')!);
    fireEvent.click(await screen.findByRole("option", { name: /^Blank crew/u }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByRole("textbox", { name: "Crew name" }), {
      target: { value: "WoCrew 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useSharedSettings.getState().crews[0]).toMatchObject({
      name: "WoCrew 1",
      policy: "crew-first",
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit WoCrew 1" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByRole("textbox", { name: "Crew name" }), {
      target: { value: "Work Crew 1" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Crew only" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useSharedSettings.getState().crews[0]).toMatchObject({
      name: "WoCrew 1",
      policy: "crew-first",
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit WoCrew 1" }));
    await screen.findByRole("dialog");
    expect(screen.getByRole("textbox", { name: "Crew name" })).toHaveValue("WoCrew 1");
    fireEvent.change(screen.getByRole("textbox", { name: "Crew name" }), {
      target: { value: "Cancelled rename" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useSharedSettings.getState().crews[0]?.name).toBe("WoCrew 1");

    // Cancelling a duplicate via the X button does not persist the copy.
    fireEvent.click(screen.getByRole("button", { name: "Duplicate WoCrew 1" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useSharedSettings.getState().crews).toHaveLength(1);
  });

  it("keeps text edits local without resetting cursor or crashing on empty intermediate fields and disables Save until valid", async () => {
    renderWithI18n(<CrewsSettings />);
    fireEvent.click(document.querySelector('button[aria-label="New crew"]')!);
    fireEvent.click(await screen.findByRole("option", { name: /^Blank crew/u }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByRole("textbox", { name: "Crew name" }), {
      target: { value: "WoCrew 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const upsertSpy = vi.spyOn(useSharedSettings.getState(), "upsertCrew");
    fireEvent.click(screen.getByRole("button", { name: "Edit WoCrew 1" }));
    await screen.findByRole("dialog");

    const nameInput = screen.getByRole("textbox", { name: "Crew name" }) as HTMLInputElement;
    fireEvent.focus(nameInput);
    nameInput.setSelectionRange(2, 2);
    typeAtCaret(nameInput, "r");
    expect(nameInput.value).toBe("WorCrew 1");
    expect(caretOf(nameInput)).toEqual([3, 3]);
    expect(upsertSpy).not.toHaveBeenCalled();

    // Clearing the crew name keeps the empty input and disables Save.
    fireEvent.change(nameInput, { target: { value: "" } });
    expect(nameInput.value).toBe("");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: "  Work Crew 1  " } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    // Clearing a role name or typing spaces does not crash or strip spaces mid-edit.
    fireEvent.click(screen.getByRole("button", { name: "Role details" }));
    const roleNameInput = (await screen.findByRole("textbox", {
      name: "Role name",
    })) as HTMLInputElement;
    fireEvent.change(roleNameInput, { target: { value: "" } });
    expect(roleNameInput.value).toBe("");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(roleNameInput, { target: { value: "Code " } });
    expect(roleNameInput.value).toBe("Code ");
    fireEvent.change(roleNameInput, { target: { value: "Code Reviewer" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    // Duplicate role names disable Save instead of silently dropping a role.
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    const addedRoleNameInput = (await screen.findByRole("textbox", {
      name: "Role name",
    })) as HTMLInputElement;
    fireEvent.change(addedRoleNameInput, { target: { value: "code reviewer" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(addedRoleNameInput, { target: { value: "Builder" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(upsertSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useSharedSettings.getState().crews[0]).toMatchObject({
      name: "Work Crew 1",
      roles: [
        expect.objectContaining({ label: "Code Reviewer" }),
        expect.objectContaining({ label: "Builder" }),
      ],
    });
    upsertSpy.mockRestore();
  });

  it("creates Lead + Sidekick with one Sidekick on the default helper model", async () => {
    renderWithI18n(<CrewsSettings />);
    fireEvent.click(document.querySelector('button[aria-label="New crew"]')!);
    fireEvent.click(await screen.findByRole("option", { name: /^Lead \+ Sidekick/u }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(useSharedSettings.getState().crews).toHaveLength(1));
    expect(useSharedSettings.getState().crews[0]).toMatchObject({
      name: "Lead + Sidekick",
      policy: "crew-only",
      roles: [
        {
          id: "sidekick",
          label: "Sidekick",
          brief:
            "Explores the codebase, implements the lead's task end to end, runs the narrowest checks, and reports what changed with evidence.",
          selection: { agentKind: "claude", model: "claude-model" },
        },
      ],
    });
  });

  it("creates Ship crew with a Scout, Builder and read-only Reviewer", async () => {
    renderWithI18n(<CrewsSettings />);
    fireEvent.click(document.querySelector('button[aria-label="New crew"]')!);
    fireEvent.click(await screen.findByRole("option", { name: /^Ship crew/u }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(useSharedSettings.getState().crews).toHaveLength(1));
    expect(useSharedSettings.getState().crews[0]).toMatchObject({
      name: "Ship crew",
      roles: [
        { id: "scout", label: "Scout", noEdits: true },
        { id: "builder", label: "Builder" },
        { id: "reviewer", label: "Reviewer", noEdits: true },
      ],
    });
  });

  it("persists edited roles and caps fallbacks at three on save", async () => {
    renderWithI18n(<CrewsSettings />);
    fireEvent.click(document.querySelector('button[aria-label="New crew"]')!);
    fireEvent.click(await screen.findByRole("option", { name: /^Blank crew/u }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Role details" }));
    await screen.findByText("If this agent is unavailable, try:");
    const addFallback = screen.getByRole("button", { name: "Add fallback" });
    fireEvent.click(addFallback);
    fireEvent.click(screen.getByRole("button", { name: "Add fallback" }));
    fireEvent.click(screen.getByRole("button", { name: "Add fallback" }));
    expect(screen.queryByRole("button", { name: "Add fallback" })).not.toBeInTheDocument();
    expect(useSharedSettings.getState().crews).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(useSharedSettings.getState().crews[0]?.roles[0]?.fallbacks).toHaveLength(3),
    );
    expect(useSharedSettings.getState().crews[0]?.roles[0]?.id).toBe("helper");
  });

  it("moves the crew explanations into the header info tooltip", async () => {
    function pointerPress(element: HTMLElement) {
      fireEvent.pointerDown(element, { pointerType: "mouse", button: 0 });
      fireEvent.click(element);
    }

    renderWithI18n(<CrewsSettings />);
    fireEvent.click(document.querySelector('button[aria-label="New crew"]')!);
    fireEvent.click(await screen.findByRole("option", { name: /^Blank crew/u }));
    await screen.findByRole("dialog");

    expect(screen.queryByText("New crews start as Crew only.")).not.toBeInTheDocument();
    expect(screen.queryByText(/If a role's agent is unavailable/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/The pencil-off icon marks a role told not to edit files:/),
    ).not.toBeInTheDocument();

    const info = screen.getByRole("button", { name: "How crews work" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    pointerPress(info);
    expect(info).toHaveAttribute("aria-expanded", "true");
    expect(
      await screen.findByText(/If a role's agent is unavailable, its fallbacks run\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The pencil-off icon marks a role told not to edit files:/),
    ).toBeInTheDocument();

    pointerPress(info);
    await waitFor(() => expect(info).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByText(/If a role's agent is unavailable/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/The pencil-off icon marks a role told not to edit files:/),
    ).not.toBeInTheDocument();
  });

  describe("on a paired host", () => {
    const remoteState = useRemoteServersStore.getState();
    const remoteCrew: SavedCrew = {
      id: "remote-crew",
      name: "Base crew",
      lead: { agentKind: "codex", model: "codex-model" },
      policy: "crew-first",
      roles: [
        {
          id: "helper",
          label: "Helper",
          selection: { agentKind: "claude", model: "claude-model" },
        },
      ],
    };
    let host: ReturnType<typeof fakePairedHost>;
    let machineKey: string;

    beforeEach(() => {
      host = fakePairedHost({
        settings: pickRemoteSettings({ ...defaultSharedSettings, crews: [remoteCrew] }),
        agentStatuses: [leadStatus],
      });
      machineKey = `remote:${host.connection}`;
    });
    afterEach(() => useRemoteServersStore.setState(remoteState));

    it("holds typing in the dialog, sends one write on Save, and closes only after the host takes it", async () => {
      renderWithI18n(<CrewsSettings machineKey={machineKey} />);
      fireEvent.click(await screen.findByRole("button", { name: "Edit Base crew" }));
      const nameInput = (await screen.findByRole("textbox", {
        name: "Crew name",
      })) as HTMLInputElement;

      // Each keystroke shows at once, keeps the caret, and reaches no host until Save.
      nameInput.focus();
      nameInput.setSelectionRange(5, 5);
      typeAtCaret(nameInput, "new ");
      expect(nameInput.value).toBe("Base new crew");
      expect(caretOf(nameInput)).toEqual([9, 9]);
      // A trailing space stays while typing continues; Save trims it.
      nameInput.setSelectionRange(13, 13);
      typeAtCaret(nameInput, " ");
      expect(nameInput.value).toBe("Base new crew ");
      expect(caretOf(nameInput)).toEqual([14, 14]);
      fireEvent.click(screen.getByRole("tab", { name: "Crew only" }));
      // Let any stray write reach the host before checking that typing sent none.
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
      expect(host.writes).toEqual([]);
      expect(host.settings.crews?.[0]).toMatchObject({ name: "Base crew", policy: "crew-first" });

      // While the host saves, no close route can drop the draft.
      let release!: () => void;
      host.writeGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      const saving = await waitFor(() => {
        const save = screen.getByRole("button", { name: "Save" });
        expect(save).toHaveAttribute("data-pending", "true");
        return save;
      });
      expect(saving).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      await waitFor(() => expect(host.writes).toHaveLength(1));

      release();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(host.writes).toHaveLength(1);
      expect(host.settings.crews?.[0]).toMatchObject({
        name: "Base new crew",
        policy: "crew-only",
      });
    });

    it("keeps the draft open when the host cannot save it, then saves on retry", async () => {
      const danger = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);
      renderWithI18n(<CrewsSettings machineKey={machineKey} />);
      fireEvent.click(await screen.findByRole("button", { name: "Edit Base crew" }));
      await screen.findByRole("dialog");
      fireEvent.change(screen.getByRole("textbox", { name: "Crew name" }), {
        target: { value: "Renamed crew" },
      });

      host.failWrites = true;
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(danger).toHaveBeenCalled());
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("textbox", { name: "Crew name" })).toHaveValue(
        "Renamed crew",
      );
      expect(host.settings.crews?.[0]?.name).toBe("Base crew");

      host.failWrites = false;
      await waitFor(() =>
        expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled(),
      );
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(host.writes).toHaveLength(2);
      expect(host.settings.crews?.[0]?.name).toBe("Renamed crew");
      danger.mockRestore();
    });

    it("lets the user leave when the host goes away while it is saving", async () => {
      renderWithI18n(<CrewsSettings machineKey={machineKey} />);
      fireEvent.click(await screen.findByRole("button", { name: "Edit Base crew" }));
      await screen.findByRole("dialog");

      let release!: () => void;
      host.writeGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
          "data-pending",
          "true",
        ),
      );
      expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();

      // The host drops while its write is still out.
      await act(async () => {
        host.drop();
      });
      await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
      expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      // The stranded write settles afterwards without touching the closed editor.
      release();
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
