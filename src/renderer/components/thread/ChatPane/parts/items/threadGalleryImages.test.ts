import { describe, expect, it } from "vitest";
import {
  buildGalleryResolversFromState,
  collectThreadGalleryImages,
  extractMarkdownGalleryImages,
} from "./threadGalleryImages";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";

function userItem(id: string, blocks: unknown[]): RuntimeChatItem {
  return {
    id,
    type: "user_message",
    state: "completed",
    payload: { content: blocks },
    streams: {},
  };
}

function assistantItem(id: string, content: unknown[], text = ""): RuntimeChatItem {
  return {
    id,
    type: "assistant_message",
    state: "completed",
    payload: { content },
    streams: text ? { assistant_text: text } : {},
  };
}

function attachmentImage(path: string, name: string): unknown {
  return {
    kind: "image",
    source: "attachment",
    path,
    name,
    mimeType: "image/png",
    dataUrl: "",
  };
}

describe("threadGalleryImages", () => {
  it("collects user attachment images in order", () => {
    const items = [
      userItem("u1", [
        attachmentImage("/tmp/a.png", "a.png"),
        { kind: "file", source: "attachment", path: "/tmp/b.jpg", name: "b.jpg" },
        { kind: "file", source: "attachment", path: "/tmp/c.txt", name: "c.txt" },
      ]),
    ];
    const gallery = collectThreadGalleryImages(items, {});
    expect(gallery.length).toBe(2);
    expect(gallery[0]!.alt).toBe("a.png");
    expect(gallery[1]!.alt).toBe("b.jpg");
    expect(gallery[0]!.src).toContain("poracode-local://");
  });

  it("resolves remote attachment paths through the desktop endpoint", () => {
    const items = [userItem("u1", [attachmentImage("/tmp/a.png", "a.png")])];
    const gallery = collectThreadGalleryImages(items, {
      imageUrlForPath: (p) => `https://desktop/images?path=${encodeURIComponent(p)}`,
    });
    expect(gallery[0]!.src).toBe("https://desktop/images?path=%2Ftmp%2Fa.png");
  });

  it("collects assistant image blocks and markdown images in display order", () => {
    const items = [
      assistantItem(
        "a1",
        [
          {
            kind: "image",
            dataUrl: "data:image/png;base64,AAA",
            mimeType: "image/png",
            name: "gen.png",
          },
        ],
        "Here ![alt](https://example.test/x.png) done",
      ),
    ];
    const gallery = collectThreadGalleryImages(items, {});
    expect(gallery.length).toBe(2);
    // Markdown first (paints inline in the text), then structured blocks.
    expect(gallery[0]!.src).toBe("https://example.test/x.png");
    expect(gallery[1]!.src).toBe("data:image/png;base64,AAA");
  });

  it("collects generated image_view tool images", () => {
    const tool: RuntimeChatItem = {
      id: "t1",
      type: "image_view",
      state: "completed",
      payload: {
        name: "imageGeneration",
        status: "success",
        result: { image: "data:image/png;base64,BBB" },
      },
      streams: {},
    };
    const gallery = collectThreadGalleryImages([tool], {});
    expect(gallery.length).toBe(1);
    expect(gallery[0]!.src).toBe("data:image/png;base64,BBB");
  });

  it("skips errored image_view rows like the transcript does", () => {
    const tool: RuntimeChatItem = {
      id: "t1",
      type: "image_view",
      state: "completed",
      payload: {
        name: "imageGeneration",
        status: "error",
        result: { image: "data:image/png;base64,BBB" },
      },
      streams: {},
    };
    expect(collectThreadGalleryImages([tool], {}).length).toBe(0);
  });

  it("skips sub-agent children that render in the overlay", () => {
    const child: RuntimeChatItem = {
      ...assistantItem(
        "child-1",
        [
          {
            kind: "image",
            dataUrl: "data:image/png;base64,AAA",
            mimeType: "image/png",
            name: "gen.png",
          },
        ],
        "",
      ),
      parentItemId: "agent-1",
    };
    expect(collectThreadGalleryImages([child], {}).length).toBe(0);
  });

  it("skips host-held refs without a resolver (remote, no session)", () => {
    const tool: RuntimeChatItem = {
      id: "t1",
      type: "image_view",
      state: "completed",
      payload: {
        name: "imageView",
        status: "success",
        result: {
          image: {
            __poracodeImageRef: {
              threadId: "t",
              itemId: "t1",
              path: ["result", "image"],
              mime: "image/png",
              bytes: 1234,
              width: 8,
              height: 8,
            },
          },
        },
      },
      streams: {},
    };
    // Without remoteImageRefUrl (and no global bridge resolver in jsdom) the
    // row falls back to the inert accordion — the gallery must agree.
    expect(collectThreadGalleryImages([tool], {}).length).toBe(0);
  });

  it("deduplicates identical URLs while preserving order", () => {
    const items = [
      assistantItem(
        "a1",
        [],
        "![one](https://example.test/x.png) ![two](https://example.test/x.png)",
      ),
    ];
    const gallery = collectThreadGalleryImages(items, {});
    expect(gallery.length).toBe(1);
    expect(gallery[0]?.src).toBe("https://example.test/x.png");
  });

  it("extracts markdown images and resolves project-relative targets", () => {
    const out = extractMarkdownGalleryImages("See ![shot](images/a.png)", {
      projectRoot: "/proj",
    });
    expect(out.length).toBe(1);
    expect(out[0]!.src).toContain("poracode-local://");
  });

  it("does not hide remote image resolver failures", () => {
    expect(() =>
      extractMarkdownGalleryImages("![shot](images/a.png)", {
        projectRoot: "/proj",
        remoteLocalImageUrl: () => {
          throw new Error("resolver failed");
        },
      }),
    ).toThrow("resolver failed");
  });

  it("skips non-image relative targets", () => {
    expect(extractMarkdownGalleryImages("See ![doc](notes/readme.md)", {}).length).toBe(0);
    expect(extractMarkdownGalleryImages("no images here", {}).length).toBe(0);
  });

  it("skips markdown data: targets the transcript sanitizer strips", () => {
    expect(extractMarkdownGalleryImages("![inline](data:image/png;base64,AAA)", {}).length).toBe(0);
    expect(extractMarkdownGalleryImages("![blob](blob:abc-123)", {}).length).toBe(0);
  });

  it("skips images hidden inside fenced code blocks", () => {
    const text = [
      "Real ![one](https://example.test/one.png)",
      "```",
      "![hidden](https://tracker.example/pixel.png)",
      "```",
      "Tail ![two](https://example.test/two.png)",
    ].join("\n");
    const out = extractMarkdownGalleryImages(text, {});
    expect(out.map((img) => img.src)).toEqual([
      "https://example.test/one.png",
      "https://example.test/two.png",
    ]);
  });

  it("skips tilde-fenced and HTML-commented image syntax", () => {
    const text = [
      "~~~",
      "![fenced](https://tracker.example/fenced.png)",
      "~~~",
      "<!-- ![commented](https://tracker.example/commented.png) -->",
      "![visible](https://example.test/visible.png)",
    ].join("\n");
    expect(extractMarkdownGalleryImages(text, {}).map((image) => image.src)).toEqual([
      "https://example.test/visible.png",
    ]);
  });

  it("skips images in stripped raw HTML and ignores data-src", () => {
    const text = [
      '<script><img src="https://tracker.example/script.png"></script>',
      '<style><img src="https://tracker.example/style.png"></style>',
      '<img data-src="https://tracker.example/data.png">',
      '<img src="https://example.test/visible.png?a=1&amp;b=2">',
    ].join("\n");
    expect(extractMarkdownGalleryImages(text, {}).map((image) => image.src)).toEqual([
      "https://example.test/visible.png?a=1&b=2",
    ]);
  });

  it("skips images hidden inside inline code spans", () => {
    const out = extractMarkdownGalleryImages(
      "Use `![x](https://example.test/x.png)` literally, then ![y](https://example.test/y.png)",
      {},
    );
    expect(out.map((img) => img.src)).toEqual(["https://example.test/y.png"]);
  });

  it("uses parsed markdown destinations and reference images", () => {
    const out = extractMarkdownGalleryImages(
      "![balanced](https://example.test/image_(1).png) ![reference][shot]\n\n[shot]: https://example.test/ref.png",
      {},
    );
    expect(out.map((image) => image.src)).toEqual([
      "https://example.test/image_(1).png",
      "https://example.test/ref.png",
    ]);
  });

  it("resolves absolute HTML img paths but not root-relative ones (renderer parity)", () => {
    const absolute = extractMarkdownGalleryImages('<img src="/tmp/a.png" alt="a">', {});
    expect(absolute.length).toBe(1);
    expect(absolute[0]!.src).toContain("poracode-local://");
    expect(extractMarkdownGalleryImages('<img src="images/a.png" alt="a">', {}).length).toBe(0);
  });

  it("emits mixed markdown and HTML images in document order", () => {
    const out = extractMarkdownGalleryImages(
      '<img src="https://example.test/first.png"> then ![second](https://example.test/second.png)',
      {},
    );
    expect(out.map((img) => img.src)).toEqual([
      "https://example.test/first.png",
      "https://example.test/second.png",
    ]);
  });

  it("builds local project image roots", () => {
    const local = buildGalleryResolversFromState(
      {
        runtimeItemIdsByThread: {},
        runtimeItemsByIdByThread: {},
        threads: [{ id: "t1", projectId: "p1", agentKind: "codex" }],
        projects: [{ id: "p1", location: { kind: "windows" as const, path: "E:\\work\\project" } }],
      },
      "t1",
    );
    expect(local.projectRoot).toBe("E:\\work\\project");
  });
});
