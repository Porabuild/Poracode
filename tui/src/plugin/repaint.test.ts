import { expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { registerRepaint } from "./repaint";

test("a renderer resize clears the screen, forces a full repaint, and requests a frame", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24 });
  setup.renderer.start();
  try {
    const renderer = setup.renderer as unknown as {
      forceFullRepaintRequested: boolean;
      requestRender(): void;
      emit(event: string): void;
      nativeSession?: { write(bytes: Uint8Array): boolean };
    };
    // OpenTUI upgrades that rename the private members fail here loudly.
    expect("forceFullRepaintRequested" in renderer).toBe(true);
    expect("nativeSession" in renderer).toBe(true);
    expect(typeof renderer.nativeSession?.write).toBe("function");
    const writes: Uint8Array[] = [];
    renderer.nativeSession!.write = (bytes: Uint8Array) => {
      writes.push(bytes);
      return true;
    };
    let renders = 0;
    const original = renderer.requestRender.bind(setup.renderer);
    renderer.requestRender = () => {
      renders++;
      original();
    };
    const cleanup = registerRepaint({ renderer: setup.renderer } as never);
    renderer.forceFullRepaintRequested = false;
    renderer.emit("resize");
    expect(renderer.forceFullRepaintRequested).toBe(true);
    expect(renders).toBe(1);
    expect(writes).toHaveLength(1);
    expect(new TextDecoder().decode(writes[0]!)).toBe("\x1b[2J");
    cleanup();
    renderer.forceFullRepaintRequested = false;
    renderer.emit("resize");
    expect(renderer.forceFullRepaintRequested).toBe(false);
    expect(writes).toHaveLength(1);
  } finally {
    setup.renderer.destroy();
  }
});
