import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { ManageModelProvidersPayload, ManageModelProvidersResult } from "@/shared/contracts";
import { ModelProviderManager } from "./ModelProviderManager";

const bridge = vi.hoisted(() => ({
  manageModelProviders:
    vi.fn<(payload: ManageModelProvidersPayload) => Promise<ManageModelProvidersResult>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge, isRemoteSession: () => false }));
const data = {
  ok: true,
  revision: "revision-one",
  catalog: [{ id: "fixture", name: "Fixture", baseURL: "https://example.com/v1" }],
  providers: [
    {
      id: "fixture",
      name: "Fixture",
      baseURL: "",
      protocol: "openai-completions",
      modelIds: [],
      custom: false,
      removable: true,
      credentialConfigured: true,
    },
  ],
} satisfies ManageModelProvidersResult;
beforeEach(() => {
  bridge.manageModelProviders.mockReset().mockResolvedValue(structuredClone(data));
});
describe("shared model provider manager", () => {
  it("creates a custom endpoint only after the required fields are valid", async () => {
    bridge.manageModelProviders.mockResolvedValueOnce({
      ok: true,
      revision: "empty",
      catalog: [],
      providers: [],
    });
    render(
      <ModelProviderManager
        agentKind="fixture-agent"
        env={{ kind: "native" }}
        onChanged={vi.fn<() => void>()}
      />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Add provider" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Add provider" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Provider ID"), { target: { value: "custom.route" } });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://example.com/v1" },
    });
    fireEvent.change(screen.getByLabelText("Model IDs, separated by commas"), {
      target: { value: "model-a, model-b, model-a" },
    });
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "fixture-secret" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Provider ID"), { target: { value: "custom-route" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bridge.manageModelProviders).toHaveBeenCalledTimes(2));
    expect(bridge.manageModelProviders).toHaveBeenLastCalledWith({
      agentKind: "fixture-agent",
      env: { kind: "native" },
      action: "save",
      create: true,
      revision: "empty",
      apiKey: "fixture-secret",
      provider: {
        id: "custom-route",
        name: "",
        baseURL: "https://example.com/v1",
        protocol: "openai-completions",
        modelIds: ["model-a", "model-b"],
      },
    });
  });
  it("edits a native provider without reading or replacing its saved key", async () => {
    const onChanged = vi.fn<() => void>();
    render(
      <ModelProviderManager
        agentKind="fixture-agent"
        env={{ kind: "native" }}
        onChanged={onChanged}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("API key")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(bridge.manageModelProviders).toHaveBeenLastCalledWith({
      agentKind: "fixture-agent",
      env: { kind: "native" },
      action: "save",
      create: false,
      revision: "revision-one",
      provider: {
        id: "fixture",
        name: "Renamed",
        baseURL: "",
        protocol: "openai-completions",
        modelIds: [],
      },
    });
  });
  it("keeps an existing native route ID when editing legacy configuration", async () => {
    bridge.manageModelProviders.mockResolvedValueOnce({
      ...data,
      providers: [
        {
          ...data.providers[0]!,
          id: "gateway.work_key",
          custom: true,
          baseURL: "https://example.com/v1",
          modelIds: ["model"],
        },
      ],
    });
    render(
      <ModelProviderManager
        agentKind="fixture-agent"
        env={{ kind: "native" }}
        onChanged={vi.fn<() => void>()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bridge.manageModelProviders).toHaveBeenCalledTimes(2));
    expect(bridge.manageModelProviders).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: false,
        provider: expect.objectContaining({ id: "gateway.work_key" }),
      }),
    );
  });
  it("routes mutations to the selected WSL environment and confirms removals", async () => {
    render(
      <ModelProviderManager
        agentKind="fixture-agent"
        env={{ kind: "wsl", distro: "FixtureLinux" }}
        onChanged={vi.fn<() => void>()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(bridge.manageModelProviders).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() => expect(bridge.manageModelProviders).toHaveBeenCalledTimes(2));
    expect(bridge.manageModelProviders).toHaveBeenLastCalledWith({
      agentKind: "fixture-agent",
      env: { kind: "wsl", distro: "FixtureLinux" },
      action: "remove",
      revision: "revision-one",
      providerId: "fixture",
    });
  });
  it("keeps edits visible after a conflict and reloads before retrying", async () => {
    render(
      <ModelProviderManager
        agentKind="fixture-agent"
        env={{ kind: "native" }}
        onChanged={vi.fn<() => void>()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    bridge.manageModelProviders.mockResolvedValueOnce({ ok: false, reason: "conflict" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider settings changed");
    expect(screen.getByLabelText("API key")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByLabelText("API key")).toBeNull();
  });
  it("offers retry when provider loading fails", async () => {
    bridge.manageModelProviders.mockRejectedValueOnce(new Error("offline"));
    render(
      <ModelProviderManager
        agentKind="fixture-agent"
        env={{ kind: "native" }}
        onChanged={vi.fn<() => void>()}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load providers.");
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(await screen.findByRole("button", { name: "Edit" })).toBeEnabled();
  });
});
