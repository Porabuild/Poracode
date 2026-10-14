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
  await complete(0);
  await waitFor(() => expect(cards[0]!.querySelector("img")?.src).toBe("blob:visible-1"));

  if (mode === "hidden pane") view.rerender(fixture([false, true]));
  else act(() => observer.visibility([target(cards[0]!), false], [target(cards[1]!), true]));
  await waitFor(() => expect(fetches).toHaveLength(2));
  await complete(1);
  await waitFor(() => expect(cards[1]!.querySelector("img")?.src).toBe("blob:visible-2"));
  expect(cards[0]!.querySelector("img")).toBeNull();

  // No retry-clock advance: leaving the viewport released foreground demand,
  // so this background eviction must not impose the 15-second failure latch.
  if (mode === "hidden pane") view.rerender(fixture([true, false]));
  else act(() => observer.visibility([target(cards[1]!), false], [target(cards[0]!), true]));
  await waitFor(() => expect(fetches).toHaveLength(3));
  await complete(2);
  await waitFor(() => expect(cards[0]!.querySelector("img")?.src).toBe("blob:visible-3"));
  expect([...view.container.querySelectorAll(selector)]).toEqual(cards);
  view.unmount();
  expect(observer.elements.size).toBe(0);
  expect(observer.disconnect).toHaveBeenCalledOnce();
});
