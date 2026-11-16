import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileLines, readTailLines, type SessionImportFile } from "../base/sessionImport";
import { createGeminiSessionImport } from "./sessionImport";

describe("createGeminiSessionImport", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "poracode-gemini-import-"));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  function writeChat(projectSlug: string, fileName: string, content: string): string {
    const projectDir = join(rootDir, ".gemini", "tmp", projectSlug);
    const chatsDir = join(projectDir, "chats");
    mkdirSync(chatsDir, { recursive: true });
    const filePath = join(chatsDir, fileName);
    writeFileSync(filePath, content, "utf8");
    return filePath;
  }

  function makeImportFile(filePath: string, headBudgetBytes = Infinity): SessionImportFile {
    return {
      path: filePath,
      headLines: () => readFileLines(filePath, headBudgetBytes),
      tailLines: () => readTailLines(filePath, 64 * 1024),
    };
  }

  it("targets the custom GEMINI_CLI_HOME when supplied and filters valid session files", () => {
    const source = createGeminiSessionImport(rootDir);
    expect(source.roots).toEqual([join(rootDir, ".gemini", "tmp")]);
    expect(source.acceptFile("session-2026-05-01T10-00-abcd1234.json")).toBe(true);
    expect(source.acceptFile("session-2026-05-01T10-00-abcd1234.jsonl")).toBe(true);
    expect(source.acceptFile("logs.json")).toBe(false);
    expect(source.acceptFile("session-123.txt")).toBe(false);
  });

  it("imports legacy .json conversations and falls back to .project_root for cwd", async () => {
    const projectDir = join(rootDir, ".gemini", "tmp", "my-proj");
    const filePath = writeChat(
      "my-proj",
      "session-2026-05-01-12345678.json",
      JSON.stringify({
        sessionId: "12345678-1111-2222-3333-444444444444",
        startTime: "2026-05-01T10:00:00.000Z",
        summary: "Refactor router",
        messages: [
          { id: "m1", type: "user", content: [{ text: "Inspect the router" }] },
          {
            id: "m2",
            type: "gemini",
            model: "gemini-3.5-flash",
            content: "Found two routes to merge.",
          },
          { id: "m3", type: "info", content: "Model switched" },
        ],
      }),
    );
    writeFileSync(join(projectDir, ".project_root"), "/repo/my-proj\n", "utf8");

    const source = createGeminiSessionImport(rootDir);
    const summary = await source.summarize(makeImportFile(filePath));
    expect(summary).toEqual({
      providerSessionId: "12345678-1111-2222-3333-444444444444",
      cwd: "/repo/my-proj",
      startedAt: "2026-05-01T10:00:00.000Z",
      model: "gemini-3.5-flash",
      preview: "Inspect the router",
      title: "Refactor router",
    });

    const transcript = await source.readTranscript(filePath);
    expect(transcript).toEqual({
      providerSessionId: "12345678-1111-2222-3333-444444444444",
      messages: [
        { role: "user", text: "Inspect the router" },
        { role: "assistant", text: "Found two routes to merge." },
      ],
    });
  });

  it("replays v0.68.0 .jsonl conversations including $set, $patch, and $rewindTo", async () => {
    const lines = [
      JSON.stringify({
        sessionId: "abcdef12-0000-4000-8000-000000000001",
        startTime: "2026-05-02T09:00:00.000Z",
        directories: ["/workspace/app"],
      }),
      JSON.stringify({ id: "u1", type: "user", content: "First question" }),
      JSON.stringify({
        id: "g1",
        type: "gemini",
        model: "gemini-3.8-flash",
        content: "Initial answer",
      }),
      JSON.stringify({ id: "u2", type: "user", content: "Temporary prompt" }),
      JSON.stringify({ $rewindTo: "u2" }),
      JSON.stringify({
        $patch: {
          updates: [{ id: "g1", content: "Updated answer" }],
        },
      }),
      JSON.stringify({ id: "u3", type: "user", content: "Follow-up" }),
      JSON.stringify({ id: "g2", type: "gemini", content: "Final reply" }),
      JSON.stringify({ $set: { summary: "App debugging" } }),
    ].join("\n");

    const filePath = writeChat("abcdef12", "session-2026-05-02-abcdef12.jsonl", `${lines}\n`);

    const source = createGeminiSessionImport(rootDir);
    const summary = await source.summarize(makeImportFile(filePath));
    expect(summary).toEqual({
      providerSessionId: "abcdef12-0000-4000-8000-000000000001",
      cwd: "/workspace/app",
      startedAt: "2026-05-02T09:00:00.000Z",
      model: "gemini-3.8-flash",
      preview: "First question",
      title: "App debugging",
    });

    const transcript = await source.readTranscript(filePath);
    expect(transcript).toEqual({
      providerSessionId: "abcdef12-0000-4000-8000-000000000001",
      messages: [
        { role: "user", text: "First question" },
        { role: "assistant", text: "Updated answer" },
        { role: "user", text: "Follow-up" },
        { role: "assistant", text: "Final reply" },
      ],
    });
  });

  it("summarizes >256 KiB .json conversations and trailing .jsonl $set.summary beyond the head budget", async () => {
    const largePadding = "x".repeat(300 * 1024);
    const largeJsonPath = writeChat(
      "large-json",
      "session-2026-05-03-large001.json",
      JSON.stringify(
        {
          sessionId: "large001-0000-4000-8000-000000000001",
          startTime: "2026-05-03T10:00:00.000Z",
          summary: "Large JSON session",
          directories: ["/workspace/large-json"],
          messages: [
            { id: "m1", type: "user", content: "Summarize large output" },
            { id: "m2", type: "gemini", model: "gemini-3.8-flash", content: largePadding },
          ],
        },
        null,
        2,
      ),
    );

    const largeJsonlLines = [
      JSON.stringify({
        sessionId: "large002-0000-4000-8000-000000000002",
        startTime: "2026-05-03T11:00:00.000Z",
        directories: ["/workspace/large-jsonl"],
      }),
      JSON.stringify({ id: "u1", type: "user", content: "Inspect logs" }),
      JSON.stringify({
        id: "g1",
        type: "gemini",
        model: "gemini-3.8-flash",
        content: "Working...",
      }),
      JSON.stringify({ id: "g2", type: "gemini", content: largePadding }),
      JSON.stringify({ $set: { summary: "Late JSONL summary" } }),
    ].join("\n");
    const largeJsonlPath = writeChat(
      "large-jsonl",
      "session-2026-05-03-large002.jsonl",
      `${largeJsonlLines}\n`,
    );

    const source = createGeminiSessionImport(rootDir);
    expect(await source.summarize(makeImportFile(largeJsonPath, 256 * 1024))).toEqual({
      providerSessionId: "large001-0000-4000-8000-000000000001",
      cwd: "/workspace/large-json",
      startedAt: "2026-05-03T10:00:00.000Z",
      model: "gemini-3.8-flash",
      preview: "Summarize large output",
      title: "Large JSON session",
    });

    expect(await source.summarize(makeImportFile(largeJsonlPath, 256 * 1024))).toEqual({
      providerSessionId: "large002-0000-4000-8000-000000000002",
      cwd: "/workspace/large-jsonl",
      startedAt: "2026-05-03T11:00:00.000Z",
      model: "gemini-3.8-flash",
      preview: "Inspect logs",
      title: "Late JSONL summary",
    });
  });

  it("ignores subagent transcripts and non-chats files", async () => {
    const subagentFile = writeChat(
      "proj-sub",
      "session-subagent-11111111.jsonl",
      `${JSON.stringify({ sessionId: "11111111-1111-4111-8111-111111111111", kind: "subagent" })}\n${JSON.stringify({ id: "u1", type: "user", content: "Subagent task" })}\n`,
    );

    const source = createGeminiSessionImport(rootDir);
    expect(await source.summarize(makeImportFile(subagentFile))).toBeUndefined();
    expect(await source.readTranscript(subagentFile)).toEqual({ messages: [] });
  });
});
