import assert from "node:assert/strict";
import { join } from "node:path";
import { clickCdpElements } from "./poracode-cdp-actions.mjs";

/** Exercise the real fork command and navigation without starting a provider. */
export async function mockThreadForkGate({ client, evaluate, waitForValue, screenshot, outDir }) {
  const read = (expression) => evaluate(client, expression, true);
  const click = (selector) =>
    clickCdpElements({
      client,
      evaluate,
      elementsExpression: `document.querySelectorAll(${JSON.stringify(selector)})`,
      label: selector,
    });
  const sourceId = "smoke-fork-source";
  const originalView = await read("window.__poracodeDev.stores.app.getState().view");
  let forkId;
  try {
    const originalSourceIds = await read(`(async () => {
      const diagnostics = await window.__poracodeDev.loadHostDiagnostics();
      const host = diagnostics.loopback.readManagedLoopbackActivation().client;
      const snapshot = await host.boundedThreadHistory(${JSON.stringify(sourceId)}, { compactDetails: true, omitScrollback: true, noticesCapable: true });
      // Keep this synthetic view settled; mock mode refuses provider reconnects.
      const source = { ...snapshot.page.thread, status: 'idle' };
      const app = window.__poracodeDev.stores.app;
      app.setState((state) => ({ threads: [...state.threads.filter((t) => t.id !== source.id), source] }));
      app.getState().openThread(source.id);
      return snapshot.page.runtimeItems.map((item) => item.id);
    })()`);
    assert.deepEqual(originalSourceIds.slice(0, 4), [
      "fork-user-1",
      "fork-answer-1",
      "fork-user-2",
      "fork-answer-2",
    ]);
    await waitForValue(
      () =>
        read(
          `(() => {
            const button = document.querySelector('[data-item-id="fork-answer-1"] button[aria-label="Fork from here"]');
            return !!button && !button.closest('[inert]') && button.getBoundingClientRect().width > 0;
          })()`,
        ),
      Boolean,
      "historical fork icon",
    );
    const forkSelector = '[data-item-id="fork-answer-1"] button[aria-label="Fork from here"]';
    const opacity = () =>
      read(
        `getComputedStyle(document.querySelector(${JSON.stringify(forkSelector)}).parentElement).opacity`,
      );
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    if (await read("matchMedia('(hover: hover)').matches")) {
      await waitForValue(opacity, (value) => value === "0", "fork hidden without hover");
      await read(`document.querySelector(${JSON.stringify(forkSelector)}).focus()`);
      await waitForValue(opacity, (value) => value === "1", "fork visible with keyboard focus");
      await read(`document.querySelector(${JSON.stringify(forkSelector)}).blur()`);
    }
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await waitForValue(opacity, (value) => value === "1", "fork visible on touch");
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    const point = await read(`(() => {
      const row = document.querySelector('[data-item-id="fork-answer-1"]');
      row.scrollIntoView({ block: 'center' });
      const rect = row.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await waitForValue(opacity, (value) => value === "1", "fork visible on message hover");
    await screenshot(client, join(outDir, "thread-fork-source-hover.png"));
    await click('[data-item-id="fork-answer-1"] button[aria-label="Fork from here"]');
    await waitForValue(
      () => read(`document.querySelector('[role="dialog"]')?.textContent.includes('Create fork')`),
      Boolean,
      "fork dialog",
    );
    assert.equal(
      await read(`document.querySelectorAll('[role="dialog"] input[type="checkbox"]').length`),
      0,
    );
    await click('[role="dialog"] button.button--tertiary');
    forkId = await waitForValue(
      () =>
        read(
          `window.__poracodeDev.stores.app.getState().threads.find((t) => t.forkedFrom?.threadId === ${JSON.stringify(sourceId)})?.id`,
        ),
      Boolean,
      "created fork lineage",
    );
    await waitForValue(
      () =>
        read(
          `!!document.querySelector('[data-testid="thread-fork-source"]') && !!document.querySelector('[data-testid="thread-fork-boundary"]')`,
        ),
      Boolean,
      "fork source and inherited boundary",
    );
    const result = await read(`(async () => {
      const diagnostics = await window.__poracodeDev.loadHostDiagnostics();
      const host = diagnostics.loopback.readManagedLoopbackActivation().client;
      const fork = await host.boundedThreadHistory(${JSON.stringify(forkId)}, { compactDetails: true, omitScrollback: true, noticesCapable: true });
      const source = await host.boundedThreadHistory(${JSON.stringify(sourceId)}, { compactDetails: true, omitScrollback: true, noticesCapable: true });
      return { fork: fork.page.thread, forkIds: fork.page.runtimeItems.map((item) => item.id), sourceIds: source.page.runtimeItems.map((item) => item.id) };
    })()`);
    assert.deepEqual(result.forkIds, ["fork-user-1", "fork-answer-1"]);
    assert.deepEqual(result.sourceIds, originalSourceIds);
    assert.equal(result.fork.canResumeWithConfig, true);
    assert.equal(result.fork.sessionRef, undefined);
    await waitForValue(
      () =>
        read(`(() => {
        const reply = [...document.querySelectorAll('[data-item-id="fork-answer-1"]')]
          .find((row) => !row.closest('[inert]'));
        if (!reply || !reply.textContent.includes('First source answer')) return false;
        for (let node = reply; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none') return false;
        }
        return reply.getBoundingClientRect().height > 0;
      })()`),
      Boolean,
      "inherited reply painted",
    );
    await screenshot(client, join(outDir, "thread-fork-desktop.png"));
    const originalWidth = await read("innerWidth");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await waitForValue(
      () => read("innerWidth"),
      (width) => width === 390,
      "narrow fork viewport",
    );
    assert.equal(
      await read(`!!document.querySelector('[data-testid="thread-fork-source"]')`),
      true,
    );
    await screenshot(client, join(outDir, "thread-fork-narrow.png"));
    await client.send("Emulation.clearDeviceMetricsOverride");
    await waitForValue(
      () => read("innerWidth"),
      (width) => width === originalWidth,
      "restored viewport",
    );
    await read(
      "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    await screenshot(client, join(outDir, "thread-fork-restored-desktop.png"));
    await click('[data-testid="thread-fork-source"] button');
    await waitForValue(
      () => read("window.__poracodeDev.stores.app.getState().view"),
      (view) => view.panes?.includes(sourceId),
      "fork source navigation",
    );
    return "real host fork command preserved the selected prefix, source, resumability, lineage and desktop/narrow controls; provider delivery and compact PWA are qualified separately";
  } finally {
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await client.send("Emulation.clearDeviceMetricsOverride");
    await read(
      `window.__poracodeDev.stores.app.setState({ view: ${JSON.stringify(originalView)} })`,
    );
    if (forkId) await read(`window.poracode.dbDeleteThread(${JSON.stringify(forkId)})`);
  }
}
