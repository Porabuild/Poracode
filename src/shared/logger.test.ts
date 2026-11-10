import { describe, expect, it, vi } from "vitest";
import { createLogger } from "./logger";

function sink() {
  return {
    debug: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
  };
}

describe("createLogger", () => {
  it("prefixes the scope and forwards an optional detail", () => {
    const target = sink();
    const log = createLogger("remote", { sink: target, level: "debug" });
    log.warn("event-interest update failed", new Error("boom"));
    log.info("ready");
    expect(target.warn).toHaveBeenCalledWith(
      "[remote] event-interest update failed",
      expect.any(Error),
    );
    expect(target.info).toHaveBeenCalledWith("[remote] ready");
  });

  it("drops messages below the configured level", () => {
    const target = sink();
    const log = createLogger("db", { sink: target, level: "warn" });
    log.debug("noise");
    log.info("noise");
    log.warn("kept");
    log.error("kept");
    expect(target.debug).not.toHaveBeenCalled();
    expect(target.info).not.toHaveBeenCalled();
    expect(target.warn).toHaveBeenCalledOnce();
    expect(target.error).toHaveBeenCalledOnce();
  });

  it("reads PORACODE_LOG_LEVEL and ignores unknown values", () => {
    const target = sink();
    vi.stubEnv("PORACODE_LOG_LEVEL", "debug");
    createLogger("a", { sink: target }).debug("shown");
    vi.stubEnv("PORACODE_LOG_LEVEL", "verbose");
    createLogger("b", { sink: target }).debug("hidden");
    vi.unstubAllEnvs();
    expect(target.debug).toHaveBeenCalledExactlyOnceWith("[a] shown");
  });
});
