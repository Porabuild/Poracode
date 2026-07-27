import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => {
  const scope = {
    setContext: vi.fn<(name: string, value: Record<string, unknown>) => void>(),
    setTag: vi.fn<(key: string, value: unknown) => void>(),
    setTags: vi.fn<(tags: Record<string, unknown>) => void>(),
  };
  return {
    captureException: vi.fn<(error: unknown) => void>(),
    getCurrentScope: vi.fn<() => typeof scope>(() => scope),
    isEnabled: vi.fn<() => boolean>(() => true),
    scope,
    withScope: vi.fn<(callback: (value: typeof scope) => void) => void>((callback) =>
      callback(scope),
    ),
  };
});

vi.mock("@sentry/electron/renderer", () => ({
  captureException: sentry.captureException,
  getCurrentScope: sentry.getCurrentScope,
  isEnabled: sentry.isEnabled,
  withScope: sentry.withScope,
}));

import {
  captureRendererException,
  extractSafeReactComponentTree,
  prepareRendererSentryEvent,
  setRendererRuntimeDiagnosticContext,
} from "./sentry";

describe("renderer Sentry diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sentry.isEnabled.mockReturnValue(true);
  });

  it("extracts only structural component names from a React component stack", () => {
    const stack = `
      at AccountPanel (/Users/alice/private/repo/AccountPanel.tsx:42:9)
      at div (<anonymous>)
      at Customer_alice@example.com (file:///Users/alice/private.tsx:3:1)
      at PromptView ({"prompt":"private user content"})
      private user content
    `;

    expect(extractSafeReactComponentTree(stack)).toEqual(["AccountPanel", "div", "PromptView"]);
    expect(extractSafeReactComponentTree(stack).join(" ")).not.toMatch(
      /alice|private|Users|repo|[(/{}]/i,
    );
  });

  it("captures the scrubbed component tree through the allowed poracode context", () => {
    captureRendererException(
      new Error("render failed"),
      { featureArea: "react" },
      "at SettingsPanel (/Users/alice/work/repo/SettingsPanel.tsx:1:2)\nat App",
    );

    expect(sentry.scope.setContext).toHaveBeenCalledWith("poracode", {
      react_components: ["SettingsPanel", "App"],
    });
    expect(sentry.scope.setContext).not.toHaveBeenCalledWith(
      "poracode",
      expect.objectContaining({ path: expect.anything() }),
    );
  });

  it("explicitly clears every runtime tag on a non-thread transition", () => {
    setRendererRuntimeDiagnosticContext(null);

    expect(sentry.scope.setTag.mock.calls).toEqual([
      ["poracode.provider", undefined],
      ["poracode.presentation", undefined],
      ["poracode.runtime_kind", undefined],
      ["poracode.feature_area", undefined],
    ]);
  });

  it("drops only the audited unfocused clipboard write race before sanitization", () => {
    const event = {
      exception: {
        values: [
          {
            type: "NotAllowedError",
            value: "Failed to execute 'writeText' on 'Clipboard': Document is not focused.",
          },
        ],
      },
    };

    expect(prepareRendererSentryEvent(event)).toBeNull();
  });

  it.each([
    {
      type: "SecurityError",
      value: "Failed to execute 'writeText' on 'Clipboard': Document is not focused.",
    },
    {
      type: "NotAllowedError",
      value: "Failed to execute 'writeText' on 'Clipboard': Write permission denied.",
    },
    {
      type: "NotAllowedError",
      value: "Document is not focused.",
    },
  ])("keeps nearby clipboard and NotAllowedError failures: $type / $value", (exception) => {
    const event = { exception: { values: [exception] } };

    expect(prepareRendererSentryEvent(event)).toEqual(event);
  });

  it("drops a handled stale-file outcome from the file editor", () => {
    const event = {
      tags: { "poracode.feature_area": "file-editor" },
      exception: {
        values: [
          {
            value: "File not found: src/removed.ts",
            mechanism: { handled: true },
          },
        ],
      },
    };

    expect(prepareRendererSentryEvent(event)).toBeNull();
  });

  it.each([
    {
      tags: { "poracode.feature_area": "git" },
      exception: {
        values: [
          {
            value: "File not found: src/removed.ts",
            mechanism: { handled: true },
          },
        ],
      },
    },
    {
      tags: { "poracode.feature_area": "file-editor" },
      exception: {
        values: [
          {
            value: "File not found: src/removed.ts",
            mechanism: { handled: false },
          },
        ],
      },
    },
    {
      tags: { "poracode.feature_area": "file-editor" },
      exception: {
        values: [
          {
            value: "ENOENT: no such file or directory",
            mechanism: { handled: true },
          },
        ],
      },
    },
    {
      tags: { "poracode.feature_area": "file-editor" },
      exception: {
        values: [
          {
            value: "File not found:",
            mechanism: { handled: true },
          },
        ],
      },
    },
  ])("keeps nearby file errors: %#", (event) => {
    expect(prepareRendererSentryEvent(event)).toEqual(event);
  });
});
