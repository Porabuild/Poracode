import assert from "node:assert/strict";
import { join } from "node:path";

/** Native panel/window transfer regression; real provider delivery is a separate gate. */
export async function mockSideChatGate({
  client,
  evaluate,
  waitForValue,
  waitForTarget,
  connectTarget,
  screenshot,
  outDir,
  fixture,
}) {
  const main = (expression) => evaluate(client, expression, true);
  let sideClient;
  const side = (expression) => evaluate(sideClient, expression, true);
  const originalView = await main("window.__poracodeDev.stores.app.getState().view");
  let before;
  const bootstrap = {
    source: {
      id: "side-chat-smoke-parent",
      projectId: fixture.project.id,
      agentKind: "codex",
      config: { model: "smoke-model" },
      title: "Side chat smoke source",
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    context: {
      summary: "User: context marker smoke-side-42",
      sourceProvider: "codex",
      sourceSessionId: "parent-session",
      extractedAt: new Date().toISOString(),
      contentKind: "transcript",
    },
    title: "Side chat smoke",
    prompt: "",
    autoStart: false,
  };
  async function assertHeader(read, toolbarSelector) {
    const header = await read(`(() => {
      const toolbar = document.querySelector(${JSON.stringify(toolbarSelector)});
      const titleRow = document.querySelector('.poracode-side-chat-title');
      return {
        model: toolbar.textContent,
        title: titleRow.textContent,
        height: getComputedStyle(titleRow).height,
        border: getComputedStyle(titleRow).borderBottomWidth,
        toolbarBottom: toolbar.getBoundingClientRect().bottom,
        titleTop: titleRow.getBoundingClientRect().top,
      };
    })()`);
    assert.match(header.model, /smoke[- ]model/iu);
    assert.equal(header.title, bootstrap.title);
    assert.equal(header.height, "24px");
    assert.equal(header.border, "1px");
    assert.equal(header.titleTop, header.toolbarBottom);
  }
  try {
    await main(`(() => {
      const store = window.__poracodeDev.stores.app.getState();
      store.createThread({
        threadId: ${JSON.stringify(bootstrap.source.id)},
        projectId: ${JSON.stringify(fixture.project.id)},
        agentKind: ${JSON.stringify(bootstrap.source.agentKind)},
        config: ${JSON.stringify(bootstrap.source.config)},
        title: ${JSON.stringify(bootstrap.source.title)},
        prompt: '', presentationMode: 'gui', focus: true,
      });
      store.openThread(${JSON.stringify(bootstrap.source.id)});
    })()`);
    before = await main("JSON.stringify(window.__poracodeDev.stores.app.getState().view)");
    await main(`window.poracode.openSideChatPanel(${JSON.stringify(bootstrap)})`);
    await waitForValue(
      () => main("Boolean(document.querySelector('[data-side-chat-surface=panel] textarea'))"),
      Boolean,
      "default side chat panel composer",
    );
    assert.equal(
      await main(
        "document.activeElement === document.querySelector('[data-side-chat-surface=panel] textarea')",
      ),
      true,
    );
    assert.equal(
      await main(
        "document.querySelector('[data-side-chat-surface=panel]').textContent.includes('smoke-side-42')",
      ),
      false,
    );
    await assertHeader(main, "[data-active-tab=sideChat]");
    await client.send("Input.insertText", { text: "Unsent side question" });
    await screenshot(client, join(outDir, "mock-side-chat-panel.png"));
    await main("document.querySelector('button[title=\"Hide panel\"]').click()");
    await waitForValue(
      () => main('Boolean(document.querySelector("[data-side-chat-surface=panel]"))'),
      (value) => value === false,
      "side chat hidden without closing its conversation",
    );
    await waitForValue(
      () => main("window.poracode.getSideChatWindowInfo().then(info => info?.prompt)"),
      (value) => value === "Unsent side question",
      "hidden side chat draft checkpoint",
    );
    const retainedId = (await main("window.poracode.getSideChatWindowInfo()")).id;
    await waitForValue(
      () =>
        main(`(() => {
        const button = [...document.querySelectorAll('button[aria-label="Add attachment or capability"]')]
          .find(node => !node.closest('[aria-hidden="true"]'));
        if (!button) return false;
        button.click();
        return true;
      })()`),
      Boolean,
      "parent composer add menu",
    );
    await waitForValue(
      () =>
        main(`(() => {
        const item = document.querySelector('[role="menuitem"][data-key="side-chat"]');
        if (!item) return false;
        item.click();
        return true;
      })()`),
      Boolean,
      "side chat menu action",
    );
    await waitForValue(
      () => main('document.querySelector("[data-side-chat-surface=panel] textarea")?.value'),
      (value) => value === "Unsent side question",
      "hidden side chat draft restored",
    );
    assert.equal((await main("window.poracode.getSideChatWindowInfo()")).id, retainedId);
    await main("document.querySelector('button[aria-label=\"Detach side chat\"]').click()");
    sideClient = await connectTarget(await waitForTarget("sideChat"));
    await sideClient.send("Runtime.enable");
    await sideClient.send("Page.enable");
    await waitForValue(
      () => side("document.querySelector('textarea')?.value"),
      (value) => value === "Unsent side question",
      "detached side chat preserved unsent draft",
    );
    await assertHeader(side, "[data-side-chat-surface=window] .poracode-overlay-header");
    const info = await side("window.poracode.getSideChatWindowInfo()");
    assert.equal(info.source.id, bootstrap.source.id);
    assert.equal(info.autoStart, false);
    assert.match(info.context.summary, /smoke-side-42/);
    assert.equal(await main("window.poracode.getSideChatWindowInfo()"), null);
    assert.equal(
      await main("JSON.stringify(window.__poracodeDev.stores.app.getState().view)"),
      before,
    );
    assert.deepEqual(await main("window.poracode.getSideChatThreadIds()"), []);
    await screenshot(sideClient, join(outDir, "mock-side-chat-detached.png"));
    await side("window.poracodeHost.reloadRenderer()");
    await waitForValue(
      () => side("document.querySelector('textarea')?.value"),
      (value) => value === "Unsent side question",
      "reloaded side chat draft",
    );
    await side("document.querySelector('button[aria-label=\"Attach side chat\"]').click()");
    sideClient.close();
    sideClient = undefined;
    await waitForValue(
      () => main("document.querySelector('[data-side-chat-surface=panel] textarea')?.value"),
      (value) => value === "Unsent side question",
      "reattached side chat draft",
    );
    assert.equal((await main("window.poracode.getSideChatWindowInfo()")).id, info.id);
    assert.deepEqual(await main("window.poracode.getSideChatThreadIds()"), []);
    await screenshot(client, join(outDir, "mock-side-chat-reattached.png"));
    await main(
      "document.querySelector('[data-side-chat-surface=panel] button[aria-label=\"Close side chat\"]').click()",
    );
    await waitForValue(
      () => main("window.poracode.getSideChatWindowInfo()"),
      (value) => value === null,
      "side chat panel closed",
    );
    assert.equal(
      await main("JSON.stringify(window.__poracodeDev.stores.app.getState().view)"),
      before,
    );
    return "side chat opened in the right panel with focus and a shared header, hid inherited context, preserved an unsent draft through detach/reload/attach, and closed without changing the main view or starting a provider";
  } finally {
    if (sideClient) {
      await side("window.close()").catch(() => undefined);
      sideClient.close();
    }
    await main(`(() => {
      window.__poracodeDev.stores.app.setState({view: ${JSON.stringify(originalView)}});
      window.__poracodeDev.stores.app.getState().deleteThread(${JSON.stringify(bootstrap.source.id)});
    })()`);
  }
}
