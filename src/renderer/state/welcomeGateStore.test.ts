import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWelcomeGateStore, WELCOME_SEEN_STORAGE_KEY } from "./welcomeGateStore";

describe("welcomeGateStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useWelcomeGateStore.setState({ backgroundWorkReleased: false });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("releaseBackgroundWork flips the gate open", () => {
    expect(useWelcomeGateStore.getState().backgroundWorkReleased).toBe(false);
    useWelcomeGateStore.getState().releaseBackgroundWork();
    expect(useWelcomeGateStore.getState().backgroundWorkReleased).toBe(true);
  });

  it("releaseBackgroundWork is idempotent and keeps the same state reference once open", () => {
    useWelcomeGateStore.getState().releaseBackgroundWork();
    const released = useWelcomeGateStore.getState();
    useWelcomeGateStore.getState().releaseBackgroundWork();
    expect(useWelcomeGateStore.getState()).toBe(released);
  });

  it("seeds released=false on a fresh install (welcome unseen)", async () => {
    vi.resetModules();
    localStorage.clear();
    const mod = await import("./welcomeGateStore");
    expect(mod.useWelcomeGateStore.getState().backgroundWorkReleased).toBe(false);
  });

  it("seeds released=true for a returning user (welcome already seen)", async () => {
    vi.resetModules();
    localStorage.setItem(WELCOME_SEEN_STORAGE_KEY, "true");
    const mod = await import("./welcomeGateStore");
    expect(mod.useWelcomeGateStore.getState().backgroundWorkReleased).toBe(true);
  });
});
