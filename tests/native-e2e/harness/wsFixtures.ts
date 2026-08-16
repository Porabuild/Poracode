import {
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
} from "../../../src/shared/remote/protocol.ts";
import { FIXTURE_PROJECT_ID, FIXTURE_TERMINAL_ID, FIXTURE_THREAD_ID } from "./labFixtures.ts";

export const CLIENT_WS_FIXTURES = {
  ping: { type: "ping", id: "ping-fixture-001", sentAt: 1_786_543_200_000 },
  "browser-watch": { type: "browser-watch" },
  "browser-unwatch": { type: "browser-unwatch" },
  "browser-input": { type: "browser-input", input: { kind: "tap", x: 12, y: 34 } },
  "terminal-watch": {
    type: "terminal-watch",
    id: FIXTURE_TERMINAL_ID,
    cursorSync: { version: 1, watchId: "watch-fixture-001" },
  },
  "terminal-unwatch": { type: "terminal-unwatch", id: FIXTURE_TERMINAL_ID },
  "git-state-interests": {
    type: "git-state-interests",
    interests: [{ kind: "target", projectId: FIXTURE_PROJECT_ID, includePrDetails: true }],
  },
  "thread-item-interests": { type: "thread-item-interests", threadIds: [FIXTURE_THREAD_ID] },
} as const;

export const BROWSER_SERVER_FIXTURES = [
  {
    type: "browser-state",
    state: {
      tabs: [
        {
          tabId: "browser-tab-fixture-001",
          url: "https://example.test/fixture",
          title: "Fixture tab",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ],
      activeTabId: "browser-tab-fixture-001",
    },
  },
  {
    type: "browser-mirror-status",
    status: { status: "active", tabId: "browser-tab-fixture-001" },
  },
  {
    type: "browser-frame",
    tabId: "browser-tab-fixture-001",
    data: "ZmFrZS1qcGVn",
    metadata: {
      deviceWidth: 390,
      deviceHeight: 844,
      pageScaleFactor: 1,
      offsetTop: 0,
      scrollOffsetX: 0,
      scrollOffsetY: 0,
    },
  },
] as const;

export function assertWebSocketFixtures(): void {
  for (const fixture of Object.values(CLIENT_WS_FIXTURES)) {
    remoteWebSocketClientMessageSchema.parse(fixture);
  }
  for (const fixture of BROWSER_SERVER_FIXTURES) {
    remoteWebSocketServerMessageSchema.parse(fixture);
  }
}

export function parseClientMessage(raw: string) {
  return remoteWebSocketClientMessageSchema.parse(JSON.parse(raw) as unknown);
}

export function parseServerMessage(message: Record<string, unknown>): Record<string, unknown> {
  return remoteWebSocketServerMessageSchema.parse(message) as Record<string, unknown>;
}
