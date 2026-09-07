import { spawn, execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { assertSessionRootOutsideRepo } from "../.agents/skills/interactive-testing/scripts/poracode-debug-session.mjs";

const exec = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");
const helpers = join(repoRoot, ".agents/skills/interactive-testing/scripts");
const root = resolve(
  process.argv[2] ?? join(homedir(), ".poracode-smoke", `startup-${Date.now()}`),
);
const warm = process.argv[3] === "--warm";
const reportName = warm ? "startup-warm" : "startup";
const sessionFile = join(root, "session.json");
const cdp = join(helpers, "poracode-cdp.mjs");
assertSessionRootOutsideRepo(root, repoRoot);
await mkdir(root, { recursive: true });

// The managed launcher invokes the actual `pnpm dev` pipeline and owns teardown.
const startedAt = Date.now();
const lines = [];
const child = spawn(
  process.execPath,
  [
    join(helpers, "run-poracode-smoke.mjs"),
    "--launch-only",
    "--new",
    "--mode",
    "real",
    "--root",
    root,
    ...(warm ? ["--reuse-fixture"] : []),
  ],
  {
    cwd: repoRoot,
    env: { ...process.env, PORACODE_PROFILE_STARTUP: "1" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let launcherExited = false;
const exited = new Promise((done) =>
  child.once("close", () => {
    launcherExited = true;
    done();
  }),
);
let ready;
let failed;
const readiness = new Promise((done, reject) => {
  ready = done;
  failed = reject;
});
child.once("error", failed);
child.once("close", (code) =>
  failed(new Error(`Launcher exited before profiling completed: ${code}`)),
);
for (const stream of [child.stdout, child.stderr]) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const complete = pending.split(/\r?\n/);
    pending = complete.pop();
    for (const text of complete) {
      lines.push({ elapsedMs: Date.now() - startedAt, text });
      if (text.startsWith("Debug session READY:")) ready();
    }
  });
}
const deadline = setTimeout(() => failed(new Error("Startup exceeded 180 seconds")), 180_000);
async function action(...args) {
  return exec(
    process.execPath,
    [cdp, ...args, "--session", sessionFile, "--commandTimeoutMs", "120000"],
    {
      cwd: repoRoot,
      windowsHide: true,
      timeout: 130_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
}
let failure;
try {
  await readiness;
  const { stdout } = await action(
    "eval",
    `new Promise((resolve, reject) => {
    const deadline = performance.now() + 110000;
    const check = () => {
      const input = document.querySelector('[contenteditable="true"][role="textbox"]');
      const agents = window.__poracodeDev.stores.agentStatuses.getState();
      if (input && input.getBoundingClientRect().width > 0 && agents.windowsLoaded) {
        resolve({ timeOrigin: performance.timeOrigin, usableAt: performance.now(),
          view: window.__poracodeDev.stores.app.getState().view.kind,
          installedProviders: agents.agentStatuses.filter(s => s.installed).length,
          entries: performance.getEntries().filter(e => e.name.startsWith('poracode:')).map(e => e.toJSON()),
          resources: performance.getEntriesByType('resource').map(e => ({ name: e.name, start: e.startTime, duration: e.duration })) });
      } else if (performance.now() > deadline) reject(new Error('No usable composer with discovered providers'));
      else setTimeout(check, 50);
    }; check();
  })`,
    "--await",
  );
  const renderer = JSON.parse(stdout);
  await action("type", '[contenteditable="true"][role="textbox"]', "startup input probe");
  const input = await action(
    "eval",
    `document.querySelector('[contenteditable="true"][role="textbox"]').textContent.includes('startup input probe')`,
  );
  if (JSON.parse(input.stdout) !== true) throw new Error("Composer did not accept input");
  const inputVerifiedAt = Date.now();
  await action("shot", "-", join(root, `${reportName}.png`));
  const session = JSON.parse(await readFile(sessionFile, "utf8"));
  const report = {
    startedAt,
    pnpmStartedAt: session.startedAt,
    usableFromPnpmMs: renderer.timeOrigin + renderer.usableAt - Date.parse(session.startedAt),
    inputVerifiedFromPnpmMs: inputVerifiedAt - Date.parse(session.startedAt),
    endpoint:
      "visible composer accepts input; native provider statuses loaded (no provider turn sent)",
    renderer,
    lines,
  };
  await writeFile(join(root, `${reportName}.json`), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      report: join(root, `${reportName}.json`),
      usableFromPnpmMs: report.usableFromPnpmMs,
    }),
  );
} catch (error) {
  failure = error;
} finally {
  clearTimeout(deadline);
  await writeFile(join(root, `${reportName}.log.json`), JSON.stringify(lines, null, 2));
  if (!launcherExited) {
    await action("reset").catch(() => {});
    try {
      await action("stop");
    } catch (error) {
      failure ??= error;
      // The owner watches this channel even if CDP or the manifest is unavailable.
      const requestStop = () => writeFile(join(root, "stop-request.json"), "{}\n").catch(() => {});
      const stopRequests = setInterval(() => {
        void requestStop();
      }, 250);
      let exitDeadline;
      try {
        await requestStop();
        await Promise.race([
          exited,
          new Promise((_, reject) => {
            exitDeadline = setTimeout(
              () => reject(new Error(`Launcher ${child.pid} did not stop`)),
              30_000,
            );
          }),
        ]);
      } catch (teardownError) {
        console.error(teardownError);
        if (process.platform === "win32") {
          await exec("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            timeout: 10_000,
          });
        } else {
          child.kill("SIGTERM");
        }
      } finally {
        clearInterval(stopRequests);
        clearTimeout(exitDeadline);
      }
    }
  }
}
if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
