// Fixture-only ACP payloads. These simulate results; they do not execute tools.
// Keep legacy fake-acp output unchanged unless control.toolProfile is selected.
import { deflateSync } from "node:zlib";

export const TOOL_PROFILES = Object.freeze({
  light: { everyTicks: 25, batch: 1, outputBytes: 1024 },
  heavy: { everyTicks: 5, batch: 1, outputBytes: 8192 },
  bursty: { everyTicks: 150, batch: 24, outputBytes: 4096 },
});
export const TOOL_CASES = Object.freeze([
  "create",
  "edit",
  "same-file-edit",
  "read",
  "list",
  "grep",
  "glob",
  "web-search",
  "fetch",
  "command",
  "command-error",
  "delete",
  "move",
  "think",
  "switch-mode",
  "mcp-json",
  "unknown",
  "image",
  "images",
  "subagent",
  "background-subagent",
  "workflow-card",
  "crossagents-mcp",
  "large-result",
]);

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(kind, bytes) {
  const type = Buffer.from(kind);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(bytes.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
  return Buffer.concat([len, type, bytes, crc]);
}
function fixturePng(width, height, phase, pressure = false) {
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * (width * 3 + 1) + 1 + x * 3;
      pixels[i] = pressure ? (x + phase) % 256 : ((x >> 5) + phase) % 256;
      pixels[i + 1] = pressure ? (y + phase) % 256 : ((y >> 5) + phase) % 256;
      pixels[i + 2] = ((x >> 4) ^ (y >> 4)) % 256;
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}
// Real decoding/dimensions, deterministic synthetic pictures (not photographs).
let images;
let pressureImages;
const imageContent = (n, pressure = false) => {
  const selected = pressure
    ? (pressureImages ||= [fixturePng(320, 240, 0, true), fixturePng(1024, 768, 73, true)])
    : (images ||= [fixturePng(320, 240, 0), fixturePng(1024, 768, 73)]);
  return selected
    .slice(0, n)
    .map((data) => ({ type: "content", content: { type: "image", mimeType: "image/png", data } }));
};
const textContent = (text) => [{ type: "content", content: { type: "text", text } }];

export function toolSpec(caseName, index, outputBytes, imageClass = "standard") {
  const path = "fixtures/sample.ts";
  const oldText = "export const value = 1;\n";
  const newText = `export const value = ${index + 2};\n`;
  const text = `[rich-${caseName}-${index}] deterministic tool output\n`
    .repeat(Math.ceil(outputBytes / 40))
    .slice(0, outputBytes);
  const base = {
    title: caseName,
    kind: "other",
    rawInput: { fixture: index },
    rawOutput: { text },
  };
  switch (caseName) {
    case "create":
      return {
        ...base,
        title: "Write",
        kind: "edit",
        rawInput: { file_path: "fixtures/created.ts", content: newText },
        content: [{ type: "diff", path: "fixtures/created.ts", oldText: "", newText }],
      };
    case "edit":
    case "same-file-edit":
      return {
        ...base,
        title: "Edit",
        kind: "edit",
        rawInput: { file_path: path, old_string: oldText, new_string: newText },
        content: [{ type: "diff", path, oldText, newText }],
      };
    case "read":
      return {
        ...base,
        title: "Read",
        kind: "read",
        rawInput: { file_path: path, offset: 1, limit: 80 },
        locations: [{ path, line: 1 }],
      };
    case "list":
      return {
        ...base,
        title: "List",
        kind: "read",
        rawInput: { path: "fixtures/" },
        rawOutput: { entries: ["sample.ts", "created.ts", "photo.png"] },
      };
    case "grep":
      return {
        ...base,
        title: "Grep",
        kind: "search",
        rawInput: { pattern: "value", path: "fixtures/" },
        locations: [{ path, line: 1 }],
      };
    case "glob":
      return {
        ...base,
        title: "Glob",
        kind: "search",
        rawInput: { pattern: "fixtures/**/*.ts" },
        locations: [{ path }],
      };
    case "web-search":
      return {
        ...base,
        title: "Web search",
        kind: "search",
        rawInput: { query: "fixture deterministic search" },
        rawOutput: {
          results: [
            { title: "Fixture result", url: "https://example.invalid/fixture", snippet: text },
          ],
        },
      };
    case "fetch":
      return {
        ...base,
        title: "Fetch",
        kind: "fetch",
        rawInput: { url: "https://example.invalid/fixture" },
        content: textContent("# Fixture page\n\n" + text),
      };
    case "command":
    case "command-error":
      return {
        ...base,
        title: "Run fixture validation",
        kind: "execute",
        rawInput: { command: "node fixtures/check.mjs", cwd: "fixtures/" },
        rawOutput: { exitCode: caseName === "command-error" ? 1 : 0, output: text },
        failed: caseName === "command-error",
      };
    case "delete":
      return {
        ...base,
        title: "Delete",
        kind: "delete",
        rawInput: { file_path: "fixtures/obsolete.ts" },
        content: [{ type: "diff", path: "fixtures/obsolete.ts", oldText, newText: "" }],
      };
    case "move":
      return {
        ...base,
        title: "Move",
        kind: "move",
        rawInput: { source: "fixtures/old.ts", destination: "fixtures/new.ts" },
        locations: [{ path: "fixtures/old.ts" }, { path: "fixtures/new.ts" }],
      };
    case "think":
      return { ...base, title: "Think", kind: "think", content: textContent(text) };
    case "switch-mode":
      return {
        ...base,
        title: "Switch mode",
        kind: "switch_mode",
        rawInput: { mode: "fixture-review" },
      };
    case "mcp-json":
      return {
        ...base,
        title: "mcp__fixture__inspect",
        rawInput: { depth: 3, paths: [path] },
        rawOutput: {
          rows: Array.from({ length: 32 }, (_, n) => ({ id: n, path, value: `row ${n}` })),
          text,
        },
      };
    case "image":
    case "images":
      return {
        ...base,
        title: "Read fixture image",
        kind: "read",
        rawInput: { file_path: "fixtures/photo.png" },
        content:
          caseName === "images"
            ? imageContent(2, imageClass === "pressure")
            : imageContent(2, imageClass === "pressure").slice(1),
        rawOutput: undefined,
      };
    case "subagent":
    case "background-subagent":
      return {
        ...base,
        title: "Task",
        rawInput: {
          subagent_type: "fixture-review",
          description: `Inspect fixture ${index}`,
          prompt: "Read local fixture and report",
          model: "fixture-model",
          ...(caseName === "background-subagent" ? { run_in_background: true } : {}),
        },
        delegated: true,
      };
    case "workflow-card":
      return {
        ...base,
        title: "Workflow",
        rawInput: {
          script:
            '// description: Fixture dependency workflow\nconst plan = ["research", "implement", "verify"];',
        },
        rawOutput:
          "Fixture workflow result: research → implement → verify. Display simulation only.",
      };
    case "crossagents-mcp":
      return {
        ...base,
        title: "mcp__crossagents__spawn_agent",
        rawInput: {
          name: `Fixture reviewer ${index}`,
          prompt: "Inspect disposable fixture",
          background: true,
        },
        rawOutput: { run_id: `fixture-run-${index}`, status: "completed", output: text },
      };
    case "large-result":
      return { ...base, title: "mcp__fixture__large_result", rawOutput: { text: text.repeat(8) } };
    default:
      return { ...base, title: "Fixture custom tool" };
  }
}

export function createRichToolWorkload(emit, slot) {
  const stats = {
    revision: 4,
    imageClass: "standard",
    started: 0,
    completed: 0,
    failed: 0,
    updates: 0,
    imageBlocks: 0,
    childTools: 0,
    childMessages: 0,
    byCase: {},
    pending: 0,
  };
  const pending = [];
  let ticks = 0;
  let index = 0;
  function finish(call, failed = call.spec.failed) {
    const { spec, id, caseName } = call;
    emit({
      sessionUpdate: "tool_call_update",
      toolCallId: id,
      status: failed ? "failed" : "completed",
      ...(spec.rawOutput !== undefined ? { rawOutput: spec.rawOutput } : {}),
      ...(spec.content ? { content: spec.content } : {}),
      ...(spec.delegated
        ? { _meta: { poracodeSubAgentStatus: failed ? "failed" : "completed" } }
        : {}),
    });
    stats.updates++;
    stats.completed++;
    if (failed) stats.failed++;
    if (spec.content)
      stats.imageBlocks += spec.content.filter((x) => x.content?.type === "image").length;
    stats.byCase[caseName].completed++;
  }
  function start(caseName, profile) {
    const n = index++;
    const id = `rich-${slot}-${n}-${caseName}`;
    const spec = toolSpec(caseName, n, profile.outputBytes, stats.imageClass);
    stats.started++;
    const counts = (stats.byCase[caseName] ||= { started: 0, completed: 0 });
    counts.started++;
    emit({
      sessionUpdate: "tool_call",
      toolCallId: id,
      title: spec.title,
      kind: spec.kind,
      status: "in_progress",
      rawInput: spec.rawInput,
      ...(spec.locations ? { locations: spec.locations } : {}),
      _meta: { poracodeTopLevelToolCall: true },
    });
    if (spec.delegated) {
      stats.childTools++;
      stats.childMessages++;
      const child = `${id}-read`;
      emit({
        sessionUpdate: "tool_call",
        toolCallId: child,
        title: "Read",
        kind: "read",
        status: "in_progress",
        rawInput: { file_path: "fixtures/sample.ts" },
        _meta: { poracodeParentToolCallId: id },
      });
      emit({
        sessionUpdate: "tool_call_update",
        toolCallId: child,
        status: "completed",
        rawOutput: "export const value = 1;",
      });
      emit({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `[rich-child-${n}] inspected fixture` },
        _meta: { poracodeParentToolCallId: id },
      });
      // Immediate closure avoids ambiguous inferred ownership of later prose.
      finish({ id, spec, caseName });
    } else pending.push({ id, spec, caseName, due: ticks + 6, progressDue: ticks + 2 });
  }
  function advancePending() {
    ticks++;
    for (let i = pending.length - 1; i >= 0; i--) {
      const call = pending[i];
      if (ticks >= call.due) {
        finish(call);
        pending.splice(i, 1);
      } else if (ticks === call.progressDue) {
        emit({
          sessionUpdate: "tool_call_update",
          toolCallId: call.id,
          status: "in_progress",
          rawOutput: { progress: "fixture operation in progress" },
        });
        stats.updates++;
      }
    }
    stats.pending = pending.length;
  }
  return {
    stats,
    tick(profileName, maxCalls = Infinity, imageClass = "standard") {
      stats.imageClass = imageClass;
      const profile = TOOL_PROFILES[profileName];
      if (!profile) throw Error(`Unknown rich tool profile: ${profileName}`);
      advancePending();
      if (ticks % profile.everyTicks === 0)
        for (let i = 0; i < profile.batch && index < maxCalls; i++)
          start(TOOL_CASES[index % TOOL_CASES.length], profile);
      stats.pending = pending.length;
    },
    drain() {
      if (pending.length > 0) advancePending();
    },
    cancel() {
      for (const call of pending) finish(call, true);
      pending.length = 0;
      stats.pending = 0;
    },
  };
}
