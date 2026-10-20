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
    await read(`(async () => {
      const diagnostics = await window.__poracodeDev.loadHostDiagnostics();
      const host = diagnostics.loopback.readManagedLoopbackActivation().client;
      const snapshot = await host.boundedThreadHistory(${JSON.stringify(sourceId)}, { compactDetails: true, omitScrollback: true, noticesCapable: true });
      const source = snapshot.page.thread;
      const app = window.__poracodeDev.stores.app;
      app.setState((state) => ({ threads: [...state.threads.filter((t) => t.id !== source.id), source] }));
      app.getState().openThread(source.id);
    })()`);
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
    assert.deepEqual(result.sourceIds, [
      "fork-user-1",
      "fork-answer-1",
      "fork-user-2",
      "fork-answer-2",
    ]);
    assert.equal(result.fork.canResumeWithConfig, true);
    assert.equal(result.fork.sessionRef, undefined);
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
    await click('[data-testid="thread-fork-source"] button');
    await waitForValue(
      () =>
        read(
          `window.__poracodeDev.stores.app.getState().view.panes?.includes(${JSON.stringify(sourceId)})`,
        ),
      Boolean,
      "fork source navigation",
    );
    return "real host fork command preserved the selected prefix, source, resumability, lineage and desktop/narrow controls; provider delivery and compact PWA are qualified separately";
  } finally {
    await client.send("Emulation.clearDeviceMetricsOverride");
    await read(
      `window.__poracodeDev.stores.app.setState({ view: ${JSON.stringify(originalView)} })`,
    );
    if (forkId) await read(`window.poracode.dbDeleteThread(${JSON.stringify(forkId)})`);
  }
}
