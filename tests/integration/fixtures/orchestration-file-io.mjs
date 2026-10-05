import { randomUUID } from "node:crypto";
import { resolve as resolvePath } from "node:path";

/** These cards describe actual ACP filesystem replies, never scripted file contents. */
export async function runFixtureFileIo(operations, context) {
  const checks = [],
    evidence = [];
  for (const [index, operation] of (operations ?? []).entries()) {
    if (context.state.cancelled) break;
    const method = operation.kind === "write" ? "fs/write_text_file" : "fs/read_text_file";
    const path = resolvePath(process.cwd(), operation.path),
      id = `fs-${randomUUID()}`;
    const params = {
      sessionId: context.sessionId,
      path,
      ...(operation.kind === "write" ? { content: operation.content } : {}),
      ...(operation.line === undefined ? {} : { line: operation.line }),
      ...(operation.limit === undefined ? {} : { limit: operation.limit }),
    };
    await context.update({
      sessionUpdate: "tool_call",
      toolCallId: `fs-${index}`,
      title: `${operation.kind} ${operation.path}`,
      kind: operation.kind === "write" ? "edit" : "read",
      status: "in_progress",
      rawInput: params,
    });
    const response = new Promise((resolve) => context.requests.set(id, resolve));
    let timer;
    let reply;
    try {
      await context.send({ jsonrpc: "2.0", id, method, params });
      reply = await Promise.race([
        response,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error("Owned filesystem response deadline")), 10000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      context.requests.delete(id);
    }
    if (context.state.cancelled) break;
    const passed =
      !reply?.fixtureRpcError &&
      (operation.kind === "write"
        ? reply && typeof reply === "object"
        : reply?.content === operation.expectedContent);
    const actual = {
      method,
      path,
      passed: !!passed,
      ...(reply?.fixtureRpcError
        ? { error: reply.fixtureRpcError }
        : operation.kind === "read"
          ? { content: reply?.content }
          : { response: reply }),
    };
    context.trace("filesystem-reply", actual);
    await context.update({
      sessionUpdate: "tool_call_update",
      toolCallId: `fs-${index}`,
      status: passed ? "completed" : "failed",
      rawOutput: actual,
      ...(operation.kind === "read" && typeof reply?.content === "string"
        ? { content: [{ type: "content", content: { type: "text", text: reply.content } }] }
        : {}),
    });
    checks.push({ command: `${method} ${operation.path}`, result: passed ? "passed" : "failed" });
    evidence.push(JSON.stringify(actual));
  }
  return { checks, evidence };
}
