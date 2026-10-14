import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBuildAssetBase, LOCAL_CLIENT_ASSET_BASE_META_NAME } from "./buildAssetBase";

let originalUrl = "";

function marker(content = "/"): void {
  const meta = document.createElement("meta");
  meta.name = LOCAL_CLIENT_ASSET_BASE_META_NAME;
  meta.content = content;
  document.head.append(meta);
}

beforeEach(() => {
  originalUrl = window.location.href;
  window.history.replaceState(null, "", "/thread/thread-1?host=local#resume");
  vi.stubEnv("BASE_URL", "./");
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.head
    .querySelectorAll('meta[name="' + LOCAL_CLIENT_ASSET_BASE_META_NAME + '"]')
    .forEach((meta) => meta.remove());
  window.history.replaceState(null, "", originalUrl);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("build asset base", () => {
  it("uses the private local root without changing route, relative or fragment link bases", () => {
    const route = window.location.href;
    const navigationBase = document.baseURI;
    const note = document.createElement("a");
    note.href = "notes.md";
    const section = document.createElement("a");
    section.href = "#section";
    const noteHref = note.href;
    const sectionHref = section.href;
    marker();
    expect(getBuildAssetBase()).toBe("/");
    expect(window.location.href).toBe(route);
    expect(document.baseURI).toBe(navigationBase);
    expect(note.href).toBe(noteHref);
    expect(section.href).toBe(sectionHref);
  });

  it.each(["/", "/hosted/", "https://cdn.example/build/"])("keeps the declared base %s", (base) => {
    marker();
    vi.stubEnv("BASE_URL", base);
    expect(getBuildAssetBase()).toBe(base);
  });

  it("keeps old whole documents without the marker and rejects unknown metadata", () => {
    expect(getBuildAssetBase()).toBe("./");
    marker("//elsewhere.example/");
    expect(getBuildAssetBase()).toBe("./");
  });

  it("ignores body metadata and file-origin metadata", () => {
    const meta = document.createElement("meta");
    meta.name = LOCAL_CLIENT_ASSET_BASE_META_NAME;
    meta.content = "/";
    document.body.append(meta);
    expect(getBuildAssetBase()).toBe("./");
    meta.remove();
    marker();
    vi.stubGlobal("window", { location: { protocol: "file:" } });
    expect(getBuildAssetBase()).toBe("./");
  });
});
