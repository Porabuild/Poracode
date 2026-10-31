import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";
import babel from "@rolldown/plugin-babel";
import { linguiTransformerBabelPreset } from "@lingui/vite-plugin";

const workerPath = resolve(import.meta.dirname, "vite-lingui-macro-worker.mjs");
const filename = resolve(import.meta.dirname, "../src/renderer/__fixture__/greeting.tsx");
const source = `import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
export const label = msg\`Hello \${name}\`;
export function Greeting() {
  return <Trans>Welcome back</Trans>;
}
`;

function transformInWorker(code) {
  const worker = new Worker(workerPath);
  return new Promise((resolveReply, reject) => {
    worker.once("message", (reply) => {
      void worker.terminate();
      resolveReply(reply);
    });
    worker.once("error", reject);
    worker.postMessage({ id: 1, code, filename });
  });
}

// The production path: the same plugin instance vite.config.ts builds with.
async function transformWithRolldownBabel(code) {
  const plugin = await babel({ presets: [linguiTransformerBabelPreset()] });
  plugin.configResolved({ command: "build", isProduction: true });
  plugin.applyToEnvironment({ name: "client", config: { consumer: "client" } });
  return plugin.transform.handler.call(
    { environment: { name: "client" }, error: (error) => assert.fail(error.message) },
    code,
    filename,
    { moduleType: "tsx" },
  );
}

await test("matches @rolldown/plugin-babel's Lingui output, source map included", async () => {
  const [reply, expected] = await Promise.all([
    transformInWorker(source),
    transformWithRolldownBabel(source),
  ]);

  assert.equal(reply.error, undefined);
  assert.equal(reply.code, expected.code);
  assert.deepEqual(reply.map, expected.map);
  assert.doesNotMatch(reply.code, /@lingui\/(?:core|react)\/macro/);
});

await test("reports Babel errors with their location instead of crashing", async () => {
  const reply = await transformInWorker('import { msg } from "@lingui/core/macro";\nmsg`${;\n');

  assert.equal(reply.code, undefined);
  assert.match(reply.error.message, /Unexpected token/);
  assert.equal(typeof reply.error.pos, "number");
});
