import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { setRemoteLocalImageResolver } from "@/shared/localImageDisplay";
import { toLocalFileUrl } from "@/shared/promptContent";
import { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteEnvironmentImageBytes } from "@/shared/remote/clientEnvironmentImages";
import {
  directImageSessionFor,
  __resetDirectImageSessionsForTest,
} from "@/renderer/state/remoteServers/directImages";
import { ChatPaneActionsContext, type ChatPaneActions } from "../../chatPaneActionsContext";
import { createMarkdownLocalImageAuthority } from "../../markdownLocalImageAuthority";
import ItemMarkdownInner from "./ItemMarkdownInner";
import { MarkdownImage } from "./MarkdownImage";

const observation = vi.hoisted(() => ({ transforms: vi.fn<() => void>() }));

vi.mock("./remarkAutolinkProjectPaths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./remarkAutolinkProjectPaths")>();
  return {
    ...actual,
    remarkAutolinkProjectPaths(options: Parameters<typeof actual.remarkAutolinkProjectPaths>[0]) {
      const transform = actual.remarkAutolinkProjectPaths(options);
      return (tree: Parameters<typeof transform>[0]) => {
        observation.transforms();
        transform(tree);
      };
    },
  };
});

const bytes: RemoteEnvironmentImageBytes = {
  bytes: new Uint8Array([137, 80, 78, 71]),
  contentType: "image/png",
};
const revoke = vi.fn<(url: string) => void>();
const createUrl = vi.fn<(blob: Blob) => string>();
const root = { kind: "posix", path: "/live-markdown-consumer" } as const;

function Pane({ text, actions }: { text: string; actions: ChatPaneActions | null }) {
  return (
    <ChatPaneActionsContext.Provider value={actions}>
      <ItemMarkdownInner text={text} />
    </ChatPaneActionsContext.Provider>
  );
}

function fixture(text: string, actions: ChatPaneActions | null) {
  return (
    <AppProvider syncWindowChrome={false}>
      <Pane text={text} actions={actions} />
    </AppProvider>
  );
}

function owner(
  connectionKey: string,
  identity: string,
  fetchBytes: RemoteDesktopClient["fetchTicketedImageBytes"],
) {
  const client = new RemoteDesktopClient("https://owner.test/", identity);
  const fetch = vi.spyOn(client, "fetchTicketedImageBytes").mockImplementation(fetchBytes);
  // Actual session replacement owns abort/revoke/generation fencing and the
  // actual bounded cache. Only byte transport and object URL creation are held.
  const session = directImageSessionFor(connectionKey, identity, () => client);
  const fallback = vi.fn<(path: string) => string>(() => "https://wrong-fallback.test/image.png");
  const actions: ChatPaneActions = {
    projectLocation: root,
    ...createMarkdownLocalImageAuthority({
      projectLocation: root,
      isManagedThread: false,
      remote: { available: true, readiness: session.readiness, resolvePath: fallback },
    }),
  };
  return { actions, session, fetch, fallback };
}

beforeEach(() => {
  Reflect.deleteProperty(window, "poracode");
  setRemoteLocalImageResolver(null);
  let sequence = 0;
  createUrl.mockReset().mockImplementation(() => `blob:markdown-${++sequence}`);
  revoke.mockReset();
  class ImageUrl extends URL {
    static override createObjectURL = createUrl;
    static override revokeObjectURL = revoke;
  }
  vi.stubGlobal("URL", ImageUrl);
});

afterEach(() => {
  cleanup();
  __resetDirectImageSessionsForTest();
  setRemoteLocalImageResolver(null);
  window.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("live Markdown image consumer", () => {
  it("keeps two owners isolated through shared processors, replacement and a streaming append", () => {
    const text = "**Stable** block.\n\n![Shot](/shared-image.png)\n\nTail **one**.";
    const first: ChatPaneActions = {
      projectLocation: root,
      remoteLocalImageUrl: () => "https://one.test/image.png",
    };
    const second: ChatPaneActions = {
      projectLocation: root,
      remoteLocalImageUrl: () => "https://two.test/image.png",
    };
    const third: ChatPaneActions = {
      projectLocation: root,
      remoteLocalImageUrl: () => "https://three.test/image.png",
    };
    const pair = (firstText: string, firstActions: ChatPaneActions) => (
      <AppProvider syncWindowChrome={false}>
        <section data-testid="one">
          <Pane text={firstText} actions={firstActions} />
        </section>
        <section data-testid="two">
          <Pane text={text} actions={second} />
        </section>
      </AppProvider>
    );
    const view = render(pair(text, first));
    const one = within(view.getByTestId("one"));
    const two = within(view.getByTestId("two"));
    const firstImage = one.getByAltText("Shot");
    const secondImage = two.getByAltText("Shot");
    const stable = one.getByText("Stable");
    const transformCount = observation.transforms.mock.calls.length;
    expect(firstImage).toHaveAttribute("src", "https://one.test/image.png");
    expect(secondImage).toHaveAttribute("src", "https://two.test/image.png");
    view.rerender(pair(text, third));
    expect(one.getByAltText("Shot")).toBe(firstImage);
    expect(firstImage).toHaveAttribute("src", "https://three.test/image.png");
    expect(two.getByAltText("Shot")).toBe(secondImage);
    expect(secondImage).toHaveAttribute("src", "https://two.test/image.png");
    expect(one.getByText("Stable")).toBe(stable);
    expect(observation.transforms.mock.calls.length).toBe(transformCount);
    view.rerender(pair(`${text} More _streamed_ words.`, third));
    expect(firstImage).toHaveAttribute("src", "https://three.test/image.png");
    expect(secondImage).toHaveAttribute("src", "https://two.test/image.png");
    expect(one.getByText("Stable")).toBe(stable);
    expect(one.getByAltText("Shot")).toBe(firstImage);
    expect(observation.transforms.mock.calls.length).toBeGreaterThan(transformCount);
  });

  it.each(["ready", "pending"] as const)(
    "replaces a %s owner using the real cache lifecycle without changing Markdown",
    async (state) => {
      const held = Promise.withResolvers<RemoteEnvironmentImageBytes>();
      const first = owner("replace", "first", () => held.promise);
      const text = '**Stable** <img src="/held-image.png" alt="Shot" width="800" height="600">.';
      const view = render(fixture(text, first.actions));
      await waitFor(() => expect(first.fetch).toHaveBeenCalledOnce());
      const signal = first.fetch.mock.calls[0]![1];
      const card = view.container.querySelector('[data-poracode-image-card="true"]');
      const stable = view.getByText("Stable");
      const transforms = observation.transforms.mock.calls.length;
      const pendingSlot = view.container.querySelector<HTMLElement>(
        "button > span[aria-hidden='true']",
      )!;
      expect(pendingSlot.style.aspectRatio).toBe("800 / 600");
      expect(view.queryByRole("img")).toBeNull();
      if (state === "ready") {
        await act(async () => held.resolve(bytes));
        fireEvent.load(await view.findByRole("img"));
      }
      expect(view.queryByRole("img")?.getAttribute("src") ?? "").toBe(
        state === "ready" ? "blob:markdown-1" : "",
      );
      const nextBytes = Promise.withResolvers<RemoteEnvironmentImageBytes>();
      let next!: ReturnType<typeof owner>;
      act(() => {
        next = owner("replace", "second", () => nextBytes.promise);
        view.rerender(fixture(text, next.actions));
      });
      await waitFor(() => expect(next.fetch).toHaveBeenCalledOnce());
      expect(signal.aborted).toBe(state === "pending");
      expect(view.queryByRole("img")).toBeNull();
      expect(view.container.querySelector('[data-poracode-image-card="true"]')).toBe(card);
      expect(view.getByText("Stable")).toBe(stable);
      expect(observation.transforms.mock.calls.length).toBe(transforms);
      if (state === "pending") {
        await act(async () => held.resolve(bytes));
      }
      expect(createUrl).toHaveBeenCalledTimes(state === "ready" ? 1 : 0);
      expect(view.queryByRole("img")).toBeNull();
      expect(revoke.mock.calls).toEqual(state === "ready" ? [["blob:markdown-1"]] : []);
      await act(async () => nextBytes.resolve(bytes));
      const img = await view.findByRole("img");
      expect(img).toHaveAttribute("src", state === "ready" ? "blob:markdown-2" : "blob:markdown-1");
      expect((img as HTMLImageElement).style.aspectRatio).toBe(pendingSlot.style.aspectRatio);
      expect(img).toHaveClass("opacity-0");
      expect(next.fallback).not.toHaveBeenCalled();
      expect(first.fallback).not.toHaveBeenCalled();
      expect(next.fetch).toHaveBeenCalledTimes(1);
      expect(observation.transforms.mock.calls.length).toBe(transforms);
    },
  );

  it("keeps explicit empty ownership and invalid readiness paths out of global/native fallback", () => {
    const global = vi.fn<(url: string) => string>(() => "https://wrong-global.test/image.png");
    setRemoteLocalImageResolver(global);
    const local = toLocalFileUrl("/image.png");
    const unavailable: ChatPaneActions = { remoteLocalImageUrl: () => "" };
    const view = render(fixture("![Shot](/image.png)", unavailable));
    const card = view.container.querySelector('[data-poracode-image-card="true"]');
    expect(view.queryByRole("img")).toBeNull();
    const active = owner("invalid", "first", () => Promise.resolve(bytes));
    const invalid = {
      ...active.actions,
      markdownLocalImageReadiness: {
        readiness: active.session.readiness,
        pathForUrl: () => undefined,
      },
    };
    view.rerender(fixture("![Shot](/image.png)", invalid));
    expect(view.queryByRole("img")).toBeNull();
    expect(view.container.querySelector('[data-poracode-image-card="true"]')).toBe(card);
    expect(active.fetch).not.toHaveBeenCalled();
    expect(global).not.toHaveBeenCalled();
    view.rerender(fixture("![Shot](/image.png)", null));
    expect(view.getByRole("img")).toHaveAttribute("src", "https://wrong-global.test/image.png");
    expect(global).toHaveBeenCalledWith(local);
  });

  it.each([
    "https://example.test/image.png",
    "data:image/png;base64,QQ==",
    "poracode-local://local/image.png",
  ])("preserves unbound external/data/native sources: %s", (src) => {
    const view = render(
      <AppProvider syncWindowChrome={false}>
        <MarkdownImage src={src} alt="Shot" />
      </AppProvider>,
    );
    expect(view.getByRole("img")).toHaveAttribute("src", src);
  });

  it("leaves external and data images outside a local owner's readiness and resolver", () => {
    const active = owner("external", "first", () => Promise.resolve(bytes));
    const view = render(
      <AppProvider syncWindowChrome={false}>
        <ChatPaneActionsContext.Provider value={active.actions}>
          <MarkdownImage src="https://outside.test/image.png" alt="External" />
          <MarkdownImage src="data:image/png;base64,QQ==" alt="Inline" />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );
    expect(view.getByAltText("External")).toHaveAttribute("src", "https://outside.test/image.png");
    expect(view.getByAltText("Inline")).toHaveAttribute("src", "data:image/png;base64,QQ==");
    expect(active.fetch).not.toHaveBeenCalled();
    expect(active.fallback).not.toHaveBeenCalled();
    expect(view.getByAltText("Inline")).not.toHaveClass("opacity-0");
  });
});
