import { describe, expect, it } from "vitest";
import type { SentryEventLike } from "@/shared/diagnostics/sentryPrivacy";
import { classifyNativeCrashEvent } from "./nativeCrash";

describe("native crash diagnostics", () => {
  it("drops only an unknown native process proven to be Xcode swift-frontend", () => {
    const event = {
      platform: "native",
      tags: { "event.process": "unknown" },
      contexts: {
        electron: {
          "crashpad.Stack dump":
            "0.\tProgram arguments: /Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swift-frontend -frontend -interpret /private/tmp/main.swift\n1.\tApple Swift version 6.3",
        },
      },
    } satisfies SentryEventLike;

    expect(classifyNativeCrashEvent(event, "darwin")).toEqual({ drop: true });
  });

  it("keeps unknown Swift and macOS native crashes without executable ownership proof", () => {
    const event = {
      platform: "native",
      tags: { "event.process": "unknown" },
      exception: { values: [{ value: "closure in _assertionFailure" }] },
      contexts: {
        electron: {
          "crashpad.Stack dump":
            "0.\tProgram arguments: /Applications/Poracode.app/Contents/MacOS/Poracode",
        },
      },
    } satisfies SentryEventLike;

    expect(classifyNativeCrashEvent(event, "darwin")).toEqual({ drop: false });
  });

  it("keeps and groups Electron browser GPU fatals by OS and reason class", () => {
    const event = {
      platform: "native",
      tags: { "event.process": "browser" },
      contexts: {
        electron: {
          "crashpad.LOG_FATAL":
            "gpu_data_manager_impl_private.cc:416: GPU process isn't usable. Goodbye.",
        },
      },
    } satisfies SentryEventLike;

    expect(classifyNativeCrashEvent(event, "linux")).toEqual({
      drop: false,
      fingerprint: ["poracode-native-crash", "linux", "gpu-fatal"],
    });
  });

  it("keeps and groups native out-of-memory crashes", () => {
    const event = {
      platform: "native",
      tags: { "event.process": "renderer", "exit.reason": "oom" },
    } satisfies SentryEventLike;

    expect(classifyNativeCrashEvent(event, "win32")).toEqual({
      drop: false,
      fingerprint: ["poracode-native-crash", "win32", "out-of-memory"],
    });
  });
});
