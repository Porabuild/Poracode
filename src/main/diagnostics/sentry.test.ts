import Module from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SentryCore from "@sentry/core";
import type { NodeClient as SentryNodeClient } from "@sentry/node";

const electronMock = vi.hoisted(() => ({
  app: {
    whenReady: () => Promise.resolve(),
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
    (
      options: Record<string, unknown> & {
        beforeSend: (event: never, hint?: never) => unknown;
      },
    ) => void
  >(),
  setContext: vi.fn<(name: string, value: Record<string, unknown>) => void>(),
  makeElectronTransport: vi.fn<() => unknown>(),
}));

const originalDsn = process.env.SENTRY_DSN;
const originalDevOverride = process.env.SENTRY_ENABLE_DEV;
let directory: string;

let consentedSettingsPath: string;

let restoreTelemetryEnv: (() => void) | null = null;

beforeEach(() => {
  restoreTelemetryEnv = clearTelemetryEnv();
  mkdirSync("tmp", { recursive: true });
  directory = mkdtempSync(join(process.cwd(), "tmp", "sentry-main-"));
  electronMock.app.getPath.mockReturnValue(directory);
  consentedSettingsPath = join(directory, "settings.json");
  writeFileSync(
    consentedSettingsPath,
    JSON.stringify({
      privacy: { productAnalytics: false, crashReports: true, consentDecided: true },
    }),
  );
});

afterEach(() => {
  restoreTelemetryEnv?.();
  restoreTelemetryEnv = null;
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

// GitHub Actions (and other CI) export CI=true, which production code now
// treats as a telemetry hard-off. Tests that exercise Sentry initialization
// must control these variables explicitly instead of inheriting the runner's.
const TELEMETRY_ENV_KEYS = [
  "CI",
  "DO_NOT_TRACK",
  "PORACODE_TELEMETRY_ENABLED",
  "PORACODE_CRASH_REPORTS_ENABLED",
] as const;

function clearTelemetryEnv(): () => void {
  const saved = TELEMETRY_ENV_KEYS.map((key) => process.env[key]);
  for (const key of TELEMETRY_ENV_KEYS) delete process.env[key];
  return () => {
    TELEMETRY_ENV_KEYS.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  };
}

/** Stub only `@sentry/electron/main`; every other require stays real. */
function mockMainSentryLoad() {
  const moduleLoader = Module as unknown as {
    _load: (request: string, ...rest: unknown[]) => unknown;
  };
  const originalLoad = moduleLoader._load.bind(moduleLoader);
  return vi
    .spyOn(moduleLoader, "_load")
    .mockImplementation((request, ...rest) =>
      request === "@sentry/electron/main" ? sentryMock : originalLoad(request, ...rest),
    );
}

describe("main Sentry configuration", () => {
  it("cannot be enabled by a local development override", () => {
    process.env.SENTRY_DSN = "https://public@example.test/1";
    process.env.SENTRY_ENABLE_DEV = "1";

    const options = {
      appVersion: "test",
      isDev: true,
      channel: "stable" as const,
      settingsPath: consentedSettingsPath,
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
      expect(
        initializeMainSentry({
          appVersion: "test",
          isDev: false,
          channel: "nightly",
          settingsPath: consentedSettingsPath,
        }),
      ).toBe(false);

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

    const loadSpy = mockMainSentryLoad();

    try {
      expect(
        initializeMainSentry({
          appVersion: "test",
          isDev: false,
          channel: "stable",
          settingsPath: consentedSettingsPath,
        }),
      ).toBe(true);
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
        initializeMainSentry({
          appVersion: "test-next",
          isDev: false,
          channel: "stable",
          settingsPath: consentedSettingsPath,
        }),
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

  it("keeps only a native event.minidump attachment when both opt-ins are on", () => {
    process.env.SENTRY_DSN = "https://public@example.test/1";
    writeFileSync(
      consentedSettingsPath,
      JSON.stringify({
        privacy: {
          productAnalytics: false,
          crashReports: true,
          nativeCrashDumps: true,
          consentDecided: true,
        },
      }),
    );

    const loadSpy = mockMainSentryLoad();

    try {
      expect(
        initializeMainSentry({
          appVersion: "test",
          isDev: false,
          channel: "stable",
          settingsPath: consentedSettingsPath,
        }),
      ).toBe(true);
      const beforeSend = sentryMock.init.mock.calls.at(-1)?.[0].beforeSend as unknown as (
        event: Record<string, unknown>,
        hint: { attachments?: Array<Record<string, unknown>> },
      ) => Record<string, unknown> | null;
      const minidump = {
        attachmentType: "event.minidump",
        filename: "crash.dmp",
        data: Buffer.from("dump"),
      };
      const screenshot = {
        attachmentType: "event.attachment",
        filename: "screen.png",
        data: Buffer.from("png"),
      };

      const nativeHint = { attachments: [minidump, screenshot] };
      expect(
        beforeSend(
          { platform: "native", level: "fatal", message: "native crash" },
          nativeHint as never,
        ),
      ).not.toBeNull();
      expect(nativeHint.attachments).toEqual([minidump]);

      const javascriptHint = { attachments: [minidump] };
      expect(
        beforeSend({ platform: "javascript", message: "js failure" }, javascriptHint as never),
      ).not.toBeNull();
      expect(javascriptHint.attachments).toEqual([]);
    } finally {
      loadSpy.mockRestore();
    }
  });

  it("gates native dumps on their own live consent while sending the scrubbed summary", async () => {
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
    const minidumpLoadWaiters: Array<() => void> = [];
    const nextMinidumpLoad = (): Promise<void> =>
      new Promise<void>((resolve) => minidumpLoadWaiters.push(resolve));

    let settingsWriteCount = 0;
    function writeConsent(privacy: Record<string, unknown>): void {
      writeFileSync(consentedSettingsPath, JSON.stringify({ privacy }));
      // The live settings reader fingerprints file metadata. Nudge mtime so
      // successive writes in one test always invalidate the cache.
      const stamp = new Date(Date.now() + ++settingsWriteCount * 1000);
      utimesSync(consentedSettingsPath, stamp, stamp);
    }

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
            getSentryCachePath: () => join(directory, "sentry-sdk-test"),
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
                minidumpLoadCount += 1;
                const crashpadAnnotations =
                  minidumpLoadCount === 2
                    ? {
                        "electron.v8-oom.stack": "    #0 crash (app:///main.cjs:10:2)",
                        process_type: "renderer-process",
                      }
                    : { process_type: "renderer-process" };
                await callback(
                  { crashpadAnnotations },
                  {
                    attachmentType: "event.minidump",
                    filename: "renderer.dmp",
                    data: attachmentData,
                  },
                );
                minidumpLoadWaiters.shift()?.();
              },
          };
        }
        return originalLoad(request, ...rest);
      });

    let client: SentryNodeClient | undefined;
    const envelopes: unknown[] = [];
    const eventsAtBeforeSend: Array<Record<string, unknown>> = [];
    const eventsAfterBeforeSend: Array<Record<string, unknown>> = [];
    let injectSensitiveFields = true;

    function envelopeItems(start: number): Array<[Record<string, unknown>, unknown]> {
      return envelopes
        .slice(start)
        .flatMap(
          (envelope) => (envelope as [unknown, Array<[Record<string, unknown>, unknown]>])[1],
        );
    }

    function eventAndAttachments(start: number): {
      events: Array<[Record<string, unknown>, Record<string, unknown>]>;
      attachments: Array<[Record<string, unknown>, unknown]>;
    } {
      const items = envelopeItems(start);
      return {
        events: items.filter(
          (item): item is [Record<string, unknown>, Record<string, unknown>] =>
            item[0].type === "event",
        ),
        attachments: items.filter(([headers]) => headers.type === "attachment"),
      };
    }

    try {
      const initialLoad = nextMinidumpLoad();
      expect(
        initializeMainSentry({
          appVersion: "test",
          isDev: false,
          channel: "stable",
          settingsPath: consentedSettingsPath,
        }),
      ).toBe(true);
      const sentryOptions = sentryMock.init.mock.calls.at(-1)?.[0];
      expect(sentryOptions).toBeDefined();
      // Release-health sessions and client reports bypass beforeSend, and the
      // default offline transport replays queued envelopes at startup; all
      // three must stay off so the consent gate is the only egress control.
      expect(sentryOptions!.sendClientReports).toBe(false);
      expect(sentryOptions!.transport).toBe(sentryMock.makeElectronTransport);
      const filteredIntegrations = (
        sentryOptions!.integrations as (
          integrations: Array<{ name: string }>,
        ) => Array<{ name: string }>
      )([
        { name: "MainProcessSession" },
        { name: "BrowserWindowSession" },
        { name: "SentryMinidump" },
      ]);
      expect(filteredIntegrations.map((integration) => integration.name)).toEqual([
        "SentryMinidump",
      ]);
      expect(sentryOptions!.dataCollection).toMatchObject({
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
      });
      const beforeSend = sentryOptions!.beforeSend as (
        event: never,
        hint?: never,
      ) => Record<string, unknown> | null;
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
        beforeSend(
          event: Record<string, unknown>,
          hint?: { attachments?: Array<{ attachmentType?: string }> },
        ) {
          eventsAtBeforeSend.push(event);
          if (injectSensitiveFields) {
            injectSensitiveFields = false;
            // Simulate a provider payload carrying fields the scrubber must
            // remove before the envelope leaves the process.
            event.user = { id: "user-123", email: "person@example.test" };
            event.request = { url: "https://secret.example/path" };
            event.extra = { token: "secret" };
            event.message = "Crash at /Users/alice/private/file.ts token=abc123";
            event.tags = {
              ...(event.tags as Record<string, unknown> | undefined),
              "poracode.branch": "feature/secret",
              "poracode.feature_area": "native",
            };
          }
          const prepared = beforeSend(event as never, hint as never);
          if (prepared) eventsAfterBeforeSend.push(prepared);
          return prepared;
        },
      };
      const sentryCore = electronRequire("@sentry/core") as typeof SentryCore;
      const { NodeClient } = electronRequire("@sentry/node");
      const sentryClient = new NodeClient(clientOptions) as SentryNodeClient;
      client = sentryClient;
      sentryClient.init();
      await sentryCore.withScope(async (scope) => {
        scope.update(sentryOptions!.initialScope as Parameters<typeof scope.update>[0]);
        scope.setClient(sentryClient);

        minidumpIntegration!.setup(sentryClient);
        await initialLoad;
        expect(await sentryClient.flush(2000)).toBe(true);

        // Legacy privacy shape: crash reports on, no native-dump field. The
        // scrubbed summary is sent and the unconsented minidump is dropped.
        expect(minidumpLoadCount).toBe(1);
        expect(envelopes).toHaveLength(1);
        const legacy = eventAndAttachments(0);
        expect(legacy.events).toHaveLength(1);
        expect(legacy.attachments).toHaveLength(0);
        const legacyEvent = legacy.events[0]![1];
        expect(eventsAtBeforeSend[0]).toHaveProperty("user");
        expect(eventsAtBeforeSend[0]).toHaveProperty("request");
        expect(eventsAtBeforeSend[0]).toHaveProperty("extra");
        expect(legacyEvent).toMatchObject({
          platform: "native",
          level: "fatal",
          message: "Crash at [path] token=[redacted]",
          tags: {
            "event.environment": "native",
            "event.process": "renderer",
            "poracode.app_version": "test",
            "poracode.feature_area": "native",
          },
        });
        expect(legacyEvent).not.toHaveProperty("user");
        expect(legacyEvent).not.toHaveProperty("request");
        expect(legacyEvent).not.toHaveProperty("extra");
        expect(legacyEvent.tags).not.toHaveProperty("poracode.branch");

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

        // Separate explicit opt-in: the same native event ships with the
        // byte-identical minidump attachment.
        writeConsent({
          productAnalytics: false,
          crashReports: true,
          nativeCrashDumps: true,
          consentDecided: true,
        });
        let start = envelopes.length;
        let load = nextMinidumpLoad();
        await rendererCrashHandler!({}, { id: 42 }, { reason: "oom" });
        await load;
        expect(await sentryClient.flush(2000)).toBe(true);
        const dumped = eventAndAttachments(start);
        expect(dumped.events).toHaveLength(1);
        expect(dumped.attachments).toHaveLength(1);
        expect(dumped.events[0]![1]).toMatchObject({
          platform: "native",
          exception: {
            values: [{ type: "OutOfMemoryError", value: "Renderer reached heap limit" }],
          },
          fingerprint: ["poracode-native-crash", process.platform, "out-of-memory"],
          tags: { "event.environment": "native" },
        });
        expect(dumped.attachments[0]![0]).toMatchObject({
          type: "attachment",
          filename: "renderer.dmp",
          attachment_type: "event.minidump",
        });
        expect(Buffer.from(dumped.attachments[0]![1] as Uint8Array)).toEqual(attachmentData);

        // Live revocation: the next event keeps the scrubbed summary but no
        // longer carries the memory snapshot.
        writeConsent({
          productAnalytics: false,
          crashReports: true,
          nativeCrashDumps: false,
          consentDecided: true,
        });
        start = envelopes.length;
        load = nextMinidumpLoad();
        await rendererCrashHandler!({}, { id: 43 }, { reason: "oom" });
        await load;
        expect(await sentryClient.flush(2000)).toBe(true);
        const revoked = eventAndAttachments(start);
        expect(revoked.events).toHaveLength(1);
        expect(revoked.attachments).toHaveLength(0);
        expect(revoked.events[0]![1]).toMatchObject({
          platform: "native",
          level: "fatal",
          tags: { "event.environment": "native" },
        });

        // General crash-report opt-out: nothing leaves, even though the
        // native integration still produced an event and an attachment.
        writeConsent({
          productAnalytics: false,
          crashReports: false,
          nativeCrashDumps: false,
          consentDecided: true,
        });
        start = envelopes.length;
        load = nextMinidumpLoad();
        await rendererCrashHandler!({}, { id: 44 }, { reason: "oom" });
        await load;
        expect(await sentryClient.flush(2000)).toBe(true);
        expect(envelopes).toHaveLength(start);
        expect(eventsAfterBeforeSend).toHaveLength(3);
        expect(eventsAtBeforeSend).toHaveLength(4);
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
