import { fork } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { copyFile, mkdir, mkdtemp, realpath, rm, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { lock } from "proper-lockfile";
import { NativeReloadQueue } from "./native-dev-lib.mjs";
import {
  runtimeConfigurationFiles,
  runtimeSourceRoots,
} from "../src/build/runtimeSourceDeclaration.ts";

const workerPath = resolve(import.meta.dirname, "../src/build/devRuntimeBuild.ts");
const configurationFiles = new Set(runtimeConfigurationFiles);

export async function watchRuntime({
  root = process.cwd(),
  beforePublish = async () => {},
  onPublished = async () => {},
  onError = (error) => console.error(`[dev-runtime] ${error.message}`),
} = {}) {
  root = await realpath(root);
  const buildRoot = join(root, ".tmp", "dev-runtime");
  await mkdir(buildRoot, { recursive: true });
  const release = await lock(buildRoot);

  let closed = false;
  let revision = 0;
  let worker;
  let metadata = new Map();
  const changes = new Set();
  const watchers = [];
  let resolveReady;
  let rejectReady;
  const ready = new Promise((done, reject) => {
    resolveReady = done;
    rejectReady = reject;
  });
  void ready.catch(() => {});
  const queue = new NativeReloadQueue({
    debounceMs: 75,
    onError,
    reload: async () => {
      if (closed) return;
      const currentRevision = revision;
      const changedPaths = [...changes];
      const rebuildAll =
        metadata.size === 0 ||
        changedPaths.some((path) => configurationFiles.has(path) || path.startsWith("src/build/"));
      const selected = rebuildAll
        ? []
        : [...metadata.values()]
            .filter(
              (entry) =>
                entry.runtimeDeclaration ||
                changedPaths.some((path) => {
                  const absolute = resolve(root, path);
                  return entry.inputs.some(
                    (input) => absolute === input || absolute.startsWith(input + sep),
                  );
                }),
            )
            .map((entry) => entry.id);
      const started = performance.now();
      // A previous build can remove the owned root while this reload is queued.
      await mkdir(buildRoot, { recursive: true });
      const staging = await mkdtemp(join(buildRoot, "build-"));
      if (dirname(staging) !== buildRoot)
        throw new Error("Development staging directory is outside its owned build root.");
      try {
        console.log(`[dev-runtime] building ${rebuildAll ? "all entries" : selected.join(", ")}`);
        const entries = await new Promise((done, reject) => {
          let message;
          const child = fork(workerPath, [root, staging, JSON.stringify(selected)], {
            cwd: root,
            execArgv: [],
            env: { ...process.env, NODE_ENV: "development" },
            stdio: ["ignore", "inherit", "inherit", "ipc"],
            windowsHide: true,
          });
          worker = child;
          child.on("message", (value) => {
            message = value;
          });
          child.once("error", reject);
          child.once("exit", (code, signal) => {
            if (worker === child) worker = undefined;
            if (code !== 0)
              reject(new Error(`Build failed (${signal ?? code}); waiting for the next change.`));
            else if (message?.version !== 1 || !Array.isArray(message.entries))
              reject(
                new Error("Unsupported development build result; outputs were not published."),
              );
            else done(message.entries);
          });
        });
        if (closed || revision !== currentRevision) return;
        await beforePublish();
        if (closed || revision !== currentRevision) return;

        const nextMetadata = new Map(metadata);
        for (const entry of entries) nextMetadata.set(entry.id, entry);
        const nextFiles = new Set([...nextMetadata.values()].flatMap((entry) => entry.files));
        const outputRoot = join(root, "dist", "main");
        for (const entry of entries) {
          for (const file of entry.files) {
            const target = resolve(outputRoot, file);
            const local = relative(outputRoot, target);
            if (local === ".." || local.startsWith(".." + sep) || isAbsolute(local))
              throw new Error("Development build output escapes dist/main.");
            await mkdir(dirname(target), { recursive: true });
            await copyFile(resolve(staging, file), target);
          }
        }
        const previousFiles = new Set([...metadata.values()].flatMap((entry) => entry.files));
        for (const file of previousFiles)
          if (!nextFiles.has(file)) await unlink(join(outputRoot, file));
        metadata = nextMetadata;
        if (closed || revision !== currentRevision) return;
        await onPublished({
          entries,
          changedPaths,
          isCurrent: () => !closed && revision === currentRevision,
        });
        if (closed || revision !== currentRevision) return;
        changes.clear();
        console.log(
          `[dev-runtime] ready ${entries.length} entries in ${Math.round(performance.now() - started)}ms`,
        );
        resolveReady();
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    },
  });

  const notify = (path) => {
    revision++;
    changes.add(path);
    queue.enqueue(path);
  };
  const addWatcher = (directory, recursive, include) => {
    const watcher = watch(directory, { recursive }, (event, filename) => {
      if (!filename) return notify("tsdown.config.ts");
      const path = relative(root, resolve(directory, filename.toString())).split(sep).join("/");
      if (include(path, event)) notify(path);
    });
    watcher.on("error", onError);
    watchers.push(watcher);
  };
  const close = async () => {
    if (closed) return;
    closed = true;
    for (const watcher of watchers) watcher.close();
    const child = worker;
    child?.kill("SIGTERM");
    let forceTimer;
    try {
      // A compiler that ignores SIGTERM must not keep the dev process, or CI, alive.
      await Promise.race([
        queue.close(),
        new Promise((done) => {
          forceTimer = setTimeout(done, 2_000);
        }),
      ]);
    } finally {
      clearTimeout(forceTimer);
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await Promise.race([
          new Promise((done) => child.once("exit", done)),
          new Promise((done) => setTimeout(done, 1_000)),
        ]);
      }
      rejectReady(new Error("Development runtime stopped before its first successful build."));
      await release();
    }
  };
  try {
    for (const sourceRoot of runtimeSourceRoots) {
      addWatcher(join(root, sourceRoot), true, (path, event) => {
        if (
          path
            .split("/")
            .some(
              (name) =>
                ["node_modules", "fixtures", "__fixtures__", "__tests__"].includes(name) ||
                /(?:\.test\.|\.test$|testFixtures)/u.test(name),
            )
        )
          return false;
        return (
          event === "rename" ||
          /\.(?:[cm]?tsx?|[cm]?js|json)$/u.test(path) ||
          /\/(?:plugin|forward-runtime)\//u.test(path)
        );
      });
    }
    addWatcher(join(root, "resources", "plugins"), true, () => true);
    for (const directory of new Set(runtimeConfigurationFiles.map((path) => dirname(path))))
      addWatcher(resolve(root, directory), false, (path) => configurationFiles.has(path));
    for (const directory of ["dist/electron-native", "dist/server-native"])
      if (existsSync(join(root, directory))) addWatcher(join(root, directory), true, () => true);
    notify("initial");
  } catch (error) {
    await close();
    throw error;
  }

  return {
    ready,
    close,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const runtime = await watchRuntime();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.once(signal, () => {
      void runtime.close().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    });
  await runtime.ready;
}
