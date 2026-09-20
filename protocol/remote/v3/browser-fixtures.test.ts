import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  remoteBrowserCommandSchema,
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
} from "../../../src/shared/remote/protocol";
import { REMOTE_CONTRACT_REGISTRY } from "../../../src/shared/remote/contract/registry";

const contractDirectory = dirname(fileURLToPath(import.meta.url));

interface FixtureCase {
  readonly id: string;
  readonly message?: unknown;
  readonly request?: unknown;
}

interface BrowserFixture {
  readonly http: {
    readonly stateResponse: unknown;
    readonly commands: readonly FixtureCase[];
  };
  readonly webSocket: {
    readonly client: readonly FixtureCase[];
    readonly server: readonly FixtureCase[];
  };
  readonly coordinateMapping: readonly CoordinateCase[];
}

interface CoordinateCase {
  readonly id: string;
  readonly image: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  readonly device: { readonly width: number; readonly height: number };
  readonly point: { readonly x: number; readonly y: number };
  readonly expectedPagePoint: { readonly x: number; readonly y: number } | null;
}

function fixture(): BrowserFixture {
  return JSON.parse(
    readFileSync(join(contractDirectory, "fixtures/browser-mirror.json"), "utf8"),
  ) as BrowserFixture;
}

function route(id: "browser-state" | "browser-command") {
  const result = REMOTE_CONTRACT_REGISTRY.routes.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Missing authoritative route ${id}`);
  return result;
}

function mapPagePoint(value: CoordinateCase): { x: number; y: number } | null {
  const { image, device, point } = value;
  if (image.width <= 0 || image.height <= 0 || device.width <= 0 || device.height <= 0) {
    return null;
  }
  const scale = Math.min(image.width / device.width, image.height / device.height);
  const contentLeft = image.left + (image.width - device.width * scale) / 2;
  const contentTop = image.top + (image.height - device.height * scale) / 2;
  const x = (point.x - contentLeft) / scale;
  const y = (point.y - contentTop) / scale;
  if (x < 0 || y < 0 || x > device.width || y > device.height) return null;
  return { x, y };
}

describe("remote v3 authoritative browser-mirror fixtures", () => {
  it("freezes both HTTP route contracts and every command variant", () => {
    const value = fixture();
    const stateRoute = route("browser-state");
    const commandRoute = route("browser-command");

    expect({
      method: stateRoute.method,
      path: stateRoute.path,
      scopes: stateRoute.scopes,
      bodyKind: stateRoute.request.bodyKind,
    }).toEqual({
      method: "GET",
      path: "/api/browser/state",
      scopes: ["session:read"],
      bodyKind: "empty",
    });
    expect({
      method: commandRoute.method,
      path: commandRoute.path,
      scopes: commandRoute.scopes,
      bodyKind: commandRoute.request.bodyKind,
    }).toEqual({
      method: "POST",
      path: "/api/browser/command",
      scopes: ["session:operate"],
      bodyKind: "json",
    });

    const stateResponseSchema = stateRoute.response.jsonSchema;
    const commandResponseSchema = commandRoute.response.jsonSchema;
    const commandRequestSchema = commandRoute.request.jsonSchema;
    if (!stateResponseSchema || !commandResponseSchema || !commandRequestSchema) {
      throw new Error("Browser route JSON schemas are required");
    }
    expect(stateResponseSchema.parse(value.http.stateResponse)).toEqual(value.http.stateResponse);
    expect(commandResponseSchema.parse(value.http.stateResponse)).toEqual(value.http.stateResponse);

    const parsed = value.http.commands.map((entry) => commandRequestSchema.parse(entry.request));
    expect(parsed.map((entry) => entry.kind)).toEqual([
      "create-tab",
      "create-tab",
      "close-tab",
      "activate-tab",
      "move-tab",
      "move-tab",
      "navigate",
      "back",
      "forward",
      "reload",
    ]);
    expect(new Set(parsed.map((entry) => entry.kind))).toEqual(
      new Set([
        "create-tab",
        "close-tab",
        "activate-tab",
        "move-tab",
        "navigate",
        "back",
        "forward",
        "reload",
      ]),
    );
    for (const entry of parsed) expect(remoteBrowserCommandSchema.parse(entry)).toEqual(entry);
  });

  it("covers every browser client input discriminator and safe key", () => {
    const entries = fixture().webSocket.client;
    const parsed = entries.map((entry) => remoteWebSocketClientMessageSchema.parse(entry.message));
    expect(parsed.map((message) => message.type)).toEqual([
      "browser-watch",
      "browser-unwatch",
      ...Array.from({ length: 11 }, () => "browser-input"),
    ]);

    const inputs = parsed.flatMap((message) =>
      message.type === "browser-input" ? [message.input] : [],
    );
    expect(inputs.map((input) => input.kind)).toEqual([
      "tap",
      "scroll",
      "insert-text",
      "key",
      "key",
      "key",
      "key",
      "key",
      "key",
      "key",
      "key",
    ]);
    expect(inputs.flatMap((input) => (input.kind === "key" ? [input.key] : []))).toEqual([
      "enter",
      "backspace",
      "tab",
      "escape",
      "arrow-up",
      "arrow-down",
      "arrow-left",
      "arrow-right",
    ]);
  });

  it("covers browser state, frame metadata, and every mirror status", () => {
    const parsed = fixture().webSocket.server.map((entry) =>
      remoteWebSocketServerMessageSchema.parse(entry.message),
    );
    expect(parsed.map((message) => message.type)).toEqual([
      "browser-state",
      "browser-frame",
      "browser-mirror-status",
      "browser-mirror-status",
      "browser-mirror-status",
    ]);
    expect(
      parsed.flatMap((message) =>
        message.type === "browser-mirror-status" ? [message.status.status] : [],
      ),
    ).toEqual(["starting", "active", "unavailable"]);
    const mapping = fixture().coordinateMapping;
    expect(mapping).toHaveLength(3);
    for (const entry of mapping) {
      expect(mapPagePoint(entry), `page point for ${entry.id}`).toEqual(entry.expectedPagePoint);
    }
  });

  it("rejects unsafe or malformed browser payloads", () => {
    expect(() => remoteBrowserCommandSchema.parse({ kind: "close-tab", tabId: "" })).toThrow(
      /expected string to have >=1 characters/,
    );
    expect(() =>
      remoteWebSocketClientMessageSchema.parse({
        type: "browser-input",
        input: { kind: "insert-text", text: "x".repeat(1025) },
      }),
    ).toThrow(/expected string to have <=1024 characters/);
    expect(() =>
      remoteWebSocketClientMessageSchema.parse({
        type: "browser-input",
        input: { kind: "key", key: "delete" },
      }),
    ).toThrow(/expected one of/);
    expect(() =>
      remoteWebSocketServerMessageSchema.parse({
        type: "browser-frame",
        tabId: "tab-main",
        data: "",
        metadata: {
          deviceWidth: 1280,
          deviceHeight: 720,
          pageScaleFactor: 1,
          offsetTop: 0,
          scrollOffsetX: 0,
          scrollOffsetY: 0,
        },
      }),
    ).toThrow(/expected string to have >=1 characters/);
    expect(() =>
      remoteWebSocketServerMessageSchema.parse({
        type: "browser-mirror-status",
        status: { status: "stopped", tabId: null },
      }),
    ).toThrow(/expected one of/);
  });
});
