// Worker for vite.config.ts's Lingui macro pool (dev server and builds). Applies the
// same Babel transform as @rolldown/plugin-babel with the Lingui preset, off the
// main thread.
import { parentPort } from "node:worker_threads";
import { transformAsync } from "@babel/core";

const PARSER_PLUGINS = [
  [/\.jsx(?:$|\?)/, ["jsx"]],
  [/\.ts(?:$|\?)/, ["typescript"]],
  [/\.tsx(?:$|\?)/, ["typescript", "jsx"]],
];

function transformMacros({ code, filename }) {
  return transformAsync(code, {
    babelrc: false,
    configFile: false,
    filename,
    sourceMaps: true,
    parserOpts: {
      sourceType: "module",
      allowAwaitOutsideFunction: true,
      plugins: PARSER_PLUGINS.find(([test]) => test.test(filename))?.[1] ?? [],
    },
    plugins: ["@lingui/babel-plugin-lingui-macro"],
  });
}

parentPort.on("message", (message) => {
  transformMacros(message).then(
    (result) =>
      parentPort.postMessage({
        id: message.id,
        code: result?.code ?? null,
        map: result?.map ?? null,
      }),
    (error) =>
      parentPort.postMessage({
        id: message.id,
        error: {
          message: error instanceof Error ? error.message : String(error),
          loc: error?.loc,
          pos: error?.pos,
          code: error?.code,
        },
      }),
  );
});
