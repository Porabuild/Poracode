import Module from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SentryCore from "@sentry/core";
import type { NodeClient as SentryNodeClient } from "@sentry/node";

const electronMock = vi.hoisted(() => ({
  app: {
    getAppPath: () => ".",
    getName: () => "Poracode",
    getPath: vi.fn<() => string>(),
    isPackaged: false,
    name: "Poracode",
    on: vi.fn<(eventName: string, listener: unknown) => void>(),
  },
  crashReporter: { start: vi.fn<(options: Record<string, unknown>) => void>() },
}));

vi.mock("electron", () => electronMock);

import { captureMainException, initializeMainSentry, isSentryConfigured } from "./sentry";

const sentryMock = vi.hoisted(() => ({
  init: vi.fn<
    (options: Record<string, unknown> & { beforeSend: (event: never) => unknown }) => void
  >(),
  setContext: vi.fn<(name: string, value: Record<string, unknown>) => void>(),
}));

const originalDsn = process.env.SENTRY_DSN;
const originalDevOverride = process.env.SENTRY_ENABLE_DEV;
let directory: string;

beforeEach(() => {
  mkdirSync("tmp", { recursive: true });
  directory = mkdtempSync(join(process.cwd(), "tmp", "sentry-main-"));
  electronMock.app.getPath.mockReturnValue(directory);
});

afterEach(() => {
  if (originalDsn === undefined) {
    delete process.env.SENTRY_DSN;
  } else {
    process.env.SENTRY_DSN = originalDsn;
  }
  if (originalDevOverride === undefined) {
    delete process.env.SENTRY_ENABLE_DEV;
  } else {
    process.env.SENTRY_ENABLE_DEV = originalDevOverride;
  }
  sentryMock.init.mockReset();
  sentryMock.setContext.mockReset();
  electronMock.app.on.mockClear();
  electronMock.crashReporter.start.mockClear();
  rmSync(directory, { recursive: true, force: true });
});

describe("main Sentry configuration", () => {
  it("cannot be enabled by a local development override", () => {
    process.env.SENTRY_DSN = "https://public@example.test/1";
    process.env.SENTRY_ENABLE_DEV = "1";

    const options = {
      appVersion: "test",
      isDev: true,
      channel: "stable" as const,
    };
    expect(isSentryConfigured(options)).toBe(false);
    expect(initializeMainSentry(options)).toBe(false);
  });
});

describe("captureMainException", () => {
  it("does not load the Sentry SDK when main Sentry was never initialized", () => {
    // Loading @sentry/electron/main is ~100ms of synchronous main-thread work;
    // a disabled reporter must not pay it on the first captured error.
    const moduleLoader = Module as unknown as {
      _load: (request: string, ...rest: unknown[]) => unknown;
    };
    const loadSpy = vi.spyOn(moduleLoader, "_load");
    try {
      process.env.SENTRY_DSN = " ";
      expect(initializeMainSentry({ appVersion: "test", isDev: false, channel: "nightly" })).toBe(
        false,
      );

      captureMainException(new Error("updater failed"), { "poracode.feature_area": "update" });

      const requests = loadSpy.mock.calls.map(([request]) => request);
      expect(requests.some((request) => request.startsWith("@sentry/"))).toBe(false);
    } finally {
      loadSpy.mockRestore();
    }
  });
});

describe("main Sentry event admission", () => {
  it("applies the limiter from the configured beforeSend callback", () => {
    sentryMock.init.mockReset();
    sentryMock.setContext.mockReset();
    process.env.SENTRY_DSN = "https://public@example.test/1";

    const moduleLoader = Module as unknown as {
      _load: (request: string, ...rest: unknown[]) => unknown;
    };
    const originalLoad = moduleLoader._load.bind(moduleLoader);
    const loadSpy = vi
      .spyOn(moduleLoader, "_load")
      .mockImplementation((request, ...rest) =>
        request === "@sentry/electron/main" ? sentryMock : originalLoad(request, ...rest),
      );

    try {
      expect(initializeMainSentry({ appVersion: "test", isDev: false, channel: "stable" })).toBe(
        true,
      );
      const beforeSend = sentryMock.init.mock.calls[0]?.[0].beforeSend;
      expect(beforeSend).toBeDefined();
      const event = {
        exception: {
          values: [
            {
              type: "Error",
              value: "poll failed",
              stacktrace: {
                frames: [{ function: "pollProject", filename: "/app/main.cjs", lineno: 12 }],
              },
            },
          ],
        },
      };

      expect(beforeSend!(event as never)).not.toBeNull();
      expect(beforeSend!(event as never)).not.toBeNull();
      expect(beforeSend!(event as never)).not.toBeNull();
      expect(beforeSend!(event as never)).toBeNull();
      expect(
        initializeMainSentry({ appVersion: "test-next", isDev: false, channel: "stable" }),
      ).toBe(true);
      const restarted = sentryMock.init.mock.calls.at(-1)?.[0].beforeSend;
      expect(restarted!(event as never)).toBeNull();
      const ledger = JSON.parse(
        readFileSync(join(directory, "sentry", "event-budget.json"), "utf8"),
      );
      expect(ledger.processEvents).toHaveLength(3);
    } finally {
      loadSpy.mockRestore();
    }
  });

  it("passes the default native minidump event and attachment through the Sentry client", async () => {
    process.env.SENTRY_DSN = "https://public@example.test/1";

    const moduleLoader = Module as unknown as {
      _load: (request: string, ...rest: unknown[]) => unknown;
    };
    const originalLoad = moduleLoader._load.bind(moduleLoader);
    const testRequire = Module.createRequire(import.meta.url);
    const electronRequire = Module.createRequire(testRequire.resolve("@sentry/electron/main"));
    const minidumpIntegrationPath = electronRequire.resolve(
      "./integrations/sentry-minidump/index.js",
    );
    const attachmentData = Buffer.from("test minidump attachment");
    let minidumpLoadCount = 0;
    let resolveInitialMinidumpLoad!: () => void;
    let resolveRendererMinidumpLoad!: () => void;
    const initialMinidumpLoaded = new Promise<void>((resolve) => {
      resolveInitialMinidumpLoad = resolve;
    });
    const rendererMinidumpLoaded = new Promise<void>((resolve) => {
      resolveRendererMinidumpLoad = resolve;
    });
    const sentryRequireSpy = vi
      .spyOn(moduleLoader, "_load")
      .mockImplementation((request, ...rest) => {
        if (request === "@sentry/electron/main") return sentryMock;
        if (request === "electron") return electronMock;
        const parent = rest[0] as { filename?: string } | undefined;
        if (request.endsWith("electron-normalize.js")) {
          return {
            CRASH_REASONS: ["crashed", "oom"],
            EXIT_REASONS: ["clean-exit", "abnormal-exit", "killed", "crashed", "oom"],
            getSentryCachePath: () => ".tmp/sentry-sdk-test",
          };
        }
        if (request === "./minidump-loader.js" && parent?.filename === minidumpIntegrationPath) {
          return {
            getMinidumpLoader:
              () =>
              async (
                _deleteAll: boolean,
                callback: (result: unknown, attachment: unknown) => Promise<void>,
              ) => {
                const loadIndex = minidumpLoadCount++;
                await callback(
                  {
                    crashpadAnnotations:
                      loadIndex === 0
                        ? { process_type: "renderer-process" }
                        : {
                            "electron.v8-oom.stack": "    #0 crash (app:///main.cjs:10:2)",
                            process_type: "renderer-process",
                          },
                  },
                  {
                    attachmentType: "event.minidump",
                    filename: "renderer.dmp",
                    data: attachmentData,
                  },
                );
                if (loadIndex === 0) resolveInitialMinidumpLoad();
                else resolveRendererMinidumpLoad();
              },
          };
        }
        return originalLoad(request, ...rest);
      });

    let client: SentryNodeClient | undefined;
    const envelopes: unknown[] = [];
    const eventsAtBeforeSend: Array<Record<string, unknown>> = [];
    const eventsAfterBeforeSend: Array<Record<string, unknown>> = [];

    try {
      expect(initializeMainSentry({ appVersion: "test", isDev: false, channel: "stable" })).toBe(
        true,
      );
      const sentryOptions = sentryMock.init.mock.calls.at(-1)?.[0];
      expect(sentryOptions).toBeDefined();
      const beforeSend = sentryOptions!.beforeSend;
      const minidumpFactory = electronRequire(
        "./integrations/sentry-minidump/index.js",
      ).sentryMinidumpIntegration;
      const minidumpIntegration = (
        sentryOptions!.integrations as (
          integrations: Array<{ name: string; setup: (client: unknown) => void }>,
        ) => Array<{ name: string; setup: (client: unknown) => void }>
      )([minidumpFactory()]).find((integration) => integration.name === "SentryMinidump");
      expect(minidumpIntegration).toBeDefined();
      const clientOptions = {
        dsn: sentryOptions!.dsn,
        environment: sentryOptions!.environment,
        initialScope: sentryOptions!.initialScope,
        integrations: [],
        release: sentryOptions!.release,
        transport: () => ({
          send: (envelope: unknown) => {
            envelopes.push(envelope);
            return Promise.resolve({ statusCode: 200 });
          },
          flush: () => Promise.resolve(true),
        }),
        beforeSend(event: Record<string, unknown>) {
          eventsAtBeforeSend.push(event);
          const prepared = beforeSend(event as never) as Record<string, unknown> | null;
          if (prepared) eventsAfterBeforeSend.push(prepared);
          return prepared;
        },
      };
      const sentryCore = electronRequire("@sentry/core") as typeof SentryCore;
      const { NodeClient } = electronRequire("@sentry/node");
      const sentryClient = new NodeClient(clientOptions) as SentryNodeClient;
      client = sentryClient;
      await sentryCore.withScope(async (scope) => {
        scope.update(sentryOptions!.initialScope as Parameters<typeof scope.update>[0]);
        scope.setClient(sentryClient);
        sentryClient.init();

        minidumpIntegration!.setup(sentryClient);
        await initialMinidumpLoaded;
        expect(await sentryClient.flush(2000)).toBe(true);

        const rendererCrashHandler = electronMock.app.on.mock.calls.find(
          ([eventName]) => eventName === "render-process-gone",
        )?.[1] as
          | ((
              event: unknown,
              contents: { id: number },
              details: { reason: string },
            ) => Promise<void>)
          | undefined;
        expect(rendererCrashHandler).toBeDefined();
        await rendererCrashHandler!({}, { id: 42 }, { reason: "oom" });
        await rendererMinidumpLoaded;
        expect(await sentryClient.flush(2000)).toBe(true);

        expect(eventsAtBeforeSend).toHaveLength(2);
        const event = eventsAtBeforeSend[1]!;
        expect(event).toMatchObject({
          level: "fatal",
          platform: "native",
          tags: {
            "event.environment": "native",
            "event.process": "renderer",
            "poracode.app_version": "test",
          },
          exception: {
            values: [{ type: "OutOfMemoryError", value: "Renderer reached heap limit" }],
          },
        });
        expect(eventsAfterBeforeSend[1]).toMatchObject({
          level: "fatal",
          platform: "native",
          tags: {
            "event.environment": "native",
            "event.process": "renderer",
            "poracode.app_version": "test",
          },
          fingerprint: ["poracode-native-crash", process.platform, "out-of-memory"],
        });

        const sentItems = envelopes.map(
          (envelope) => (envelope as [unknown, Array<[Record<string, unknown>, unknown]>])[1],
        );
        const allItems = sentItems.flatMap((items) => items);
        const sentEvents = allItems.filter(([headers]) => headers.type === "event");
        const sentAttachments = allItems.filter(([headers]) => headers.type === "attachment");
        expect(sentEvents).toHaveLength(2);
        expect(sentEvents[1]![1]).toMatchObject({
          level: eventsAfterBeforeSend[1]!.level,
          platform: eventsAfterBeforeSend[1]!.platform,
          tags: eventsAfterBeforeSend[1]!.tags,
          fingerprint: eventsAfterBeforeSend[1]!.fingerprint,
        });
        expect(sentAttachments).toHaveLength(2);
        for (const attachment of sentAttachments) {
          expect(attachment[0]).toMatchObject({
            type: "attachment",
            filename: "renderer.dmp",
            attachment_type: "event.minidump",
          });
          expect(Buffer.from(attachment[1] as Uint8Array)).toEqual(attachmentData);
        }
      });
      expect(electronMock.crashReporter.start).toHaveBeenCalledWith(
        expect.objectContaining({ uploadToServer: false }),
      );
    } finally {
      if (client) await client.close(2000);
      sentryRequireSpy.mockRestore();
    }
  });
});
