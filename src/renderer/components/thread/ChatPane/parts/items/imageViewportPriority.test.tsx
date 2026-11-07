import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { createCacheImageReadiness } from "@/renderer/state/cacheImageReadiness";
import { PaneVisibility } from "@/renderer/paneVisibility";
import { AttachmentBar } from "@/renderer/components/composer/AttachmentBar";
import { remoteImageRef } from "@/shared/remote";
import {
  RemoteEnvironmentImageCache,
  type RemoteEnvironmentImageBytes,
} from "@/shared/remote/clientEnvironmentImages";
import { toLocalFileUrl } from "@/shared/promptContent";
import { ChatPaneActionsContext } from "../../chatPaneActionsContext";
import { ImageView } from "./ImageView";
import { MarkdownImage } from "./MarkdownImage";

class ImageObserver {
  static instances: ImageObserver[] = [];
  readonly elements = new Set<Element>();
  readonly disconnect = vi.fn<() => void>(() => this.elements.clear());
  constructor(readonly callback: IntersectionObserverCallback) {
    ImageObserver.instances.push(this);
  }
  observe(element: Element) {
    this.elements.add(element);
  }
  unobserve(element: Element) {
    this.elements.delete(element);
  }
  visibility(...entries: [Element, boolean][]) {
    this.callback(
      entries.map(
        ([target, isIntersecting]) => ({ target, isIntersecting }) as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    );
  }
}

let cache: RemoteEnvironmentImageCache | undefined;
beforeEach(() => {
  ImageObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", ImageObserver);
});
afterEach(() => {
  cleanup();
  cache?.dispose();
  cache = undefined;
  vi.unstubAllGlobals();
});

it.each(
  (["reference", "path", "attachment"] as const).flatMap((kind) =>
    (["scroll", "hidden pane"] as const).map((mode) => ({ kind, mode })),
  ),
)("reloads an evicted $kind immediately after leaving a $mode", async ({ kind, mode }) => {
  const fetches: ReturnType<typeof Promise.withResolvers<RemoteEnvironmentImageBytes>>[] = [];
  let urls = 0;
  const imageCache = new RemoteEnvironmentImageCache({
    maxEntries: 1,
    maxConcurrentFetches: 1,
    fetchBytes: () => {
      const response = Promise.withResolvers<RemoteEnvironmentImageBytes>();
      fetches.push(response);
      return response.promise;
    },
    createObjectUrl: () => `blob:visible-${++urls}`,
    revokeObjectUrl: () => undefined,
  });
  cache = imageCache;
  const readiness = createCacheImageReadiness(imageCache);
  const eagerResolver = vi.fn<() => string>(() => "");
  const items: RuntimeChatItem[] = [0, 1].map((index) => ({
    id: `image-${index}`,
    type: "image_view",
    state: "completed",
    streams: {},
    payload: {
      name: "images",
      status: "success",
      args: {},
      images: [
        remoteImageRef({
          threadId: "retained-image-rows",
          itemId: `image-${index}`,
          path: ["images", 0],
          mime: "image/png",
          bytes: 4,
          width: 800,
          height: 600,
        }),
      ],
    },
  }));
  const fixture = (paneVisible: readonly boolean[]) => (
    <AppProvider syncWindowChrome={false}>
      <ChatPaneActionsContext.Provider
        value={{
          remoteImageRefUrl: eagerResolver,
          remoteImageReadiness: readiness,
          markdownLocalImageReadiness: {
            readiness,
            pathForUrl: (url) => new URL(url).pathname,
          },
        }}
      >
        {items.map((item, index) => (
          <PaneVisibility key={item.id} value={paneVisible[index]!}>
            {kind === "reference" ? (
              <ImageView item={item} />
            ) : kind === "path" ? (
              <MarkdownImage src={toLocalFileUrl(`/image-${index}.png`)} />
            ) : (
              <AttachmentBar
                attachments={[
                  { id: item.id, path: `/image-${index}.png`, name: item.id, isImage: true },
                ]}
                imagesAsPreview
                imageUrlForPath={eagerResolver}
                remoteImageReadiness={readiness}
              />
            )}
          </PaneVisibility>
        ))}
      </ChatPaneActionsContext.Provider>
    </AppProvider>
  );
  const view = render(fixture(mode === "hidden pane" ? [true, false] : [true, true]));
  const selector =
    kind === "attachment"
      ? "[data-poracode-attachment-image-preview]"
      : "[data-poracode-image-card]";
  const cards = [...view.container.querySelectorAll(selector)];
  const target = (card: Element) =>
    kind === "attachment" ? card.querySelector("img, [role=img]")! : card;
  expect(cards).toHaveLength(2);
  expect(ImageObserver.instances).toHaveLength(1);
  const observer = ImageObserver.instances[0]!;
  expect(observer.elements.size).toBe(2);
  expect(eagerResolver).not.toHaveBeenCalled();
  expect(fetches).toHaveLength(1);

  const complete = async (index: number) => {
    await act(async () => {
      fetches[index]!.resolve({ bytes: new Uint8Array([index]), contentType: "image/png" });
    });
  };
  act(() =>
    observer.visibility([target(cards[0]!), true], [target(cards[1]!), mode === "hidden pane"]),
  );
  const firstImage = kind === "attachment" ? cards[0]!.querySelector("img") : null;
  const sameNode = (card: Element) =>
    kind === "attachment" ? firstImage : card.querySelector("img");
  await complete(0);
  await waitFor(() => expect(cards[0]!.querySelector("img")?.src).toBe("blob:visible-1"));
  expect(cards[0]!.querySelector("img")).toBe(sameNode(cards[0]!));
  expect(kind === "attachment" ? observer.elements.has(firstImage!) : true).toBe(true);

  if (mode === "hidden pane") view.rerender(fixture([false, true]));
  else act(() => observer.visibility([target(cards[0]!), false], [target(cards[1]!), true]));
  await waitFor(() => expect(fetches).toHaveLength(2));
  await complete(1);
  await waitFor(() => expect(cards[1]!.querySelector("img")?.src).toBe("blob:visible-2"));
  expect(cards[0]!.querySelector("img")?.getAttribute("src") ?? "").toBe("");

  // No retry-clock advance: leaving the viewport released foreground demand,
  // so this background eviction must not impose the 15-second failure latch.
  if (mode === "hidden pane") view.rerender(fixture([true, false]));
  else act(() => observer.visibility([target(cards[1]!), false], [target(cards[0]!), true]));
  await waitFor(() => expect(fetches).toHaveLength(3));
  await complete(2);
  await waitFor(() => expect(cards[0]!.querySelector("img")?.src).toBe("blob:visible-3"));
  expect(cards[0]!.querySelector("img")).toBe(sameNode(cards[0]!));
  expect([...view.container.querySelectorAll(selector)]).toEqual(cards);
  view.unmount();
  expect(observer.elements.size).toBe(0);
  expect(observer.disconnect).toHaveBeenCalledOnce();
});

it("loads queued transcript images from the bottom row up", async () => {
  const fetches: { path: string; done: (bytes: RemoteEnvironmentImageBytes) => void }[] = [];
  const imageCache = new RemoteEnvironmentImageCache({
    maxConcurrentFetches: 1,
    fetchBytes: (path) =>
      new Promise((resolve) => {
        fetches.push({ path, done: resolve });
      }),
    createObjectUrl: () => "blob:row",
    revokeObjectUrl: () => undefined,
  });
  cache = imageCache;
  const readiness = createCacheImageReadiness(imageCache);
  const items: RuntimeChatItem[] = [0, 1, 2, 3].map((index) => ({
    id: `row-image-${index}`,
    type: "image_view",
    state: "completed",
    streams: {},
    payload: {
      name: "images",
      status: "success",
      args: {},
      images: [
        remoteImageRef({
          threadId: "ranked-rows",
          itemId: `row-image-${index}`,
          path: ["images", 0],
          mime: "image/png",
          bytes: 4,
          width: 800,
          height: 600,
        }),
      ],
    },
  }));
  const view = render(
    <AppProvider syncWindowChrome={false}>
      <ChatPaneActionsContext.Provider value={{ remoteImageReadiness: readiness }}>
        {items.map((item, index) => (
          <div key={item.id} data-chat-virtual-row="true" data-index={index}>
            <ImageView item={item} />
          </div>
        ))}
      </ChatPaneActionsContext.Provider>
    </AppProvider>,
  );
  const cards = [...view.container.querySelectorAll("[data-poracode-image-card]")];
  const show = (...rows: number[]) =>
    act(() =>
      ImageObserver.instances[0]!.visibility(
        ...rows.map((row): [Element, boolean] => [cards[row]!, true]),
      ),
    );
  // Like the transcript opening at its end: the bottom window shows first,
  // then rows above it, so the most recent demand is not the newest row.
  show(2, 3);
  show(0, 1);
  // The top row took the only free slot as it mounted; the rest queued.
  expect(fetches).toHaveLength(1);
  expect(fetches[0]!.path).toContain("row-image-0");
  for (const expected of ["row-image-3", "row-image-2", "row-image-1"]) {
    const index = fetches.length;
    await act(async () => {
      fetches[index - 1]!.done({ bytes: new Uint8Array([index]), contentType: "image/png" });
    });
    await waitFor(() => expect(fetches).toHaveLength(index + 1));
    expect(fetches[index]!.path).toContain(expected);
  }
});
