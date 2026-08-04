export function parseCdpPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`expected a TCP port between 1 and 65535, got: ${value}`);
  }
  return port;
}

export function normalizeCdpAppUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`expected an http(s) app URL, got: ${value}`);
  }
  return url.href;
}

export async function inspectCdpWindowTargets({ port, appUrl, windowKind = "main" }) {
  const normalizedAppUrl = normalizeCdpAppUrl(appUrl);
  const versionResponse = await fetch(`http://127.0.0.1:${parseCdpPort(port)}/json/version`);
  if (!versionResponse.ok) {
    throw notCdpError(`port ${port} returned HTTP ${versionResponse.status} for /json/version`);
  }
  const versionText = await versionResponse.text();
  let version;
  try {
    version = JSON.parse(versionText);
  } catch {
    throw notCdpError(
      `port ${port} is reachable but is not a CDP endpoint (/json/version returned non-JSON content)`,
    );
  }
  if (!version || typeof version !== "object" || typeof version.webSocketDebuggerUrl !== "string") {
    throw notCdpError(`port ${port} is reachable but /json/version is not a CDP version payload`);
  }

  const listResponse = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!listResponse.ok) {
    throw notCdpError(`CDP port ${port} returned HTTP ${listResponse.status} for /json/list`);
  }
  const targets = await listResponse.json();
  if (!Array.isArray(targets)) {
    throw notCdpError(`CDP port ${port} returned a non-array target list`);
  }
  const pageTargets = targets.filter((target) => target.type === "page");
  const candidates = pageTargets.filter((target) => target.url === normalizedAppUrl);
  const candidateStates = [];
  const ready = [];
  for (const target of candidates) {
    try {
      const state = await inspectTarget(target);
      candidateStates.push({ targetId: target.id, title: target.title, ...state });
      if (isCdpWindowReady(state, windowKind)) ready.push(target);
    } catch (error) {
      candidateStates.push({
        targetId: target.id,
        title: target.title,
        inspectionError: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { targets, pageTargets, candidates, candidateStates, ready };
}

export function isCdpWindowReady(state, windowKind) {
  return Boolean(
    state.windowKind === windowKind &&
    state.readyState !== "loading" &&
    state.rootChildren > 0 &&
    state.bodyTextLength > 0 &&
    state.devBridge &&
    !state.viteError &&
    !state.crashScreen,
  );
}

async function inspectTarget(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  try {
    await new Promise((done, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`timed out opening CDP WebSocket for target ${target.id}`)),
        3_000,
      );
      ws.onopen = () => {
        clearTimeout(timeout);
        done();
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket error connecting to CDP target ${target.id}`));
      };
    });
    const result = await new Promise((done, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`timed out inspecting CDP target ${target.id}`)),
        3_000,
      );
      const receive = (message) => {
        const payload = JSON.parse(message.data);
        if (payload.id !== 1) return;
        ws.removeEventListener("message", receive);
        clearTimeout(timeout);
        if (payload.error) reject(new Error(JSON.stringify(payload.error)));
        else done(payload.result);
      };
      ws.addEventListener("message", receive);
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: {
            expression:
              `(() => ({` +
              ` windowKind: document.documentElement.dataset.windowKind ?? null,` +
              ` readyState: document.readyState,` +
              ` rootChildren: document.querySelector("#root")?.childElementCount ?? 0,` +
              ` bodyTextLength: document.body?.innerText?.trim().length ?? 0,` +
              ` devBridge: typeof window.__poracodeDev === "object",` +
              ` loadEventEnd: performance.getEntriesByType("navigation")[0]?.loadEventEnd ?? 0,` +
              ` crashScreen: Boolean(document.querySelector("[data-renderer-crash-screen]")),` +
              ` viteError: document.querySelector("vite-error-overlay")?.shadowRoot?.textContent?.trim().slice(0, 2000) ?? null` +
              ` }))()`,
            returnByValue: true,
          },
        }),
      );
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    }
    return result.result.value;
  } finally {
    await closeWebSocket(ws);
  }
}

export async function closeWebSocket(ws) {
  if (ws.readyState === WebSocket.CLOSED) return;
  await new Promise((done) => {
    const timeout = setTimeout(done, 250);
    ws.addEventListener(
      "close",
      () => {
        clearTimeout(timeout);
        done();
      },
      { once: true },
    );
    try {
      if (ws.readyState < WebSocket.CLOSING) ws.close();
    } catch {
      clearTimeout(timeout);
      done();
    }
  });
}

function notCdpError(message) {
  const error = new Error(message);
  error.code = "PORACODE_NOT_CDP";
  return error;
}
