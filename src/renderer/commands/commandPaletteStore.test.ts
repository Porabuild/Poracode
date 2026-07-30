import { afterEach, describe, expect, it } from "vitest";
import { useCommandPaletteStore } from "./commandPaletteStore";

describe("useCommandPaletteStore", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    useCommandPaletteStore.setState({ isOpen: false, originTarget: null });
  });

  it("captures the element that owned focus when search opens", () => {
    document.body.innerHTML = '<button id="origin">Search</button><input id="palette" />';
    const origin = document.getElementById("origin");
    origin?.focus();

    useCommandPaletteStore.getState().open();
    document.getElementById("palette")?.focus();

    expect(useCommandPaletteStore.getState().originTarget).toBe(origin);
  });

  it("does not replace the origin when an open palette is opened again", () => {
    document.body.innerHTML = '<button id="origin">Search</button><input id="palette" />';
    const origin = document.getElementById("origin");
    origin?.focus();
    useCommandPaletteStore.getState().open();

    document.getElementById("palette")?.focus();
    useCommandPaletteStore.getState().open();

    expect(useCommandPaletteStore.getState().originTarget).toBe(origin);
  });
});
