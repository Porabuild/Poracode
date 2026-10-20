import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { NativeVisualInput } from "@/shared/nativeVisuals";
import { AppProvider } from "@/renderer/components/ui/provider";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import {
  NATIVE_VISUAL_UI_KEY,
  nativeVisualUiKey,
  useNativeVisualUiStore,
} from "@/renderer/state/nativeVisualUiStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  clearManagedParentAuthority,
  publishManagedParentAuthority,
} from "@/renderer/state/remoteServers/managedLoopbackOwner";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { NativeVisual } from "./NativeVisual";

const source = JSON.stringify({
  inputs: [{ id: "seats", label: "Seats", min: 1, max: 100, step: 1, value: 25 }],
  blocks: [
    {
      type: "chart",
      kind: "bar",
      title: "Monthly cost",
      labels: ["Essential", "Scale"],
      series: [
        {
          label: "Monthly total",
          values: [
            { op: "multiply", args: [{ input: "seats" }, 16] },
            { op: "multiply", args: [{ input: "seats" }, 26] },
          ],
        },
      ],
    },
    {
      type: "outputs",
      items: [
        {
          label: "Difference",
          value: { op: "multiply", args: [{ input: "seats" }, 10] },
          format: { style: "currency", currency: "USD" },
        },
      ],
    },
  ],
});
const props = {
  source,
  title: "Plan calculator",
  version: 1,
  complete: true,
  isStreaming: false,
  threadId: "visual-thread",
  itemId: "original-item",
  ordinal: 0,
  limited: false,
};
const settings = useSharedSettings.getState();
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalGetAnimations = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations");

beforeAll(() => {
  // JSDOM has no Web Animations API; tab transitions inspect active animations.
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});

afterAll(() => {
  if (originalGetAnimations)
    Object.defineProperty(Element.prototype, "getAnimations", originalGetAnimations);
  else Reflect.deleteProperty(Element.prototype, "getAnimations");
});

beforeEach(() => {
  vi.stubGlobal(
    "CSS",
    Object.assign(Object.create(globalThis.CSS ?? null), { supports: () => true }),
  );
  useNativeVisualUiStore.setState({ entries: new Map() });
  localStorage.removeItem(NATIVE_VISUAL_UI_KEY);
  useRemoteServersStore.setState({ servers: [] });
  useAppStore.setState({ threads: [], view: { kind: "home" } });
  useAppStore.getState().createThread({
    threadId: props.threadId,
    projectId: "visual-project",
    agentKind: "test-agent",
    config: { model: "auto" },
    prompt: "Visual fixture",
    focus: false,
    suppressHostCreateIntent: true,
  });
  useSharedSettings.setState({ locale: "en" });
  publishManagedParentAuthority({
    hostDesktopId: "visual-host",
    endpoint: "http://127.0.0.1:1/",
    sshEnvironments: false,
    scopes: [],
    client: {} as RemoteDesktopClient,
    accessToken: () => undefined,
  });
});

afterEach(async () => {
  cleanup();
  clearManagedParentAuthority();
  localStorage.removeItem(NATIVE_VISUAL_UI_KEY);
  useNativeVisualUiStore.setState({ entries: new Map() });
  useAppStore.setState({ threads: [], view: { kind: "home" } });
  useRemoteServersStore.setState({ servers: [] });
  useSharedSettings.setState({ themeMode: settings.themeMode, locale: settings.locale });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  await dynamicActivate("en");
});

describe("native app-owned visuals", () => {
  it("uses the actual owning host and canonical thread for persisted inputs", async () => {
    const server = {
      connectionId: "visual-connection",
      desktopId: "host-a",
      label: "Visual host",
      endpoint: "http://127.0.0.1:1/",
      accessToken: "fixture",
      scopes: [],
    };
    useRemoteServersStore.setState({ servers: [server] });
    useAppStore.setState((state) => ({
      threads: state.threads.map((thread) => ({
        ...thread,
        remoteServerId: server.connectionId,
        remoteId: "canonical-thread",
      })),
    }));
    render(
      <AppProvider>
        <NativeVisual {...props} />
      </AppProvider>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Seats" }), {
      target: { value: "30" },
    });
    fireEvent.blur(screen.getByRole("textbox", { name: "Seats" }));
    const key = nativeVisualUiKey("host-a", "canonical-thread", props.itemId, 0, source);
    await waitFor(() =>
      expect(useNativeVisualUiStore.getState().entries.get(key)?.inputs).toEqual([["seats", 30]]),
    );
    expect(
      [...useNativeVisualUiStore.getState().entries.values()].every(
        (entry) => entry.hostId === "host-a",
      ),
    ).toBe(true);
    await act(async () => {
      await useRemoteServersStore.setState({ servers: [{ ...server, desktopId: "host-b" }] });
    });
    expect(screen.getByRole("textbox", { name: "Seats" })).toHaveValue("25");
    await act(async () => {
      await useRemoteServersStore.setState({ servers: [server] });
    });
    expect(screen.getByRole("textbox", { name: "Seats" })).toHaveValue("30");
  });

  it("keeps unresolved remote ownership memory-only instead of using the managed host", async () => {
    useAppStore.setState((state) => ({
      threads: state.threads.map((thread) => ({
        ...thread,
        remoteServerId: "unavailable-connection",
        remoteId: "canonical-thread",
      })),
    }));
    render(
      <AppProvider>
        <NativeVisual {...props} />
      </AppProvider>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Seats" }), {
      target: { value: "30" },
    });
    fireEvent.blur(screen.getByRole("textbox", { name: "Seats" }));
    const key = nativeVisualUiKey(undefined, "canonical-thread", props.itemId, 0, source);
    await waitFor(() =>
      expect(useNativeVisualUiStore.getState().entries.get(key)?.inputs).toEqual([["seats", 30]]),
    );
    expect(localStorage.getItem(NATIVE_VISUAL_UI_KEY)).not.toContain("seats");
  });

  it("calculates, changes chart mode and retains state through source/theme/zoom/expanded view/reopen", async () => {
    const { container, unmount } = render(
      <AppProvider>
        <NativeVisual {...props} />
      </AppProvider>,
    );
    expect(screen.getByRole("button", { name: "Fit to width" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("$250.00")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Seats" })).toHaveValue("25");
    fireEvent.change(screen.getByRole("textbox", { name: "Seats" }), {
      target: { value: "30" },
    });
    fireEvent.blur(screen.getByRole("textbox", { name: "Seats" }));
    await waitFor(() => expect(screen.getByText("$300.00")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Show data table" }));
    expect(screen.getByRole("grid", { name: "Monthly cost" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(container.querySelector<HTMLElement>("[data-native-visual-zoom]")?.style.zoom).toBe(
      "1.25",
    );
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(container.querySelector("pre")?.textContent).toBe(source);
    await act(async () => {
      useSharedSettings.getState().setThemeMode("light");
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("button", { name: "Show chart" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Expand visual" }));
    const dialog = await screen.findByRole("dialog", { name: "Plan calculator" });
    expect(within(dialog).getByRole("textbox", { name: "Seats" })).toHaveValue("30");
    expect(within(dialog).getByText("$300.00")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Show chart" })).toBeTruthy();
    unmount();
    render(
      <AppProvider>
        <NativeVisual {...props} />
      </AppProvider>,
    );
    expect(screen.getByRole("textbox", { name: "Seats" })).toHaveValue("30");
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("125%");
    fireEvent.click(screen.getByRole("button", { name: "Reset inputs" }));
    await waitFor(() => expect(screen.getByText("$250.00")).toBeTruthy());
  });

  it("renders author HTML/RTC/fresh-realm/worker/host-call strings only as text", () => {
    const author =
      '<script>new RTCPeerConnection();new Worker("/probe");window.poracode.invoke("tools/call")</script><iframe srcdoc="attack"></iframe>';
    const value = JSON.stringify({
      description: author,
      blocks: [{ type: "table", columns: [{ label: "Source text" }], rows: [[author]] }],
    });
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
    const post = vi.spyOn(window, "postMessage");
    const { container } = render(
      <AppProvider>
        <NativeVisual {...props} source={value} />
      </AppProvider>,
    );
    expect(container.textContent).toContain(author);
    expect(
      container.querySelector("iframe, script, img, base, object, embed, foreignObject"),
    ).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    window.dispatchEvent(
      new MessageEvent("message", { data: { jsonrpc: "2.0", id: 1, method: "ui/initialize" } }),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("fits a visual without resetting its values and keeps fit mode through preview and expansion", async () => {
    render(
      <AppProvider>
        <NativeVisual {...props} />
      </AppProvider>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Seats" }), { target: { value: "30" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Seats" }));
    await waitFor(() => expect(screen.getByText("$300.00")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Fit to width" }));
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("Fit");
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("button", { name: "Fit to width" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand visual" }));
    const dialog = await screen.findByRole("dialog", { name: props.title });
    expect(within(dialog).getByRole("textbox", { name: "Seats" })).toHaveValue("30");
    expect(within(dialog).getByRole("button", { name: "Fit to width" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("125%");
    expect(screen.getByRole("textbox", { name: "Seats" })).toHaveValue("30");
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(screen.getByRole("button", { name: "Fit to width" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it.each([
    { available: 100, fitted: 40, next: 75, canReduce: false },
    { available: 240, fitted: 96, next: 100, canReduce: true },
    { available: 400, fitted: 100, next: 125, canReduce: true },
  ])(
    "keeps zoom arrows directional from fit at $fitted percent",
    async ({ available, fitted, next, canReduce }) => {
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(available);
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.classList.contains("number-field") ? 250 : 0;
      });
      const { container } = render(
        <AppProvider>
          <NativeVisual {...props} />
        </AppProvider>,
      );
      const content = () => container.querySelector<HTMLElement>("[data-native-visual-zoom]")!;
      await waitFor(() => expect(Number(content().dataset.nativeVisualZoom)).toBe(fitted));
      expect(screen.getByRole("button", { name: "Zoom out" }).hasAttribute("disabled")).toBe(
        !canReduce,
      );
      fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
      expect(Number(content().dataset.nativeVisualZoom)).toBe(canReduce ? 75 : fitted);
      fireEvent.click(screen.getByRole("button", { name: "Fit to width" }));
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      expect(Number(content().dataset.nativeVisualZoom)).toBe(next);
      expect(screen.getByRole("textbox", { name: "Seats" })).toHaveValue("25");
    },
  );

  it("uses the active expanded view's fitted size and restores the inline zoom controls", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.closest('[role="dialog"]') ? 400 : 100;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(250);
    const { container } = render(
      <AppProvider>
        <NativeVisual {...props} />
      </AppProvider>,
    );
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Expand visual" }));
    const dialog = await screen.findByRole("dialog", { name: props.title });
    expect(within(dialog).getByRole("button", { name: "Zoom out" })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Zoom out" }));
    expect(dialog.querySelector("[data-native-visual-zoom]")).toHaveAttribute(
      "data-native-visual-zoom",
      "75",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Fit to width" }));
    expect(dialog.querySelector("[data-native-visual-zoom]")).toHaveAttribute(
      "data-native-visual-zoom",
      "100",
    );
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(container.querySelector("[data-native-visual-zoom]")).toHaveAttribute(
      "data-native-visual-zoom",
      "40",
    );
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Seats" })).toHaveValue("25");
  });

  it("omits a redundant sole block heading but preserves distinct and nested headings", () => {
    const diagram = {
      type: "diagram",
      title: "Deployment dependencies",
      nodes: [{ id: "build", label: "Build" }],
      edges: [],
    };
    const first = render(
      <AppProvider>
        <NativeVisual
          {...props}
          version={2}
          title={diagram.title}
          source={JSON.stringify({ blocks: [diagram] })}
        />
      </AppProvider>,
    );
    expect(screen.queryByRole("heading", { name: diagram.title })).toBeNull();
    expect(screen.getByRole("img", { name: diagram.title })).toBeTruthy();
    expect(screen.getByRole("region", { name: diagram.title })).not.toHaveAttribute("tabindex");
    first.unmount();
    render(
      <AppProvider>
        <NativeVisual
          {...props}
          version={2}
          title={diagram.title}
          source={JSON.stringify({
            blocks: [
              {
                type: "tabs",
                title: "Stages",
                tabs: [{ id: "build", label: "Build", blocks: [diagram] }],
              },
            ],
          })}
        />
      </AppProvider>,
    );
    expect(screen.getByRole("heading", { name: "Stages" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: diagram.title })).toBeTruthy();
  });

  it("sorts evaluated table numbers numerically, with unavailable values last in both directions", () => {
    const tableSource = JSON.stringify({
      blocks: [
        {
          type: "table",
          title: "Numeric comparison",
          columns: [{ label: "Plan" }, { label: "Amount" }],
          rows: [
            ["Twenty", { op: "multiply", args: [4, 5] }],
            ["Three", 3],
            ["Hundred", 100],
            ["Missing", { op: "divide", args: [1, 0] }],
          ],
        },
      ],
    });
    render(
      <AppProvider>
        <NativeVisual {...props} source={tableSource} />
      </AppProvider>,
    );
    const grid = screen.getByRole("grid", { name: "Numeric comparison" });
    const names = () =>
      within(grid)
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getByRole("rowheader").textContent);
    const amount = within(grid).getByRole("columnheader", { name: "Amount" });
    fireEvent.click(amount);
    expect(amount).toHaveAttribute("aria-sort", "ascending");
    expect(names()).toEqual(["Three", "Twenty", "Hundred", "Missing"]);
    fireEvent.click(amount);
    expect(amount).toHaveAttribute("aria-sort", "descending");
    expect(names()).toEqual(["Hundred", "Twenty", "Three", "Missing"]);
  });

  it.each([false, true])(
    "keeps numeric and literal-text sort groups consistent (reversed input=%s)",
    (reversed) => {
      const rows = [
        ["Negative three", { op: "subtract", args: [0, 3] }],
        ["Negative two", -2],
        ["Literal negative", "-2.5"],
        ["Literal zero", "0"],
        ["Currency text", "$1.00"],
        ["Missing", { op: "divide", args: [1, 0] }],
      ];
      const tableSource = JSON.stringify({
        blocks: [
          {
            type: "table",
            title: "Mixed values",
            columns: [{ label: "Kind" }, { label: "Value" }],
            rows: reversed ? [...rows].reverse() : rows,
          },
        ],
      });
      render(
        <AppProvider>
          <NativeVisual {...props} source={tableSource} />
        </AppProvider>,
      );
      const grid = screen.getByRole("grid", { name: "Mixed values" });
      const names = () =>
        within(grid)
          .getAllByRole("row")
          .slice(1)
          .map((row) => within(row).getByRole("rowheader").textContent);
      const header = within(grid).getByRole("columnheader", { name: "Value" });
      for (const expected of [
        ["Negative three", "Negative two"],
        ["Negative two", "Negative three"],
      ]) {
        fireEvent.click(header);
        const sorted = names();
        expect(sorted.slice(0, 2)).toEqual(expected);
        expect(sorted.slice(2, -1).sort()).toEqual([
          "Currency text",
          "Literal negative",
          "Literal zero",
        ]);
        expect(sorted.at(-1)).toBe("Missing");
      }
    },
  );

  it("retains table filtering and sorting through source, theme and expanded view", async () => {
    const tableSource = JSON.stringify({
      blocks: [
        {
          type: "table",
          title: "Plans",
          columns: [{ label: "Plan" }, { label: "Amount" }],
          rows: [
            ["Scale", 20],
            ["Essential", 3],
            ["Scale mini", 4],
          ],
        },
      ],
    });
    render(
      <AppProvider>
        <NativeVisual {...props} source={tableSource} />
      </AppProvider>,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter table" }), {
      target: { value: "sCaLe" },
    });
    fireEvent.click(screen.getByRole("columnheader", { name: "Amount" }));
    expect(screen.getByRole("status")).toHaveTextContent("Rows: 2 / 3");
    expect(screen.queryByRole("rowheader", { name: "Essential" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    await act(async () => {
      useSharedSettings.getState().setThemeMode("light");
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("searchbox", { name: "Filter table" })).toHaveValue("sCaLe");
    fireEvent.click(screen.getByRole("button", { name: "Expand visual" }));
    const dialog = await screen.findByRole("dialog", { name: props.title });
    expect(within(dialog).getByRole("searchbox", { name: "Filter table" })).toHaveValue("sCaLe");
    expect(within(dialog).getByRole("columnheader", { name: "Amount" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(
      within(dialog)
        .getAllByRole("rowheader")
        .map((row) => row.textContent),
    ).toEqual(["Scale mini", "Scale"]);
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter table" }), {
      target: { value: "absent" },
    });
    expect(screen.getByText("No matching rows")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy table" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(screen.getAllByRole("rowheader")).toHaveLength(3);
  });

  it("copies visible table rows in view order with exact numeric values and inert spreadsheet text", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const tableSource = JSON.stringify({
      blocks: [
        {
          type: "table",
          title: "Copied values",
          columns: [{ label: "=Label" }, { label: "Amount" }],
          rows: [
            [" =1+1", 0.0001],
            ['Text\twith"quotes', -3],
            ["Hidden", 9],
          ],
        },
      ],
    });
    const { container } = render(
      <AppProvider>
        <NativeVisual {...props} source={tableSource} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("columnheader", { name: "Amount" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy table" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        '\'=Label\tAmount\n"Text\twith""quotes"\t-3\n\' =1+1\t0.0001\nHidden\t9',
      ),
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter table" }), {
      target: { value: "Hidden" },
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Rows: 1 / 3"));
    // The shared copy control has its own success label until its existing timer settles.
    const copy = container.querySelector<HTMLButtonElement>(
      '[data-poracode-native-visual] button[aria-label="Copied"]',
    );
    expect(copy).not.toBeNull();
    fireEvent.click(copy!);
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("'=Label\tAmount\nHidden\t9"));
  });

  it("retains native v2 checklist, tab, chart and table interactions above preview mounts", async () => {
    const v2Source = JSON.stringify({
      layout: "dashboard",
      accent: "success",
      inputs: [{ id: "seats", label: "Seats", min: 1, max: 100, step: 1, value: 25 }],
      blocks: [
        { type: "text", title: "Decision", text: "Compare the options before shipping." },
        {
          type: "checklist",
          title: "Launch checklist",
          items: [
            { id: "review", label: "Review complete", checked: true },
            { id: "ship", label: "Ship safely" },
          ],
        },
        {
          type: "tabs",
          title: "Analysis",
          tabs: [
            {
              id: "chart",
              label: "Chart",
              blocks: [
                {
                  type: "chart",
                  kind: "line",
                  title: "Plan costs",
                  labels: ["Essential", "Scale", "Pro"],
                  series: [
                    { label: "Monthly total", values: [{ input: "seats" }, 40, 60] },
                    { label: "Baseline", values: [20, 30, 50] },
                  ],
                },
              ],
            },
            {
              id: "comparison",
              label: "Comparison",
              blocks: [
                {
                  type: "table",
                  title: "Plan comparison",
                  columns: [{ label: "Plan" }, { label: "Cost" }],
                  rows: [
                    ["Scale", 40],
                    ["Essential", 25],
                    ["Scale plus", 60],
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const key = nativeVisualUiKey("visual-host", props.threadId, props.itemId, 0, v2Source);
    const mount = () =>
      render(
        <AppProvider>
          <NativeVisual {...props} source={v2Source} version={2} />
        </AppProvider>,
      );
    const first = mount();
    fireEvent.click(screen.getByRole("checkbox", { name: "Ship safely" }));
    expect(screen.getByRole("status")).toHaveTextContent("Completed: 2 / 2");
    fireEvent.click(screen.getByRole("button", { name: "Reset checklist" }));
    expect(screen.getByRole("checkbox", { name: "Review complete" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ship safely" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Ship safely" }));
    fireEvent.click(screen.getByRole("button", { name: "Baseline" }));
    expect(screen.getByRole("button", { name: "Baseline" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Next category" }));
    expect(
      within(screen.getByRole("group", { name: "Chart inspection" })).getByText("Scale"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show data table" }));
    expect(
      within(screen.getByRole("grid", { name: "Plan costs" })).getByRole("columnheader", {
        name: "Baseline",
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Comparison" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter table" }), {
      target: { value: "Scale" },
    });
    fireEvent.click(screen.getByRole("columnheader", { name: "Cost" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Seats" }), { target: { value: "30" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Seats" }));
    await waitFor(() =>
      expect(useNativeVisualUiStore.getState().entries.get(key)?.inputs).toEqual([["seats", 30]]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(first.container.querySelector("pre")?.textContent).toBe(v2Source);
    await act(async () => {
      useSharedSettings.getState().setThemeMode("light");
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("tab", { name: "Comparison" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand visual" }));
    const dialog = await screen.findByRole("dialog", { name: props.title });
    expect(within(dialog).getByRole("searchbox", { name: "Filter table" })).toHaveValue("Scale");
    expect(within(dialog).getByRole("columnheader", { name: "Cost" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(within(dialog).getByRole("checkbox", { name: "Ship safely" })).toBeChecked();
    expect(within(dialog).getByRole("textbox", { name: "Seats" })).toHaveValue("30");
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    first.unmount();
    mount();
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("125%");
    expect(screen.getByRole("textbox", { name: "Seats" })).toHaveValue("30");
    expect(screen.getByRole("checkbox", { name: "Ship safely" })).toBeChecked();
    expect(screen.getByRole("searchbox", { name: "Filter table" })).toHaveValue("Scale");
    fireEvent.click(screen.getByRole("tab", { name: "Chart" }));
    expect(screen.getByRole("button", { name: "Show chart" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show chart" }));
    expect(screen.getByRole("button", { name: "Baseline" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      within(screen.getByRole("group", { name: "Chart inspection" })).getByText("Scale"),
    ).toBeTruthy();
    expect(useNativeVisualUiStore.getState().entries.get(key)).toMatchObject({
      inputs: [["seats", 30]],
      zoom: 125,
      checked: [["1/ship", true]],
      tabs: [["2", "chart"]],
      charts: [["2/chart/0", { hiddenSeries: [1], point: 1, showTable: false }]],
      tables: [["2/comparison/0", { query: "Scale", sort: { column: 1, direction: "ascending" } }]],
    });
  });

  it("lets keyboard inspection supersede hover and keeps unavailable points honest", () => {
    const chartSource = JSON.stringify({
      blocks: [
        {
          type: "chart",
          kind: "line",
          title: "Measured values",
          labels: ["First", "Second", "Third"],
          series: [{ label: "Results", values: [2, { op: "divide", args: [1, 0] }, -5] }],
        },
      ],
    });
    const { container } = render(
      <AppProvider>
        <NativeVisual {...props} source={chartSource} />
      </AppProvider>,
    );
    const inspection = within(screen.getByRole("group", { name: "Chart inspection" }));
    expect(screen.getByRole("button", { name: "Previous category" })).toBeDisabled();
    fireEvent.pointerEnter(container.querySelectorAll('svg[role="img"] circle[cx]')[1]!);
    expect(inspection.getByText("Third")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next category" }));
    expect(inspection.getByText("Second")).toBeTruthy();
    expect(inspection.getByText("Unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next category" }));
    expect(screen.getByRole("button", { name: "Next category" })).toBeDisabled();
    expect(inspection.getByText("-5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Results" }));
    expect(screen.getByText("No series selected. Choose a series above.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Chart inspection" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show data table" }));
    expect(screen.getAllByRole("rowheader").map((row) => row.textContent)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(screen.getByRole("gridcell", { name: "Unavailable" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Results" })).toBeDisabled();
  });

  it.each(["vertical", "horizontal"])(
    "renders a %s app-owned diagram with literal text and complete accessible relationships",
    (direction) => {
      const author = '<img src="/owned-probe" onerror="new RTCPeerConnection()">';
      const diagramSource = JSON.stringify({
        accent: "warning",
        blocks: [
          {
            type: "tabs",
            tabs: [
              { id: "plain", label: "Summary", blocks: [{ type: "text", text: "Plain data" }] },
              {
                id: "diagram",
                label: "Diagram",
                blocks: [
                  {
                    type: "diagram",
                    title: "Delivery",
                    direction,
                    nodes: [
                      { id: "input", label: "Input", detail: author, tone: "accent" },
                      { id: "review", label: "Review", tone: "success" },
                      { id: "ship", label: "Ship" },
                    ],
                    edges: [
                      { from: "input", to: "review", label: "Validate" },
                      { from: "review", to: "ship" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
      const post = vi.spyOn(window, "postMessage");
      const { container } = render(
        <AppProvider>
          <NativeVisual {...props} source={diagramSource} version={2} />
        </AppProvider>,
      );
      expect(screen.queryByRole("img", { name: "Delivery" })).toBeNull();
      fireEvent.click(screen.getByRole("tab", { name: "Diagram" }));
      const diagram = screen.getByRole("img", { name: "Delivery" });
      expect(screen.queryByRole("region", { name: "Delivery" })).toBeNull();
      expect(diagram).toHaveAccessibleDescription(/Input: <img src="\/owned-probe"/);
      expect(diagram).toHaveAccessibleDescription(/From Input to Review: Validate/);
      expect(diagram).toHaveAccessibleDescription(/From Review to Ship/);
      expect(diagram.querySelectorAll("[data-native-node]")).toHaveLength(3);
      expect(diagram.querySelectorAll("[data-native-edge]")).toHaveLength(2);
      expect(diagram.outerHTML).not.toMatch(/NaN|Infinity/);
      expect(
        container.querySelector("iframe, script, img, base, object, embed, foreignObject, a"),
      ).toBeNull();
      expect(parse).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
    },
  );

  it.each([{ isStreaming: true }, { complete: false }, { limited: true }])(
    "does not admit native v2 before a complete bounded document: %j",
    (override) => {
      const v2Source = JSON.stringify({
        blocks: [{ type: "checklist", items: [{ id: "first", label: "First" }] }],
      });
      const { container } = render(
        <AppProvider>
          <NativeVisual {...props} source={v2Source} version={2} {...override} />
        </AppProvider>,
      );
      expect(container.querySelector("[data-poracode-native-visual]")).toBeNull();
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(container.querySelector("pre")?.textContent).toBe(v2Source);
    },
  );

  it.each([
    [{ isStreaming: true }, "Receiving visual source…"],
    [{ complete: false }, "Incomplete visual block. Showing source only."],
    [{ version: 3 }, "Unsupported visual format. Showing source only."],
    [{ limited: true }, "Too many visuals in this message. Showing source only."],
    [{ source: "{bad JSON" }, "Invalid visual specification. Showing source only."],
  ])("keeps unavailable documents source-only: %j", (override, message) => {
    const value = { ...props, ...override };
    const { container } = render(
      <AppProvider>
        <NativeVisual {...value} />
      </AppProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(container.querySelector("pre")?.textContent).toBe(value.source);
    expect(container.querySelector("[data-poracode-native-visual]")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not display zero for invalid arithmetic", () => {
    const value = JSON.stringify({
      blocks: [
        {
          type: "outputs",
          items: [{ label: "Invalid result", value: { op: "divide", args: [1, 0] } }],
        },
      ],
    });
    render(
      <AppProvider>
        <NativeVisual {...props} source={value} />
      </AppProvider>,
    );
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("does not advertise content zoom when the browser cannot apply it", () => {
    vi.spyOn(CSS, "supports").mockReturnValue(false);
    render(
      <AppProvider>
        <NativeVisual {...props} />
      </AppProvider>,
    );
    expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset zoom" })).toBeNull();
    expect(screen.getByRole("button", { name: "Expand visual" })).toBeTruthy();
  });

  it("pages oversized rejected source instead of creating an unbounded highlighted document", () => {
    const large = "private source ".repeat(20000);
    const { container } = render(
      <AppProvider>
        <NativeVisual {...props} source={large} />
      </AppProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "This visual is too large. Showing source only.",
    );
    expect(screen.getByRole("button", { name: "Earlier text" })).toBeTruthy();
    expect(container.textContent!.length).toBeLessThan(large.length);
    expect(container.querySelector("[data-poracode-native-visual], iframe")).toBeNull();
  });

  it.each([
    ["bar", 18],
    ["line", 12],
  ] as const)("keeps complete graphemes in %s chart labels", (kind, limit) => {
    const prefix = "A".repeat(limit - 2);
    const labels = [`${prefix}👩🏽‍💻Z`, `${prefix}👩🏽‍💻YZ`];
    const { container } = render(
      <AppProvider>
        <NativeVisual
          {...props}
          source={JSON.stringify({
            blocks: [
              { type: "chart", kind, labels, series: [{ label: "Values", values: [1, 2] }] },
            ],
          })}
        />
      </AppProvider>,
    );
    const titles = [...container.querySelectorAll('svg[role="img"] text > title')];
    expect(titles.map((title) => title.textContent)).toEqual(labels);
    const shown = titles.map((title) =>
      [...title.parentNode!.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(""),
    );
    expect(shown).toEqual([labels[0], `${prefix}👩🏽‍💻…`]);
  });

  it("keeps gaps in a line chart and never emits invalid SVG coordinates", () => {
    const value = JSON.stringify({
      blocks: [
        {
          type: "chart",
          kind: "line",
          labels: ["A", "B", "C"],
          series: [{ label: "Results", values: [0, { op: "divide", args: [1, 0] }, -5] }],
        },
      ],
    });
    const { container } = render(
      <AppProvider>
        <NativeVisual {...props} source={value} />
      </AppProvider>,
    );
    expect(container.querySelector("polyline")).toBeNull();
    const points = container.querySelectorAll('svg[role="img"] circle[cx]');
    expect(points).toHaveLength(2);
    for (const point of points) {
      expect(Number.isFinite(Number(point.getAttribute("cx")))).toBe(true);
      expect(Number.isFinite(Number(point.getAttribute("cy")))).toBe(true);
    }
    expect(screen.getByRole("status")).toHaveTextContent("Some values are unavailable.");
  });

  it("localizes native unavailable behavior and source controls", async () => {
    useSharedSettings.setState({ locale: "de" });
    await dynamicActivate("de");
    render(
      <AppProvider>
        <NativeVisual {...props} version={3} />
      </AppProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Nicht unterstütztes Visualisierungsformat.",
    );
    expect(screen.queryByText("Unsupported visual format. Showing source only.")).toBeNull();
  });
});

const fraction = { id: "amount", label: "Amount", min: 0, max: 0.001, step: 0.0001, value: 0.0001 };

async function mountAmount(input: NativeVisualInput, locale: "en" | "de", multiplier = 1) {
  useSharedSettings.setState({ locale });
  await dynamicActivate(locale);
  const valueSource = JSON.stringify({
    inputs: [input],
    blocks: [
      {
        type: "outputs",
        items: [
          {
            label: "Scaled amount",
            value: { op: "multiply", args: [{ input: input.id }, multiplier] },
            format: { style: "decimal" },
          },
        ],
      },
    ],
  });
  const key = nativeVisualUiKey("visual-host", props.threadId, props.itemId, 0, valueSource);
  const rendered = render(
    <AppProvider>
      <NativeVisual
        source={valueSource}
        title="Legal numeric inputs"
        version={1}
        complete
        isStreaming={false}
        threadId={props.threadId}
        itemId={props.itemId}
        ordinal={0}
        limited={false}
      />
    </AppProvider>,
  );
  const textbox = screen.getByRole("textbox", { name: input.label }) as HTMLInputElement;
  const observe = () => ({
    text: textbox.value,
    model:
      useNativeVisualUiStore
        .getState()
        .entries.get(key)
        ?.inputs.find(([id]) => id === input.id)?.[1] ?? input.value,
    scaled: rendered.container.querySelector("dd")?.textContent,
  });
  return { ...rendered, textbox, observe };
}

describe("legal numbers: untouched fractional value", () => {
  it.each(["en", "de"] as const)("focus and blur retains0.0001/scaled1 in %s", async (locale) => {
    const fixture = await mountAmount(fraction, locale, 10000);
    const before = fixture.observe();
    expect(before.model).toBe(0.0001);
    expect(before.scaled).toBe("1");
    await act(async () => {
      fixture.textbox.focus();
      fixture.textbox.blur();
    });
    const after = fixture.observe();
    const expected = { text: locale === "en" ? "0.0001" : "0,0001", model: 0.0001, scaled: "1" };
    expect({ before, after }).toEqual({ before: expected, after: expected });
    expect(screen.getByRole("slider", { name: fraction.label })).toHaveAttribute(
      "aria-valuetext",
      expected.text,
    );
  });

  it.each(["en", "de"] as const)(
    "real step controls preserve fractional model in %s",
    async (locale) => {
      const fixture = await mountAmount(fraction, locale, 10000);
      expect(fixture.observe().scaled).toBe("1");
      const increment = fixture.container.querySelector<HTMLButtonElement>(
        'button[slot="increment"]',
      );
      const decrement = fixture.container.querySelector<HTMLButtonElement>(
        'button[slot="decrement"]',
      );
      expect(increment).not.toBeNull();
      expect(decrement).not.toBeNull();
      fireEvent.click(increment!);
      await waitFor(() =>
        expect(fixture.observe()).toEqual({
          text: locale === "en" ? "0.0002" : "0,0002",
          model: 0.0002,
          scaled: "2",
        }),
      );
      const slider = screen.getByRole("slider", { name: fraction.label });
      expect(slider).toHaveAttribute("aria-valuetext", locale === "en" ? "0.0002" : "0,0002");
      fireEvent.click(decrement!);
      await waitFor(() =>
        expect(fixture.observe()).toEqual({
          text: locale === "en" ? "0.0001" : "0,0001",
          model: 0.0001,
          scaled: "1",
        }),
      );
      await act(async () => {
        fixture.textbox.focus();
        fixture.textbox.blur();
      });
      expect(fixture.observe().model).toBe(0.0001);
      expect(fixture.observe().scaled).toBe("1");
      expect(slider).toHaveAttribute("aria-valuetext", locale === "en" ? "0.0001" : "0,0001");
      fireEvent.click(increment!);
      await waitFor(() => expect(fixture.observe().model).toBe(0.0002));
      fireEvent.click(
        screen.getByRole("button", {
          name: locale === "en" ? "Reset inputs" : "Eingaben zurücksetzen",
        }),
      );
      await waitFor(() => expect(fixture.observe().model).toBe(0.0001));
      expect(slider).toHaveAttribute("aria-valuetext", locale === "en" ? "0.0001" : "0,0001");
    },
  );
});

const largeCases = [
  {
    name: "positive integer",
    min: 999999999990,
    max: 1000000000000,
    step: 1,
    value: 1000000000000,
    en: "1,000,000,000,000",
    de: "1.000.000.000.000",
  },
  {
    name: "negative integer",
    min: -1000000000000,
    max: -999999999990,
    step: 1,
    value: -1000000000000,
    en: "-1,000,000,000,000",
    de: "-1.000.000.000.000",
  },
  {
    name: "positive large fraction",
    min: 999999999990,
    max: 1000000000000,
    step: 0.125,
    value: 999999999999.875,
    en: "999,999,999,999.875",
    de: "999.999.999.999,875",
  },
  {
    name: "negative large fraction",
    min: -1000000000000,
    max: -999999999990,
    step: 0.125,
    value: -999999999999.875,
    en: "-999,999,999,999.875",
    de: "-999.999.999.999,875",
  },
] as const;

describe("legal numbers: localized large and fractional field text", () => {
  for (const locale of ["en", "de"] as const) {
    it.each(largeCases)(`preserves $name in ${locale}`, async ({ name, en, de, ...input }) => {
      const fixture = await mountAmount(
        { id: "amount", label: `Amount (${name})`, ...input },
        locale,
      );
      const expected = locale === "en" ? en : de;
      expect(fixture.textbox).toHaveValue(expected);
      await act(async () => {
        fixture.textbox.focus();
        fixture.textbox.blur();
      });
      expect(fixture.textbox).toHaveValue(expected);
      expect(fixture.observe().model).toBe(input.value);
      expect(fixture.container.querySelector("[data-poracode-native-visual]")).not.toBeNull();
    });
  }
});
