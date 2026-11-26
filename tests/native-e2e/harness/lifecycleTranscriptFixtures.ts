import { imageDataUrl, TRANSCRIPT_PREVIEW_IMAGE } from "../fixtures/tool-taxonomy/media-assets.ts";
import { TRANSCRIPT_CODE_COPY_BLOCKS } from "./labFixtures.ts";

export function longFindReplyItem(): Record<string, unknown> {
  const text =
    "NEEDLEALPHA begins the reply. " +
    "This deliberately long passage separates the two search results in a single paragraph. ".repeat(
      120,
    ) +
    "NEEDLEOMEGA ends the reply.";
  return {
    id: "item-fixture-long-find-reply",
    type: "assistant_message",
    state: "completed",
    payload: { content: [{ kind: "text", text }] },
    streams: { assistant_text: text },
  };
}

function assistantContentItem(
  content: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return [
    {
      id: "item-fixture-assistant",
      type: "assistant_message",
      state: "completed",
      payload: { content },
      streams: {},
    },
  ];
}

export function transcriptFileItems(): Array<Record<string, unknown>> {
  return assistantContentItem([
    { kind: "text", text: "The transcript attachment is ready." },
    { kind: "file", path: "reports/transcript-test.txt", name: "transcript-test.txt" },
  ]);
}

export function transcriptEditableFileItems(): Array<Record<string, unknown>> {
  return assistantContentItem([
    { kind: "text", text: "The editable transcript attachments are ready." },
    { kind: "file", path: "audit notes.txt", name: "audit notes.txt" },
    { kind: "file", path: "reports/activity.csv", name: "activity.csv" },
    { kind: "file", path: "reports/activity.tsv", name: "activity.tsv" },
  ]);
}

export function transcriptVideoItems(): Array<Record<string, unknown>> {
  return assistantContentItem([
    { kind: "text", text: "The transcript video is ready." },
    {
      kind: "file",
      path: "reports/transcript-video.mp4",
      name: "transcript-video.mp4",
      mimeType: "video/mp4",
    },
  ]);
}

export function transcriptPdfItems(): Array<Record<string, unknown>> {
  return assistantContentItem([
    { kind: "text", text: "The transcript PDF is ready." },
    {
      kind: "file",
      path: "reports/transcript-preview.pdf",
      name: "transcript-preview.pdf",
      mimeType: "application/pdf",
    },
  ]);
}

export function transcriptHtmlVisualItems(): Array<Record<string, unknown>> {
  const text = [
    "The transcript visual is ready.",
    "",
    "```poracode-html-v1 Fixture calculator",
    `<main style="padding:12px;background:var(--background);color:var(--foreground);font:16px var(--font-sans)">`,
    '<button id="add">Add one</button>',
    '<p id="total" aria-live="polite">Total 0</p>',
    "</main>",
    '<script>let count=0;document.getElementById("add").onclick=()=>{document.getElementById("total").textContent="Total "+(++count);};</script>',
    "```",
  ].join("\n");
  return assistantContentItem([{ kind: "text", text }]);
}

export function transcriptWideTableItems(): Array<Record<string, unknown>> {
  const header = Array.from({ length: 12 }, (_, index) => `Column ${index + 1}`);
  const data = [
    "Needle Near",
    ...Array.from({ length: 10 }, (_, index) => `Readable value ${index + 2}`),
    "Needle Far",
  ];
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const text = [
    "The wide transcript table is ready.",
    "",
    row(header),
    row(header.map(() => "---")),
    row(data),
  ].join("\n");
  return assistantContentItem([{ kind: "text", text }]);
}

export function transcriptCodeItems(): Array<Record<string, unknown>> {
  const [first, second] = TRANSCRIPT_CODE_COPY_BLOCKS;
  return assistantContentItem([
    {
      kind: "text",
      text: [
        "Copy only the selected code block.",
        "````text",
        first,
        "````",
        "The blocks have separate contents.",
        "~~~",
        second,
        "~~~",
      ].join("\r\n"),
    },
  ]);
}

export function transcriptSourceLinkItems(): Array<Record<string, unknown>> {
  return assistantContentItem([
    {
      kind: "text",
      text: [
        "Inspect the source reference.",
        "[Linked source](./README.md:48)",
        "`README.md:48`",
        [
          "- [Source in the list](./README.md:48)",
          "- Read the [source in context](./README.md:48).",
          "- Visit [Apple Developer](https://developer.apple.com) for the docs.",
        ].join("\n"),
      ].join("\n\n"),
    },
  ]);
}

export function transcriptImageItems(withGallery: boolean): Array<Record<string, unknown>> {
  return assistantContentItem([
    { kind: "text", text: "The transcript image is ready." },
    {
      kind: "image",
      mimeType: TRANSCRIPT_PREVIEW_IMAGE.mime,
      dataUrl: `data:${TRANSCRIPT_PREVIEW_IMAGE.mime};base64,${TRANSCRIPT_PREVIEW_IMAGE.base64}`,
      name: "fixture.png",
    },
    ...(withGallery
      ? [
          {
            kind: "image",
            mimeType: "image/png",
            dataUrl: imageDataUrl("png"),
            name: "fixture-second.png",
          },
        ]
      : []),
  ]);
}

export function transcriptMcpAppItems(): Array<Record<string, unknown>> {
  return [
    {
      id: "item-fixture-mcp-app",
      type: "tool_call",
      state: "completed",
      payload: {
        name: "show_deployment",
        title: "Deployment Dashboard",
        status: "success",
        args: { environment: "staging" },
        result: {
          content: [{ type: "text", text: "Deployment fallback summary" }],
          _meta: {
            "com.poracode/mcp-app": {
              version: 1,
              sessionId: "00000000-0000-4000-8000-000000000001",
              toolName: "show_deployment",
              resourceUri: "ui://fixture/deployment",
            },
          },
        },
      },
      streams: {},
    },
  ];
}
