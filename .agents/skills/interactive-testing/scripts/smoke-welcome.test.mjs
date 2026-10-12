import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { runWelcomeDismissalScenario } from "./smoke-welcome.mjs";

function fixture(t, { polls = 6 } = {}) {
  const dom = new JSDOM(
    `<main id="root">
      <div class="poracode-welcome-page">Shared background</div>
      <section id="welcome" class="poracode-welcome-page fixed opacity-100">
        <div class="poracode-welcome-reveal">
          <button id="primary" class="poracode-welcome-button"><span>Ask Question Home</span></button>
          <button class="poracode-welcome-button">Add Project</button>
        </div>
      </section>
      <div id="status">App ready</div>
    </main>`,
    { url: "https://smoke.test", runScripts: "outside-only" },
  );
  t.after(() => dom.window.close());
  const { window } = dom;
  const { document } = window;
  Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  Object.defineProperty(document.body, "innerText", {
    get: () => document.body.textContent,
  });
  const gate = document.querySelector("#welcome");
  const button = document.querySelector("#primary");
  button.scrollIntoView = () => {};
  button.getBoundingClientRect = () => ({ x: 10, y: 10, width: 80, height: 40 });
  button.click = () => {
    throw new Error("Synthetic button.click must not be used");
  };
  const events = [];
  const expressions = [];
  const opened = [];
  const jobs = [];
  let time = 0;
  const state = {
    window,
    gate,
    button,
    events,
    expressions,
    opened,
    onPress: () => gate.remove(),
    afterEvaluate: () => {},
    afterInput: () => {},
    hit: () => button.querySelector("span"),
    after: (ms, run) => jobs.push({ at: time + ms, run }),
    now: () => time,
  };
  document.elementFromPoint = () => state.hit();
  window.__poracodeDev = {
    stores: {
      app: {
        getState: () => ({
          projects: [{ id: "smoke-project" }],
          openDraft: (id) => opened.push(id),
        }),
      },
    },
  };
  const sleep = async (ms) => {
    time += ms;
    for (let index = 0; index < jobs.length;) {
      if (jobs[index].at > time) {
        index += 1;
      } else {
        const [{ run }] = jobs.splice(index, 1);
        run();
      }
    }
  };
  const evaluate = async (_client, expression) => {
    expressions.push(expression);
    const result = window.eval(expression);
    state.afterEvaluate(expression, result);
    return result;
  };
  const client = {
    send: async (method, payload) => {
      events.push({ method, ...payload });
      if (payload.type === "mouseReleased") state.onPress();
      state.afterInput(payload);
    },
  };
  const waitForValue = async (read, predicate, label) => {
    let last;
    for (let poll = 0; poll < polls; poll += 1) {
      last = await read();
      if (predicate(last)) return last;
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${label}: ${JSON.stringify(last)}`);
  };
  state.run = () =>
    runWelcomeDismissalScenario({ client, evaluate, waitForValue, sleep, now: state.now });
  return state;
}

function evidenceOf(error) {
  assert.equal(error.name, "WelcomeScenarioError");
  assert.equal(error.scenarioEvidence.formatVersion, 1);
  return error.scenarioEvidence;
}

await test("uses guarded pointer input, observes dismissal and never writes the flag", async (t) => {
  const state = fixture(t);
  const result = await state.run();
  assert.equal(result.dismissed, true);
  assert.equal(result.evidence.initial.welcomeVisible, true);
  assert.equal(result.evidence.dispatchedActions, 1);
  assert.equal(result.evidence.final.welcomeVisible, false);
  assert.equal(result.evidence.lastSnapshot.phase, "stable");
  assert.deepEqual(state.opened, ["smoke-project"]);
  assert.equal(state.window.localStorage.getItem("poracode-welcome-seen-v16"), null);
  assert(
    !state.expressions.some((expression) => /\.click\(|localStorage\.setItem/.test(expression)),
  );
  assert.deepEqual(
    state.events.map((event) => event.type),
    ["mouseMoved", "mousePressed", "mouseReleased"],
  );
  assert(state.events.every((event) => event.method === "Input.dispatchMouseEvent"));
  assert(state.events.every((event) => event.x === 50 && event.y === 30));
});

await test("distinguishes the shared backdrop from an already absent fixed overlay", async (t) => {
  const state = fixture(t);
  state.gate.remove();
  const result = await state.run();
  assert.equal(result.dismissed, false);
  assert.equal(result.evidence.initial.overlayCount, 0);
  assert.deepEqual(state.events, []);
  assert.deepEqual(state.opened, []);
});

await test("waits for the primary action's reveal ancestor to become painted", async (t) => {
  const state = fixture(t);
  const reveal = state.button.parentElement;
  reveal.style.opacity = "0";
  state.after(300, () => (reveal.style.opacity = "1"));
  state.onPress = () => {
    assert.equal(reveal.style.opacity, "1");
    state.gate.remove();
  };
  const result = await state.run();
  assert.equal(result.dismissed, true);
  assert(result.evidence.snapshots.some((snapshot) => !snapshot.state.primaryAction?.painted));
  assert.equal(result.evidence.dispatchedActions, 1);
});

await test("waits for fade removal after a completed action without re-pressing", async (t) => {
  const state = fixture(t);
  state.onPress = () => {
    state.gate.classList.replace("opacity-100", "opacity-0");
    state.after(1_600, () => state.gate.remove());
  };
  const result = await state.run();
  assert.equal(result.evidence.dispatchedActions, 1);
  assert(result.evidence.snapshots.some((snapshot) => snapshot.state.exiting));
  assert.equal(result.evidence.final.welcomeVisible, false);
});

await test("retains prior dispatch when removal happens after the dismissal poll", async (t) => {
  const state = fixture(t);
  state.onPress = () => {};
  let removed = false;
  state.afterEvaluate = (expression, result) => {
    if (!removed && expression.includes("function readWelcomeState") && state.now() === 1_500) {
      assert.equal(result.welcomeVisible, true);
      state.gate.remove();
      removed = true;
    }
  };
  const result = await state.run();
  assert.equal(result.dismissed, true);
  assert.equal(result.evidence.dispatchedActions, 1);
  assert.equal(result.evidence.actionAttempts, 1);
  assert(
    result.evidence.snapshots.some(
      (snapshot) => snapshot.phase === "after-action" && snapshot.state.welcomeVisible,
    ),
  );
  assert(
    result.evidence.snapshots.some(
      (snapshot) => snapshot.phase === "before-action" && !snapshot.state.welcomeVisible,
    ),
  );
});

await test("a released retry loop loses its first activation on that valid removal schedule", () => {
  const activations = [true, false];
  let clicked = false;
  let dismissed = false;
  let successfulActivations = 0;
  for (let attempt = 0; attempt < 5 && !dismissed; attempt += 1) {
    clicked = activations[attempt];
    if (!clicked) break;
    successfulActivations += 1;
    // The first post-action query sees the closing overlay; removal follows
    // before the next primary-button query. Historical run timing is unknown.
    dismissed = false;
  }
  assert.equal(successfulActivations, 1);
  assert.equal(clicked, false);
});

await test("a missing guarded lookup after prior dispatch still requires stable removal", async (t) => {
  const state = fixture(t);
  state.onPress = () => {};
  let readsAfterFirst = 0;
  state.afterEvaluate = (expression) => {
    if (expression.includes("function readWelcomeState") && state.now() === 1_500) {
      readsAfterFirst += 1;
      if (readsAfterFirst === 2) state.gate.remove();
    }
  };
  const result = await state.run();
  assert.equal(result.dismissed, true);
  assert.equal(result.evidence.dispatchedActions, 1);
  assert.equal(result.evidence.actionAttempts, 2);
  assert.equal(
    result.evidence.lastActionError,
    "cannot click welcome screen primary action: missing",
  );
  assert.equal(result.evidence.lastSnapshot.state.welcomeVisible, false);
  assert.equal(state.events.length, 3);
});

await test("disappearance before any primary dispatch is a failure", async (t) => {
  const state = fixture(t);
  let initialRead = true;
  state.afterEvaluate = (expression) => {
    if (expression.includes("function readWelcomeState") && initialRead) {
      initialRead = false;
      state.gate.remove();
    }
  };
  await assert.rejects(state.run(), (error) => {
    assert.match(error.message, /primary action was not clickable/);
    const evidence = evidenceOf(error);
    assert.equal(evidence.initial.welcomeVisible, true);
    assert.equal(evidence.dispatchedActions, 0);
    return true;
  });
  assert.deepEqual(state.events, []);
});

for (const [name, change, message] of [
  ["disabled", (state) => (state.button.disabled = true), "disabled"],
  ["ARIA disabled", (state) => state.button.setAttribute("aria-disabled", "true"), "disabled"],
  ["inert", (state) => state.gate.setAttribute("inert", ""), "inert"],
  ["occluded", (state) => (state.hit = () => state.window.document.body), "occluded"],
  [
    "offscreen",
    (state) =>
      (state.button.getBoundingClientRect = () => ({ x: -100, y: 10, width: 20, height: 20 })),
    "outside-viewport",
  ],
]) {
  await test(`refuses a ${name} primary action with evidence and no input`, async (t) => {
    const state = fixture(t);
    change(state);
    await assert.rejects(state.run(), (error) => {
      assert.match(error.message, new RegExp(message));
      assert.equal(evidenceOf(error).dispatchedActions, 0);
      return true;
    });
    assert.deepEqual(state.events, []);
  });
}

await test("multiple fixed overlays are refused as ambiguous", async (t) => {
  const state = fixture(t);
  state.gate.after(state.gate.cloneNode(true));
  await assert.rejects(state.run(), (error) => {
    assert.match(error.message, /ambiguous:2/);
    assert.equal(evidenceOf(error).initial.overlayCount, 2);
    return true;
  });
  assert.deepEqual(state.events, []);
});

await test("a CDP input failure is not counted as a completed dispatch", async (t) => {
  const state = fixture(t);
  const inputError = new Error("owned CDP input failed");
  state.afterInput = () => {
    throw inputError;
  };
  await assert.rejects(state.run(), (error) => {
    assert.equal(error.message, inputError.message);
    assert.equal(error.cause, inputError);
    assert.equal(evidenceOf(error).dispatchedActions, 0);
    return true;
  });
  assert.equal(state.events.length, 1);
  assert.deepEqual(state.opened, []);
});

await test("an input error on a later attempt is preserved even if the overlay then disappears", async (t) => {
  const state = fixture(t);
  let presses = 0;
  state.onPress = () => {
    presses += 1;
    if (presses === 2) state.gate.remove();
  };
  state.afterInput = (payload) => {
    if (payload.type === "mouseReleased" && presses === 2)
      throw new Error("late input transport failure");
  };
  await assert.rejects(state.run(), (error) => {
    assert.match(error.message, /late input transport failure/);
    assert.equal(evidenceOf(error).dispatchedActions, 1);
    return true;
  });
  assert.deepEqual(state.opened, []);
});

await test("a flag update without actual overlay removal never passes", async (t) => {
  const state = fixture(t);
  state.onPress = () => state.window.localStorage.setItem("poracode-welcome-seen-v16", "true");
  await assert.rejects(state.run(), (error) => {
    assert.match(error.message, /timed out waiting for welcome screen dismissal/);
    const evidence = evidenceOf(error);
    assert.equal(evidence.dispatchedActions, 5);
    assert.equal(evidence.lastSnapshot.state.storageValue, "true");
    assert.equal(evidence.lastSnapshot.state.welcomeVisible, true);
    return true;
  });
  assert.deepEqual(state.opened, []);
});

await test("returning during the one-second verification interval fails", async (t) => {
  const state = fixture(t);
  state.onPress = () => {
    state.gate.remove();
    state.after(2_500, () => state.window.document.querySelector("#root").append(state.gate));
  };
  await assert.rejects(state.run(), (error) => {
    assert.match(error.message, /returned after dismissal verification/);
    const evidence = evidenceOf(error);
    assert.equal(evidence.final.welcomeVisible, false);
    assert.equal(evidence.lastSnapshot.state.welcomeVisible, true);
    return true;
  });
  assert.deepEqual(state.opened, []);
});

await test("actual removal does not bypass the final renderer bridge health gate", async (t) => {
  const state = fixture(t);
  state.onPress = () => {
    state.gate.remove();
    delete state.window.__poracodeDev;
  };
  await assert.rejects(state.run(), (error) => {
    assert.match(error.message, /timed out waiting for welcome screen dismissal/);
    assert.equal(evidenceOf(error).lastSnapshot.state.devBridge, "undefined");
    return true;
  });
  assert.deepEqual(state.opened, []);
});

await test("snapshot retention is capped while the final state remains available", async (t) => {
  const state = fixture(t, { polls: 80 });
  state.onPress = () => {};
  state.afterEvaluate = (expression) => {
    if (expression.includes("function readWelcomeState")) {
      state.window.document.querySelector("#status").textContent += "x";
    }
  };
  await assert.rejects(state.run(), (error) => {
    const evidence = evidenceOf(error);
    assert.equal(evidence.snapshots.length, 32);
    assert(evidence.droppedSnapshots > 0);
    assert.equal(evidence.initial.welcomeVisible, true);
    assert.equal(evidence.lastSnapshot.phase, "dismissal");
    assert.equal(evidence.lastSnapshot.state.welcomeVisible, true);
    return true;
  });
});
