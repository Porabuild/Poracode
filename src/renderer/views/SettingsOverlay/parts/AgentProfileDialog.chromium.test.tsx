import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@/renderer/tailwind.css";
import { I18nProvider } from "@lingui/react";
import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import { applyAppTheme } from "@/renderer/theme/applyAppTheme";
import { contrastRatio, toHex } from "@/renderer/theme/colorMath";
import { installKeyboardFieldFocus } from "@/renderer/theme/keyboardFieldFocus";
import { readCompositedCssRgba, readCssRgba } from "@/renderer/testUtils/cssColor";
import type { AgentSettingsHost } from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { opencodeProfileSupport } from "@/renderer/components/providers/opencode/profileSettings";
import { claudeProfileSupport } from "@/renderer/components/providers/settings/ClaudeProfileSettings";
import { codexProfileSupport } from "@/renderer/components/providers/codex/profileSettings";
import { AgentProfileDialog } from "./AgentProfileDialog";
import type { startOllamaModelPull } from "./ollamaModelPull";

const ollamaPullMock = vi.hoisted(() => ({
  start: vi.fn<typeof startOllamaModelPull>(),
  cancel: vi.fn<() => Promise<void>>(),
}));
const prepareContextMock = vi.hoisted(() =>
  vi.fn<(input: unknown) => Promise<string>>(async () => "poracode-ctx-88000-browser"),
);
const createProfileMock = vi.hoisted(() =>
  vi.fn<
    (payload: { id: string; driver: string; displayName?: string }) => Promise<{
      id: string;
      driver: string;
      displayName?: string;
    }>
  >(),
);

vi.mock("./ollamaModelPull", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ollamaModelPull")>()),
  startOllamaModelPull: ollamaPullMock.start,
}));
vi.mock("./ollamaModelContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ollamaModelContext")>()),
  prepareOllamaContextModel: prepareContextMock,
}));

beforeEach(() => {
  ollamaPullMock.cancel.mockReset().mockResolvedValue(undefined);
  ollamaPullMock.start.mockReset().mockImplementation(() => ({
    shellId: "ollama-pull:browser-test",
    cancel: ollamaPullMock.cancel,
  }));
  prepareContextMock.mockReset().mockResolvedValue("poracode-ctx-88000-browser");
  createProfileMock.mockReset().mockImplementation(async (payload) => ({
    id: payload.id,
    driver: payload.driver,
    ...(payload.displayName !== undefined ? { displayName: payload.displayName } : {}),
  }));
});

const html = document.documentElement;

// Mirror the runtime theme effect (src/renderer/components/ui/provider.tsx).
// Applying only the preset variables is not enough: the `.light` /
// `[data-theme]` rules in styles.css define the base palette and field wash.
function applyTheme(mode: "light" | "dark") {
  html.classList.remove("light", "dark");
  html.classList.add(mode);
  html.dataset.theme = mode;
  html.dataset.themePreset = "default";
  applyAppTheme(html, mode, "default");
}

afterEach(() => {
  cleanup();
  html.removeAttribute("data-compact-layout");
  applyTheme("light");
});

function color(css: string) {
  const [red, green, blue, alpha] = readCssRgba(css);
  expect(alpha).toBe(255);
  return toHex([red, green, blue]);
}

function compositedColor(fgCss: string, bgCss: string) {
  const [red, green, blue, alpha] = readCompositedCssRgba(fgCss, bgCss);
  expect(alpha).toBe(255);
  return toHex([red, green, blue]);
}

function railMetrics(tablist: HTMLElement) {
  const rail = tablist.closest<HTMLElement>(".agent-profile-tablist");
  expect(rail).not.toBeNull();
  const root = rail!.closest<HTMLElement>(".tabs");
  expect(root).not.toBeNull();
  return {
    railWidth: rail!.getBoundingClientRect().width,
    formWidth: root!.getBoundingClientRect().width,
  };
}

function expectEqualTabWidths(tablist: HTMLElement) {
  const widths = within(tablist)
    .getAllByRole("tab")
    .map((tab) => tab.getBoundingClientRect().width);
  expect(widths.length).toBeGreaterThan(1);
  for (const width of widths.slice(1)) {
    expect(Math.abs(width - widths[0]!)).toBeLessThanOrEqual(1);
  }
}

function expectRailFillsForm(tablist: HTMLElement) {
  const { railWidth, formWidth } = railMetrics(tablist);
  expect(Math.abs(railWidth - formWidth)).toBeLessThanOrEqual(1);
  expectEqualTabWidths(tablist);
}

function expectRailHugsContent(tablist: HTMLElement) {
  const { railWidth, formWidth } = railMetrics(tablist);
  expect(formWidth - railWidth).toBeGreaterThan(40);
}

async function useViewport(width: number, height: number) {
  const { page } = (await import("vitest/browser")) as unknown as {
    page: {
      viewport: (width: number, height: number) => Promise<void>;
      getByRole: (
        role: string,
        options: { name: string },
      ) => {
        screenshot: (options: {
          path: string;
          animations?: "allow" | "disabled";
        }) => Promise<string>;
      };
      screenshot: (options: {
        path: string;
        fullPage?: boolean;
        animations?: "allow" | "disabled";
      }) => Promise<unknown>;
    };
  };
  await page.viewport(width, height);
  return page;
}

function host(): AgentSettingsHost {
  return {
    key: "local",
    connectionKey: undefined,
    isRemote: false,
    isOnline: true,
    canWrite: true,
    machineProject: {
      id: "__machine__:posix",
      name: "Mac mini",
      disabled: false,
      createdAt: new Date(0).toISOString(),
      location: { kind: "posix", path: "~" },
    },
    canManageProfiles: true,
    canEditSecrets: true,
    callProcedure: async () => {
      throw new Error("unused");
    },
    rediscoverAgents: async () => ({ windows: [], wsl: [] }),
    setAgentSetting: () => undefined,
    saveAgentSettings: async () => undefined,
    setAgentDisabled: () => undefined,
    setHiddenModels: () => undefined,
    createProfile: createProfileMock as unknown as AgentSettingsHost["createProfile"],
    updateProfile: async () => {
      throw new Error("unused");
    },
    setProfileEnvironment: async () => {
      throw new Error("unused");
    },
    removeProfile: async () => undefined,
  } as AgentSettingsHost;
}

function renderDialog(hostOverrides: Partial<AgentSettingsHost> = {}) {
  return render(
    <I18nProvider i18n={i18n}>
      <AgentProfileDialog
        harnesses={[
          { driver: "opencode", label: msg`OpenCode`, support: opencodeProfileSupport },
          { driver: "claude", label: msg`Claude Code`, support: claudeProfileSupport },
          { driver: "codex", label: msg`Codex`, support: codexProfileSupport },
        ]}
        initialDriver="opencode"
        settingsHost={{ ...host(), ...hostOverrides }}
        agentInstances={{}}
        statuses={[]}
        onDismiss={() => undefined}
        onCreated={() => undefined}
      />
    </I18nProvider>,
  );
}

/** Pixel-composites the element's background over every layer up to the modal surface. */
function paintedFill(element: HTMLElement, surface: HTMLElement) {
  let painted = color(getComputedStyle(surface).backgroundColor);
  const layers: HTMLElement[] = [];
  for (
    let node: HTMLElement | null = element;
    node && node !== surface;
    node = node.parentElement
  ) {
    layers.push(node);
  }
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    painted = compositedColor(getComputedStyle(layers[index]!).backgroundColor, painted);
  }
  return painted;
}

function fieldPainted(element: HTMLElement, surface: HTMLElement) {
  return {
    surface: paintedFill(surface, surface),
    painted: paintedFill(element, surface),
  };
}

it.each(["light", "dark"] as const)(
  "uses one field wash for profile and Add model field surfaces in %s theme",
  async (mode) => {
    applyTheme(mode);
    const removeKeyboardFieldFocus = installKeyboardFieldFocus();
    try {
      renderDialog();
      const dialog = await screen.findByRole("dialog", { name: "Add profile" });
      const surface = document.querySelector<HTMLElement>(".modal__dialog")!;
      const name = screen.getByLabelText("New profile name");
      const nameField = fieldPainted(name, surface);
      const reference = nameField.painted;
      // Equivalent field-like controls must share the same painted wash, not
      // merely differ from the white modal surface.
      expect(reference).not.toBe(nameField.surface);
      expect(contrastRatio(color(getComputedStyle(name).color), reference)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrastRatio(color(getComputedStyle(name, "::placeholder").color), reference),
      ).toBeGreaterThanOrEqual(4.5);

      const harness = document.querySelector<HTMLElement>(".select__trigger")!;
      const harnessField = fieldPainted(harness, surface);
      expect(harnessField.painted).toBe(reference);
      expect(
        contrastRatio(color(getComputedStyle(harness).color), reference),
      ).toBeGreaterThanOrEqual(4.5);

      const model = screen.getByLabelText("Model");
      const modelGroup = model.closest<HTMLElement>(".combo-box__input-group")!;
      const modelField = fieldPainted(model, surface);
      expect(modelField.painted).toBe(reference);
      // One painted field layer: the input paints, its wrapper stays clear.
      expect(readCssRgba(getComputedStyle(modelGroup).backgroundColor)[3]).toBe(0);
      expect(contrastRatio(color(getComputedStyle(model).color), reference)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrastRatio(color(getComputedStyle(model, "::placeholder").color), reference),
      ).toBeGreaterThanOrEqual(4.5);

      const connectionRail = document.querySelector<HTMLElement>(".agent-profile-tablist")!;
      const connectionRailFill = paintedFill(connectionRail, surface);
      expect(connectionRailFill).toBe(reference);
      const selectedConnection = screen.getByRole("tab", { name: "Local Ollama" });
      expect(
        paintedFill(selectedConnection.querySelector<HTMLElement>(".tabs__indicator")!, surface),
      ).not.toBe(reference);

      fireEvent.click(screen.getByRole("tab", { name: "Other server" }));
      const address = await screen.findByLabelText("Server address");
      const addressFill = paintedFill(address, surface);
      expect(addressFill).toBe(reference);
      fireEvent.click(screen.getByRole("tab", { name: "Local Ollama" }));
      await screen.findByLabelText("Model");

      fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
      const child = await screen.findByRole("dialog", { name: "Add model" });
      const childSurface = child.closest<HTMLElement>(".modal__dialog")!;
      const ollamaTag = within(child).getByLabelText("Model");
      const childReference = paintedFill(ollamaTag, childSurface);
      expect(childReference).not.toBe(paintedFill(childSurface, childSurface));
      expect(ollamaTag).toHaveAttribute("placeholder", "Search or enter a model tag");
      expect(screen.queryByLabelText("Served model ID")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("tab", { name: "Hugging Face" }));
      for (const label of [
        "Hugging Face repository",
        "Hugging Face revision",
        "Hugging Face artifact",
        "Served model ID",
      ]) {
        const input = screen.getByLabelText(label);
        expect(paintedFill(input, childSurface)).toBe(childReference);
        expect(
          contrastRatio(color(getComputedStyle(input).color), childReference),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(color(getComputedStyle(input, "::placeholder").color), childReference),
        ).toBeGreaterThanOrEqual(4.5);
      }

      const server = screen.getByText("Ollama on the selected host");
      const serverFill = paintedFill(server, childSurface);
      expect(serverFill).toBe(childReference);
      const sourceRail = child.querySelector<HTMLElement>(".agent-profile-tablist")!;
      const sourceRailFill = paintedFill(sourceRail, childSurface);
      expect(sourceRailFill).toBe(childReference);

      fireEvent.click(screen.getByRole("tab", { name: "File" }));
      const fileLocationList = await screen.findByRole("tablist", { name: "File location" });
      const fileLocationRail = fileLocationList.closest<HTMLElement>(".agent-profile-tablist")!;
      const fileLocationRailFill = paintedFill(fileLocationRail, childSurface);
      expect(fileLocationRailFill).toBe(childReference);
      expect(screen.getByRole("button", { name: "Choose file…" })).toBeVisible();
      fireEvent.click(screen.getByRole("tab", { name: "On the server" }));
      const filePath = await screen.findByLabelText("File path on the server");
      const filePathFill = paintedFill(filePath, childSurface);
      expect(filePathFill).toBe(childReference);
      await waitFor(() => expect(dialog).toBeVisible());
    } finally {
      removeKeyboardFieldFocus();
    }
  },
);

it("types an exact context, blocks badInput, then submits the current clear/custom value", async () => {
  applyTheme("light");
  const page = await useViewport(1200, 900);
  const { userEvent } = (await import("vitest/browser")) as unknown as {
    userEvent: {
      click: (element: Element) => Promise<void>;
      keyboard: (text: string) => Promise<void>;
      clear: (element: Element) => Promise<void>;
      type: (element: Element, text: string) => Promise<void>;
    };
  };
  const remoteHost: Partial<AgentSettingsHost> = {
    isRemote: true,
    connectionKey: "browser-context-test",
    isOnline: true,
    canWrite: true,
    canManageProfiles: true,
    canOperateTerminal: true,
    canReadTerminal: true,
  };

  renderDialog(remoteHost);
  await screen.findByRole("dialog", { name: "Add profile" });
  fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Typed" } });
  fireEvent.change(screen.getByLabelText("Model"), {
    target: { value: "inkling-2-mini:latest" },
  });
  const context = screen.getByLabelText("Context length") as HTMLInputElement;
  const create = screen.getByRole("button", { name: "Create" });
  await userEvent.click(context);
  await userEvent.keyboard("-");
  await waitFor(() => expect(context).toHaveAttribute("aria-invalid", "true"));
  expect(context.validity.badInput).toBe(true);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Enter a whole number from 1000 to 10000000.",
  );
  expect(create).toBeDisabled();

  await userEvent.clear(context);
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(context).toHaveValue(null);
  expect(create).toBeEnabled();
  fireEvent.click(create);
  await waitFor(() =>
    expect(createProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.not.objectContaining({ contextLength: expect.anything() }),
      }),
    ),
  );
  expect(prepareContextMock).not.toHaveBeenCalled();

  cleanup();
  createProfileMock.mockClear();
  prepareContextMock.mockClear();
  renderDialog(remoteHost);
  await screen.findByRole("dialog", { name: "Add profile" });
  fireEvent.change(screen.getByLabelText("New profile name"), {
    target: { value: "Typed custom" },
  });
  fireEvent.change(screen.getByLabelText("Model"), {
    target: { value: "inkling-2-mini:latest" },
  });
  const custom = screen.getByLabelText("Context length") as HTMLInputElement;
  await userEvent.click(custom);
  await userEvent.type(custom, "88000");
  await waitFor(() => expect(custom).toHaveValue(88000));
  await page.getByRole("dialog", { name: "Add profile" }).screenshot({
    animations: "disabled",
    path: "../../../../../tmp/pr-shots/agent-profile-context-numeric.png",
  });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await waitFor(() =>
    expect(prepareContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ contextLength: 88000 }),
    ),
  );
  await waitFor(() =>
    expect(createProfileMock).toHaveBeenCalledWith({
      driver: "opencode",
      id: "typed-custom",
      displayName: "Typed custom",
      config: {
        connection: "local",
        endpoint: "http://127.0.0.1:11434/v1",
        model: "poracode-ctx-88000-browser",
        baseModel: "inkling-2-mini:latest",
        contextLength: 88000,
      },
    }),
  );
  expect(custom).toHaveValue(88000);
});

it("fits the compact viewport without horizontal overflow", async () => {
  applyTheme("light");
  html.setAttribute("data-compact-layout", "");
  const page = await useViewport(390, 844);
  renderDialog();
  const dialog = await screen.findByRole("dialog", { name: "Add profile" });
  await waitFor(() => expect(dialog).toBeVisible());
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
  expect(document.body.scrollWidth).toBeLessThanOrEqual(390);
  for (const name of ["Agent default", "Local Ollama", "Other server"]) {
    const tab = screen.getByRole("tab", { name });
    expect(tab.getBoundingClientRect().right).toBeLessThanOrEqual(390);
    expect(getComputedStyle(tab).fontSize).toBe("10px");
  }
  expectRailFillsForm(screen.getByRole("tablist", { name: "Connection" }));
  await page.getByRole("dialog", { name: "Add profile" }).screenshot({
    animations: "disabled",
    path: "../../../../../tmp/pr-shots/agent-profile-dialog-compact.png",
  });
  fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
  const child = await screen.findByRole("dialog", { name: "Add model" });
  await waitFor(() => expect(child).toBeVisible());
  expect(getComputedStyle(screen.getByRole("tab", { name: "Hugging Face" })).fontSize).toBe("10px");
  expectRailFillsForm(screen.getByRole("tablist", { name: "Source" }));
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
  await page.getByRole("dialog", { name: "Add model" }).screenshot({
    animations: "disabled",
    path: "../../../../../tmp/pr-shots/agent-profile-add-model-compact.png",
  });
  fireEvent.click(screen.getByRole("tab", { name: "File" }));
  const fileLocationList = await screen.findByRole("tablist", { name: "File location" });
  expect(getComputedStyle(screen.getByRole("tab", { name: "This computer" })).fontSize).toBe(
    "10px",
  );
  expectRailFillsForm(fileLocationList);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await page.getByRole("dialog", { name: "Add model" }).screenshot({
    animations: "disabled",
    path: "../../../../../tmp/pr-shots/agent-profile-add-model-file-compact.png",
  });
});

it("captures the open picker, progress, and exact-tag success at 390px without a pull", async () => {
  applyTheme("light");
  html.setAttribute("data-compact-layout", "");
  const page = await useViewport(390, 844);
  renderDialog();
  fireEvent.click(await screen.findByRole("button", { name: "Add model…" }));
  const child = await screen.findByRole("dialog", { name: "Add model" });
  const model = within(child).getByLabelText("Model");

  expect(model).toHaveAttribute("placeholder", "Search or enter a model tag");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  await waitFor(() => expect(child).toBeVisible());
  await new Promise((resolve) => setTimeout(resolve, 400));
  await page.screenshot({
    animations: "disabled",
    path: "../../../../../tmp/pr-shots/ollama-picker-closed-390.png",
    fullPage: true,
  });

  fireEvent.click(within(child).getByRole("button", { name: "Show model suggestions" }));
  expect(await screen.findByRole("option", { name: /gpt-oss/ })).toBeInTheDocument();
  expect(screen.getByText("Suggested models")).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.screenshot({
    animations: "disabled",
    path: "../../../../../tmp/pr-shots/ollama-picker-open-390.png",
    fullPage: true,
  });

  fireEvent.change(model, { target: { value: "qwen" } });
  expect(await screen.findByRole("option", { name: /qwen3:8b/ })).toBeInTheDocument();
  fireEvent.keyDown(model, { key: "ArrowDown" });
  fireEvent.keyDown(model, { key: "Enter" });
  await waitFor(() => expect(model).toHaveValue("qwen3:8b"));

  fireEvent.click(within(child).getByRole("button", { name: "Download" }));
  expect(ollamaPullMock.start).toHaveBeenCalledOnce();
  const pullInput = ollamaPullMock.start.mock.calls[0]?.[0];
  expect(pullInput?.tag).toBe("qwen3:8b");
  act(() => {
    pullInput?.onOutput("pulling manifest\n");
    pullInput?.onOutput("42%");
  });
  expect(await within(child).findByText("Downloading")).toBeVisible();
  expect(
    within(child).getByRole("progressbar", { name: "Ollama model download progress" }),
  ).toHaveAttribute("aria-valuenow", "42");
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
  await page.screenshot({
    animations: "disabled",
    path: "../../../../../tmp/pr-shots/ollama-download-progress-390.png",
    fullPage: true,
  });

  act(() => pullInput?.onComplete({ status: "success" }));
  expect(await within(child).findByText("Downloaded qwen3:8b.")).toBeVisible();
  expect(within(child).getByLabelText("Model")).toHaveValue("qwen3:8b");
  expect(within(child).queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
  await page.screenshot({
    animations: "disabled",
    path: "../../../../../tmp/pr-shots/ollama-download-success-390.png",
    fullPage: true,
  });
});

it("captures the desktop dialog at its settled 680px width", async () => {
  applyTheme("light");
  const page = await useViewport(1200, 900);
  renderDialog();
  const dialog = await screen.findByRole("dialog", { name: "Add profile" });
  await waitFor(() => expect(dialog).toBeVisible());
  for (const name of ["Agent default", "Local Ollama", "Other server"]) {
    expect(getComputedStyle(screen.getByRole("tab", { name })).fontSize).toBe("12px");
  }
  expectRailHugsContent(screen.getByRole("tablist", { name: "Connection" }));
  const surface = document.querySelector<HTMLElement>(".modal__dialog");
  expect(surface).not.toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(Math.round(surface!.getBoundingClientRect().width)).toBeLessThanOrEqual(681);
  await page.getByRole("dialog", { name: "Add profile" }).screenshot({
    animations: "disabled",
    path: "../../../../../tmp/pr-shots/agent-profile-dialog-desktop.png",
  });
  const before = surface!.getBoundingClientRect();
  fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
  const child = await screen.findByRole("dialog", { name: "Add model" });
  await waitFor(() => expect(child).toBeVisible());
  expect(getComputedStyle(screen.getByRole("tab", { name: "Hugging Face" })).fontSize).toBe("12px");
  expectRailHugsContent(screen.getByRole("tablist", { name: "Source" }));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const after = surface!.getBoundingClientRect();
  expect(Math.round(after.width)).toBe(Math.round(before.width));
  expect(Math.round(after.height)).toBe(Math.round(before.height));
  await page.getByRole("dialog", { name: "Add model" }).screenshot({
    animations: "disabled",
    path: "../../../../../tmp/pr-shots/agent-profile-add-model-desktop.png",
  });
  fireEvent.click(screen.getByRole("tab", { name: "File" }));
  await screen.findByRole("tablist", { name: "File location" });
  expect(getComputedStyle(screen.getByRole("tab", { name: "This computer" })).fontSize).toBe(
    "12px",
  );
  await new Promise((resolve) => setTimeout(resolve, 400));
  await page.getByRole("dialog", { name: "Add model" }).screenshot({
    animations: "disabled",
    path: "../../../../../tmp/pr-shots/agent-profile-add-model-file-desktop.png",
  });
});
