import { describe, expect, it } from "vitest";

import type { AcpExtensionRequestContext } from "../../base/types";
import {
  createDevinDiagnosticsRequestHandler,
  DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD,
} from "./diagnostics";

/** Handler context mirroring the shared ACP lifecycle (`sessionExtensionRequests`). */
function handlerCtx(options?: {
  sessionId?: string | undefined;
  signal?: AbortSignal;
}): AcpExtensionRequestContext {
  return {
    threadId: "thread-1",
    sessionId: options && "sessionId" in options ? options.sessionId : "session-1",
    signal: options?.signal ?? new AbortController().signal,
  };
}

type SnapshotLike = {
  documents: ReadonlyArray<{
    uri: string;
    languageId: string;
    diagnostics: ReadonlyArray<{
      message: string;
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
      severity?: 1 | 2 | 3 | 4;
      source?: string;
      code?: string | number;
    }>;
  }>;
  truncated: boolean;
};

function snapshotWith(documents: SnapshotLike["documents"], truncated = false): SnapshotLike {
  return { documents, truncated };
}

function diagnosticWith(overrides?: {
  message?: string;
  line?: number;
  character?: number;
  severity?: 1 | 2 | 3 | 4;
  source?: string;
  code?: string | number;
}) {
  const line = overrides?.line ?? 4;
  const character = overrides?.character ?? 0;
  return {
    message: overrides?.message ?? "Type 'number' is not assignable to type 'string'.",
    range: {
      start: { line, character },
      end: { line, character: character + 6 },
    },
    ...(overrides?.severity === undefined ? {} : { severity: overrides.severity }),
    ...(overrides?.source === undefined ? {} : { source: overrides.source }),
    ...(overrides?.code === undefined ? {} : { code: overrides.code }),
  };
}

function typescriptSnapshot(): SnapshotLike {
  return snapshotWith([
    {
      uri: "file:///proj/src/e7-err.ts",
      languageId: "typescript",
      diagnostics: [
        diagnosticWith({ severity: 1, source: "ts", code: 2322 }),
        diagnosticWith({
          message: "Unused import.",
          line: 9,
          character: 2,
          severity: 2,
          source: "eslint",
        }),
      ],
    },
  ]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const item of Array.isArray(value) ? value : Object.values(value as object)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}

describe("Devin _cognition.ai/request_diagnostics handler (E7-qualified result)", () => {
  it("serves a real diagnostics pull with the six required string fields", async () => {
    const pulls: AbortSignal[] = [];
    const handler = createDevinDiagnosticsRequestHandler(async (signal) => {
      pulls.push(signal);
      return typescriptSnapshot() as never;
    });
    const outcome = await handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx());
    expect(pulls).toHaveLength(1);
    expect(outcome).toEqual({
      handled: true,
      result: {
        items: [
          {
            id: expect.any(String),
            uri: "file:///proj/src/e7-err.ts",
            message: "Type 'number' is not assignable to type 'string'.",
            range: {
              start: { line: 4, character: 0 },
              end: { line: 4, character: 6 },
            },
            severity: "error",
            source: "ts",
          },
          {
            id: expect.any(String),
            uri: "file:///proj/src/e7-err.ts",
            message: "Unused import.",
            range: { start: { line: 9, character: 2 }, end: { line: 9, character: 8 } },
            severity: "warning",
            source: "eslint",
          },
        ],
        truncated: false,
      },
    });
    const items = (outcome as { handled: true; result: { items: Array<Record<string, unknown>> } })
      .result.items;
    for (const item of items) {
      // Earned declaration order (E7): id, uri, message, range, severity, source.
      expect(Object.keys(item)).toEqual(["id", "uri", "message", "range", "severity", "source"]);
    }
  });

  it("accepts the native empty-params request with no sessionId field", async () => {
    const handler = createDevinDiagnosticsRequestHandler(async () => snapshotWith([]) as never);
    await expect(
      handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx()),
    ).resolves.toBeTruthy();
  });

  it("declines other methods without touching the host source", async () => {
    let pulls = 0;
    const handler = createDevinDiagnosticsRequestHandler(async () => {
      pulls += 1;
      return undefined;
    });
    await expect(handler("_cognition.ai/wiki/status", {}, handlerCtx())).resolves.toEqual({
      handled: false,
    });
    expect(pulls).toBe(0);
  });

  it("rejects malformed params with typed invalid-params and no host pull", async () => {
    let pulls = 0;
    const handler = createDevinDiagnosticsRequestHandler(async () => {
      pulls += 1;
      return undefined;
    });
    for (const params of [{ unexpected: true }, { sessionId: "session-1" }, [1, 2]]) {
      await expect(
        handler(
          DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD,
          params as Record<string, unknown>,
          handlerCtx(),
        ),
      ).rejects.toMatchObject({ name: "AcpExtensionRequestError", code: -32602 });
    }
    expect(pulls).toBe(0);
  });

  it("requires a current session id before gathering", async () => {
    let pulls = 0;
    const handler = createDevinDiagnosticsRequestHandler(async () => {
      pulls += 1;
      return snapshotWith([]) as never;
    });
    await expect(
      handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx({ sessionId: undefined })),
    ).rejects.toMatchObject({ name: "AcpExtensionRequestError", code: -32602 });
    expect(pulls).toBe(0);
  });

  it("declines an unavailable host source to the honest unhandled fallthrough", async () => {
    const handler = createDevinDiagnosticsRequestHandler(async () => undefined);
    await expect(handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx())).resolves.toEqual({
      handled: false,
    });
  });

  it("serves a legitimate empty answer only from an actually ready source", async () => {
    const handler = createDevinDiagnosticsRequestHandler(async () => snapshotWith([]) as never);
    await expect(handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx())).resolves.toEqual({
      handled: true,
      result: { items: [], truncated: false },
    });
  });

  it("never surfaces a snapshot gathered after a late abort", async () => {
    const controller = new AbortController();
    const handler = createDevinDiagnosticsRequestHandler(async () => {
      // The shared lifecycle cancels exactly once; a late host answer must be
      // dropped by the handler itself.
      controller.abort();
      return typescriptSnapshot() as never;
    });
    await expect(
      handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx({ signal: controller.signal })),
    ).resolves.toEqual({ handled: false });
  });

  it("skips the host gather entirely for an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    let pulls = 0;
    const handler = createDevinDiagnosticsRequestHandler(async () => {
      pulls += 1;
      return snapshotWith([]) as never;
    });
    await expect(
      handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx({ signal: controller.signal })),
    ).resolves.toEqual({ handled: false });
    expect(pulls).toBe(0);
  });

  it("falls back to the document languageId when the host omits source", async () => {
    const handler = createDevinDiagnosticsRequestHandler(
      async () =>
        snapshotWith([
          {
            uri: "file:///proj/src/a.py",
            languageId: "python",
            diagnostics: [diagnosticWith({ severity: 3 })],
          },
        ]) as never,
    );
    const outcome = (await handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx())) as {
      handled: true;
      result: { items: Array<{ severity: string; source: string }> };
    };
    expect(outcome.result.items[0]).toMatchObject({ severity: "info", source: "python" });
  });

  it("keeps an unclassified diagnostic informational and maps 1-4 to wire strings", async () => {
    const severities: Array<1 | 2 | 3 | 4 | undefined> = [1, 2, 3, 4, undefined];
    const handler = createDevinDiagnosticsRequestHandler(
      async () =>
        snapshotWith([
          {
            uri: "file:///proj/a.md",
            languageId: "markdown",
            diagnostics: severities.map((severity, index) =>
              diagnosticWith({
                message: `m${index}`,
                ...(severity === undefined ? {} : { severity }),
              }),
            ),
          },
        ]) as never,
    );
    const outcome = (await handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx())) as {
      handled: true;
      result: { items: Array<{ severity: string }> };
    };
    expect(outcome.result.items.map((item) => item.severity)).toEqual([
      "error",
      "warning",
      "info",
      "hint",
      "info",
    ]);
  });

  it("synthesizes stable ids and deterministic occurrence suffixes for duplicates", async () => {
    const snapshot = typescriptSnapshot();
    const handler = createDevinDiagnosticsRequestHandler(async () => snapshot as never);
    const first = (await handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx())) as {
      handled: true;
      result: { items: Array<{ id: string }> };
    };
    const second = (await handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx())) as {
      handled: true;
      result: { items: Array<{ id: string }> };
    };
    expect(first.result.items.map((item) => item.id)).toEqual(
      second.result.items.map((item) => item.id),
    );
    expect(first.result.items[0]!.id).toMatch(/^diag-v1-[0-9a-f]{64}$/);
    // Host `code` is not a native wire field but participates in the id.
    expect(first.result.items[0]!.id).not.toBe(first.result.items[1]!.id);
  });

  it("disambiguates duplicate diagnostics with deterministic -N suffixes", async () => {
    const duplicate = diagnosticWith({ message: "same", severity: 1, source: "ts" });
    const handler = createDevinDiagnosticsRequestHandler(
      async () =>
        snapshotWith([
          {
            uri: "file:///proj/dup.ts",
            languageId: "typescript",
            diagnostics: [duplicate, { ...duplicate }, { ...duplicate }],
          },
        ]) as never,
    );
    const outcome = (await handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx())) as {
      handled: true;
      result: { items: Array<{ id: string }> };
    };
    expect(outcome.result.items.map((item) => item.id)).toEqual([
      expect.stringMatching(/^diag-v1-[0-9a-f]{64}$/),
      expect.stringMatching(/^diag-v1-[0-9a-f]{64}-2$/),
      expect.stringMatching(/^diag-v1-[0-9a-f]{64}-3$/),
    ]);
  });

  it("passes the host truncation flag through", async () => {
    const handler = createDevinDiagnosticsRequestHandler(
      async () => snapshotWith([], true) as never,
    );
    await expect(handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx())).resolves.toEqual({
      handled: true,
      result: { items: [], truncated: true },
    });
  });

  it("fails visibly on invalid host ranges instead of fabricating data", async () => {
    for (const line of [-1, 0.5, 4294967296]) {
      const handler = createDevinDiagnosticsRequestHandler(
        async () =>
          snapshotWith([
            {
              uri: "file:///proj/bad.ts",
              languageId: "typescript",
              diagnostics: [diagnosticWith({ line })],
            },
          ]) as never,
      );
      await expect(
        handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx()),
      ).rejects.toMatchObject({ name: "AcpExtensionRequestError", code: -32603 });
    }
    for (const character of [-3, 1.5]) {
      const handler = createDevinDiagnosticsRequestHandler(
        async () =>
          snapshotWith([
            {
              uri: "file:///proj/bad.ts",
              languageId: "typescript",
              diagnostics: [diagnosticWith({ character })],
            },
          ]) as never,
      );
      await expect(
        handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx()),
      ).rejects.toMatchObject({ name: "AcpExtensionRequestError", code: -32603 });
    }
  });

  it("fails visibly on malformed host snapshots", async () => {
    const malformed: unknown[] = [
      null,
      {},
      { documents: "nope", truncated: false },
      { documents: [], truncated: "yes" },
      {
        documents: [
          {
            uri: "",
            languageId: "typescript",
            diagnostics: [],
          },
        ],
        truncated: false,
      },
      {
        documents: [
          {
            uri: "file:///proj/x.ts",
            languageId: "typescript",
            diagnostics: [{ message: 7, range: diagnosticWith().range }],
          },
        ],
        truncated: false,
      },
      {
        documents: [
          {
            uri: "file:///proj/x.ts",
            languageId: "typescript",
            diagnostics: [diagnosticWith({ severity: 5 as 1 | 2 | 3 | 4 })],
          },
        ],
        truncated: false,
      },
    ];
    for (const snapshot of malformed) {
      const handler = createDevinDiagnosticsRequestHandler(async () => snapshot as never);
      await expect(
        handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx()),
      ).rejects.toMatchObject({ name: "AcpExtensionRequestError", code: -32603 });
    }
  });

  it("fails visibly instead of returning an oversized result", async () => {
    const flood = Array.from({ length: 4000 }, () => diagnosticWith());
    const handler = createDevinDiagnosticsRequestHandler(
      async () =>
        snapshotWith([
          { uri: "file:///proj/flood.ts", languageId: "typescript", diagnostics: flood },
        ]) as never,
    );
    await expect(
      handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx()),
    ).rejects.toMatchObject({
      name: "AcpExtensionRequestError",
      code: -32603,
      message: expect.stringContaining("JSON bounds"),
    });
  });

  it("maps read-only over a detached snapshot without mutating the input", async () => {
    const snapshot = deepFreeze(typescriptSnapshot());
    const before = JSON.parse(JSON.stringify(snapshot)) as SnapshotLike;
    const handler = createDevinDiagnosticsRequestHandler(async () => snapshot as never);
    await expect(
      handler(DEVIN_ACP_REQUEST_DIAGNOSTICS_METHOD, {}, handlerCtx()),
    ).resolves.toBeTruthy();
    expect(snapshot).toEqual(before);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
