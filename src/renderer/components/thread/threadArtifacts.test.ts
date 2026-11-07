import { describe, expect, it } from "vitest";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { pathRefUrl } from "./ChatPane/parts/items/markdownPathRefs";
import { collectThreadArtifacts } from "./threadArtifacts";
import { resolveThreadTranscriptMarkdownFormatter } from "./threadTranscriptMarkdown";

function message(id: string, text: string): RuntimeChatItem {
  return {
    id,
    type: "assistant_message",
    state: "completed",
    payload: { content: [{ kind: "text", text }] },
    streams: {},
  };
}

describe("collectThreadArtifacts", () => {
  it("normalizes slash-prefixed Windows links before display and deduplication", () => {
    const internal = pathRefUrl({ kind: "file", path: "/E:/work/report.md", line: 20 });
    expect(
      collectThreadArtifacts([
        message(
          "windows",
          `[Report](/E:/work/report.md:20) [Internal](${internal}) [File URL](file:///E:/work/report.md) [Encoded](</e:/My%20Files/notes.txt>) [POSIX](/tmp/notes.txt) [UNC](file://server/share/notes.txt)`,
        ),
      ]),
    ).toEqual([
      { target: "E:/work/report.md", name: "report.md", external: false },
      { target: "e:/My Files/notes.txt", name: "notes.txt", external: false },
      { target: "/tmp/notes.txt", name: "notes.txt", external: false },
      { target: "//server/share/notes.txt", name: "notes.txt", external: false },
    ]);
  });

  it("normalizes slash-prefixed Windows attachments", () => {
    const item: RuntimeChatItem = {
      id: "attachment",
      type: "user_message",
      state: "completed",
      payload: { content: [{ kind: "file", path: "/E:/work/input.csv", name: "Input data" }] },
      streams: {},
    };
    expect(collectThreadArtifacts([item])).toEqual([
      { target: "E:/work/input.csv", name: "Input data", external: false },
    ]);
  });

  it("uses the provider's transcript formatter for native output citations and keeps formatter caches separate", () => {
    const item = message(
      "native",
      ':codex-file-citation{path="D:/Output files/report.pdf" purpose="output"}',
    );
    expect(collectThreadArtifacts([item])).toEqual([]);
    expect(
      collectThreadArtifacts([item], resolveThreadTranscriptMarkdownFormatter("codex")),
    ).toEqual([{ target: "D:/Output files/report.pdf", name: "report.pdf", external: false }]);
    expect(collectThreadArtifacts([item])).toEqual([]);
  });
  it("collects attachments and output links newest first without duplicate files or images", () => {
    const attached: RuntimeChatItem = {
      id: "user",
      type: "user_message",
      state: "completed",
      payload: {
        content: [
          { kind: "file", path: "/tmp/input.csv", name: "Input data" },
          { kind: "file", path: "/tmp/picture.png" },
        ],
      },
      streams: {},
    };
    expect(
      collectThreadArtifacts([
        attached,
        message("a", "[Report](report.pdf)"),
        message(
          "b",
          "[Report](report.pdf) [Download](https://example.com/results.zip?token=abc) ![Preview](preview.png)",
        ),
      ]),
    ).toEqual([
      { target: "report.pdf", name: "report.pdf", external: false },
      { target: "https://example.com/results.zip?token=abc", name: "results.zip", external: true },
      { target: "/tmp/input.csv", name: "Input data", external: false },
    ]);
  });

  it("supports reference links, encoded file names, Windows paths and internal path links", () => {
    const internal = pathRefUrl({ kind: "file", path: "/tmp/Build report.docx", line: 2 });
    expect(
      collectThreadArtifacts([
        message(
          "a",
          `[One][report]\n\n[report]: file:///C:/My%20Files/report.pdf\n\n[Two](${internal})\n\n[Three](<C:/Output/slides.pptx>)`,
        ),
      ]).map((entry) => entry.target),
    ).toEqual(["C:/My Files/report.pdf", "/tmp/Build report.docx", "C:/Output/slides.pptx"]);
  });

  it("ignores code, ordinary websites, unsafe schemes, folders, unrecognized path versions and unfinished or delegated messages", () => {
    const item = message(
      "a",
      "`[Code](code.pdf)`\n\n```md\n[Example](example.pdf)\n```\n\n[Site](https://example.com) [Unsafe](javascript:evil.pdf) [Data](data:text/plain,a.pdf) [Folder](output/) [Future](https://poracode.local/path/v99/report.pdf)",
    );
    expect(
      collectThreadArtifacts([
        item,
        { ...message("b", "[Partial](partial.pdf)"), state: "updated" },
        { ...message("c", "[Child](child.pdf)"), parentItemId: "tool" },
      ]),
    ).toEqual([]);
  });

  it("uses the authoritative final message instead of stale streamed text", () => {
    const item = message("a", "[Final](final.pdf)");
    item.payload = {
      content: [{ kind: "text", text: "[Final](final.pdf)" }],
      displayAuthoritative: true,
    };
    item.streams = { assistant_text: "[Draft](draft.pdf)" };
    expect(collectThreadArtifacts([item]).map((entry) => entry.target)).toEqual(["final.pdf"]);
  });
});
