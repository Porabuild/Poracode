import { describe, expect, it } from "vitest";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { collectThreadVideos } from "./threadVideos";

function message(id: string, text: string): RuntimeChatItem {
  return {
    id,
    type: "assistant_message",
    state: "completed",
    payload: { content: [{ kind: "text", text }] },
    streams: {},
  };
}

describe("collectThreadVideos", () => {
  it("collects video attachments, markdown video links, HTML video sources, and completed tool videos newest first without duplicates", () => {
    const attached: RuntimeChatItem = {
      id: "user",
      type: "user_message",
      state: "completed",
      payload: {
        content: [
          {
            kind: "file",
            path: "/E:/work/clip.mp4",
            name: "User clip",
            mimeType: "video/mp4",
          },
          {
            kind: "file",
            path: "/E:/work/notes.pdf",
            name: "Notes",
            mimeType: "application/pdf",
          },
        ],
      },
      streams: {},
    };
    const toolResult: RuntimeChatItem = {
      id: "tool",
      type: "mcp_tool_call",
      state: "completed",
      payload: {
        status: "success",
        result: {
          content: [
            {
              type: "resource_link",
              uri: "file:///tmp/tool-recording.webm",
              name: "Tool clip",
              mimeType: "video/webm",
            },
          ],
        },
      },
      streams: {},
    };

    const collected = collectThreadVideos(
      [
        attached,
        message("a1", "[Old](recordings/first.mp4) [Dup](/E:/work/clip.mp4) ![NonVideo](shot.png)"),
        toolResult,
        message(
          "a2",
          '<video src="https://example.com/demo.mp4" title="Demo stream"></video>\n\n<video><source src="captures/second.mov" title="Capture 2" /></video>\n\n[Latest][ref]\n\n[ref]: recordings/first.mp4',
        ),
      ],
      undefined,
      { projectRoot: "E:/work/project" },
    );

    expect(collected).toEqual([
      {
        target: "E:/work/project/recordings/first.mp4",
        name: "Latest",
        src: "poracode-local://local/E:/work/project/recordings/first.mp4",
        external: false,
        filePath: "E:/work/project/recordings/first.mp4",
      },
      {
        target: "E:/work/project/captures/second.mov",
        name: "Capture 2",
        src: "poracode-local://local/E:/work/project/captures/second.mov",
        external: false,
        filePath: "E:/work/project/captures/second.mov",
        mimeType: "video/*",
      },
      {
        target: "https://example.com/demo.mp4",
        name: "Demo stream",
        src: "https://example.com/demo.mp4",
        external: true,
        mimeType: "video/*",
      },
      {
        target: "/tmp/tool-recording.webm",
        name: "Tool clip",
        src: "file:///tmp/tool-recording.webm",
        external: false,
        filePath: "/tmp/tool-recording.webm",
        mimeType: "video/webm",
      },
      {
        target: "E:/work/clip.mp4",
        name: "Dup",
        src: "poracode-local://local/E:/work/clip.mp4",
        external: false,
        filePath: "E:/work/clip.mp4",
      },
    ]);

    // Without the markdown re-mention, the user attachment retains its name and MIME type.
    expect(collectThreadVideos([attached])).toEqual([
      {
        target: "E:/work/clip.mp4",
        name: "User clip",
        src: "poracode-local://local/E:/work/clip.mp4",
        external: false,
        filePath: "E:/work/clip.mp4",
        mimeType: "video/mp4",
      },
    ]);
  });

  it("ignores non-video links, code blocks, HTML comments, unsafe schemes, unfinished and delegated items", () => {
    const items: RuntimeChatItem[] = [
      message(
        "a",
        '`[Code](code.mp4)`\n\n```md\n<video src="code-block.mp4"></video>\n```\n\n<!-- <video src="hidden.mp4"></video> -->\n\n[Pdf](report.pdf) [Unsafe](javascript:evil.mp4)',
      ),
      { ...message("b", "[Streaming](partial.mp4)"), state: "updated" },
      { ...message("c", "[Child](child.mp4)"), parentItemId: "tool" },
    ];
    expect(collectThreadVideos(items)).toEqual([]);
  });

  it("collects source tags only inside videos, including when markdown splits the HTML nodes", () => {
    const items = [
      message(
        "html",
        [
          '<audio><source src="audio.mp3" /></audio>',
          '<picture><source src="image.webp" /></picture>',
          "<video>",
          "",
          '<source src="recording.webm" />',
          "",
          "</video>",
          '<source src="orphan.mp4" />',
        ].join("\n"),
      ),
    ];
    expect(collectThreadVideos(items).map((video) => video.name)).toEqual(["recording.webm"]);
  });
});
