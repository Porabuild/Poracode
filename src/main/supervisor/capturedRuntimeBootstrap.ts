interface BootstrapConfiguration {
  session: string;
  version: number;
  manifestVersion: number;
  sourceHash: string;
  settingsServiceVersion: number;
  entry: string;
  deadlineMs: number;
  manifestMaxBytes: number;
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

/** This function is serialized from the trusted host bundle. Keep every value
 * it uses local or a Node global: there is no mutable bootstrap file to load. */
function bootstrap(configuration: BootstrapConfiguration): void {
  const fs = process.getBuiltinModule("node:fs");
  const crypto = process.getBuiltinModule("node:crypto");
  const paths = process.getBuiltinModule("node:path");
  const urls = process.getBuiltinModule("node:url");
  const modules = process.getBuiltinModule("node:module");
  const sources = new Map<string, { source: string; format: "commonjs" | "module" }>();
  let root = "";
  let entry = "";
  let phase: "waiting" | "captured" | "active" | "failed" = "waiting";

  const disconnected = () => process.exit(0);
  process.on("disconnect", disconnected);
  const deadline = setTimeout(
    () => fail("Runtime capture deadline expired."),
    configuration.deadlineMs,
  );

  const send = (type: string, extra: Record<string, unknown> = {}) => {
    if (!process.connected || !process.send)
      throw new Error("Runtime capture parent disconnected.");
    process.send({
      type,
      version: configuration.version,
      session: configuration.session,
      ...extra,
    });
  };
  function fail(reason: string): void {
    if (phase === "failed") return;
    phase = "failed";
    clearTimeout(deadline);
    // Validation can fail before the application owns process shutdown. A short
    // IPC flush is bounded; no failed capture leaves a live child behind.
    const exit = () => process.exit(1);
    setTimeout(exit, 100);
    if (process.connected && process.send) {
      process.send(
        {
          type: "runtime-capture:failed",
          version: configuration.version,
          session: configuration.session,
          error: reason.slice(0, 300),
        },
        exit,
      );
    } else exit();
  }

  const ownPath = (absolute: string): boolean => {
    const relative = paths.relative(root, absolute);
    return (
      relative !== "" &&
      relative !== ".." &&
      !relative.startsWith(`..${paths.sep}`) &&
      !paths.isAbsolute(relative) &&
      !relative.split(paths.sep).some((part) => part.toLowerCase() === "node_modules")
    );
  };
  const canonicalCodeUrl = (url: string): string | undefined => {
    if (!url.startsWith("file:")) return undefined;
    const parsed = new URL(url);
    const path = urls.fileURLToPath(parsed);
    if (!ownPath(path)) return undefined;
    const canonical = urls.pathToFileURL(paths.resolve(path)).href;
    if (parsed.search || parsed.hash || canonical !== url)
      throw new Error("Runtime code URL is not canonical.");
    return canonical;
  };

  process.on("message", receive);
  function receive(input: unknown): void {
    try {
      if (!input || typeof input !== "object") throw new Error("Invalid runtime capture message.");
      const message = input as Record<string, unknown>;
      if (message.session !== configuration.session || message.version !== configuration.version)
        throw new Error("Runtime capture session/version differs.");
      if (message.type === "runtime-capture:activate") {
        if (phase !== "captured") throw new Error("Runtime code is not captured.");
        phase = "active";
        clearTimeout(deadline);
        process.off("message", receive);
        // The entry now owns disconnect/shutdown. An unconditional bootstrap
        // exit handler would bypass the supervisor's admitted-work drain.
        process.off("disconnect", disconnected);
        modules.createRequire(entry)(entry);
        send("runtime-capture:active");
        return;
      }
      if (message.type !== "runtime-capture:init" || phase !== "waiting")
        throw new Error("Runtime capture accepts exactly one initialization.");
      if (Buffer.byteLength(JSON.stringify(message), "utf8") > configuration.manifestMaxBytes)
        throw new Error("Runtime capture manifest exceeds its byte limit.");
      const manifest = message.manifest as Record<string, unknown> | undefined;
      if (
        !manifest ||
        manifest.version !== configuration.manifestVersion ||
        manifest.sourceHash !== configuration.sourceHash ||
        manifest.entry !== configuration.entry ||
        manifest.captureProtocolVersion !== configuration.version ||
        manifest.settingsServiceVersion !== configuration.settingsServiceVersion ||
        !Array.isArray(manifest.files)
      )
        throw new Error("Runtime capture declaration differs.");
      if (typeof message.root !== "string" || !paths.isAbsolute(message.root))
        throw new Error("Runtime capture root is invalid.");
      root = paths.resolve(message.root);
      if (manifest.files.length < 1 || manifest.files.length > configuration.maxFiles)
        throw new Error("Runtime capture file count exceeds its limit.");
      let total = 0;
      const declaredPaths = new Set<string>();
      for (const value of manifest.files) {
        const file = value as Record<string, unknown>;
        if (
          !file ||
          typeof file.path !== "string" ||
          file.path.length > 1024 ||
          // eslint-disable-next-line no-control-regex -- mirror the portable manifest path boundary
          /[\\%?#:*<>"|\u0000-\u0020]/u.test(file.path) ||
          paths.isAbsolute(file.path) ||
          /^[A-Za-z]:/u.test(file.path) ||
          file.path
            .split("/")
            .some(
              (part) =>
                !part || part === "." || part === ".." || part.toLowerCase() === "node_modules",
            ) ||
          !/\.(?:cjs|mjs|js)$/u.test(file.path) ||
          (file.format !== "commonjs" && file.format !== "module") ||
          (file.path.endsWith(".cjs") && file.format !== "commonjs") ||
          (file.path.endsWith(".mjs") && file.format !== "module") ||
          !Number.isSafeInteger(file.bytes) ||
          (file.bytes as number) < 0 ||
          (file.bytes as number) > configuration.maxFileBytes ||
          typeof file.sha256 !== "string" ||
          !/^[a-f0-9]{64}$/u.test(file.sha256)
        )
          throw new Error("Runtime capture file declaration is invalid.");
        total += file.bytes as number;
        if (total > configuration.maxTotalBytes)
          throw new Error("Runtime capture source exceeds its byte limit.");
        const foldedPath = file.path.toLowerCase();
        if (declaredPaths.has(foldedPath)) throw new Error("Duplicate runtime capture file.");
        declaredPaths.add(foldedPath);
        const path = paths.join(root, file.path);
        const url = urls.pathToFileURL(path).href;
        if (sources.has(url)) throw new Error("Duplicate runtime capture file.");
        // Do not block on a FIFO swapped in after the parent's preflight.
        const descriptor = fs.openSync(
          path,
          fs.constants.O_RDONLY | (process.platform === "win32" ? 0 : fs.constants.O_NONBLOCK),
        );
        let bytes: Buffer;
        try {
          const stat = fs.fstatSync(descriptor);
          if (!stat.isFile()) throw new Error("Runtime source is not a regular file.");
          if (stat.size !== file.bytes) throw new Error("Runtime source size differs.");
          const buffer = Buffer.alloc((file.bytes as number) + 1);
          let offset = 0;
          while (offset < buffer.length) {
            const read = fs.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
            if (read === 0) break;
            offset += read;
          }
          bytes = buffer.subarray(0, offset);
        } finally {
          fs.closeSync(descriptor);
        }
        if (
          bytes.length !== file.bytes ||
          crypto.createHash("sha256").update(bytes).digest("hex") !== file.sha256
        )
          throw new Error("Runtime source digest differs.");
        sources.set(url, {
          source: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          format: file.format,
        });
      }
      entry = paths.join(
        root,
        `${configuration.entry}.${configuration.entry.endsWith("Worker") ? "mjs" : "cjs"}`,
      );
      if (!sources.has(urls.pathToFileURL(entry).href))
        throw new Error("Runtime capture entry is missing.");
      modules.registerHooks({
        resolve(specifier, context, nextResolve) {
          let url: string | undefined;
          let requestedOwnCode = false;
          if (specifier.startsWith("file:")) url = specifier;
          else if (paths.isAbsolute(specifier)) url = urls.pathToFileURL(specifier).href;
          else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:"))
            url = new URL(specifier, context.parentURL).href;
          if (url) {
            const canonical = canonicalCodeUrl(url);
            requestedOwnCode = canonical !== undefined;
            if (canonical && sources.has(canonical)) return { url: canonical, shortCircuit: true };
            if (canonical && /\.(?:cjs|mjs|js)$/u.test(urls.fileURLToPath(canonical)))
              throw new Error("Undeclared runtime application code.");
          }
          const resolved = nextResolve(specifier, context);
          const canonical = canonicalCodeUrl(resolved.url);
          if (
            requestedOwnCode &&
            !canonical &&
            resolved.url.startsWith("file:") &&
            /\.(?:cjs|mjs|js)$/u.test(urls.fileURLToPath(resolved.url))
          )
            throw new Error("Undeclared runtime application code.");
          if (
            canonical &&
            !sources.has(canonical) &&
            /\.(?:cjs|mjs|js)$/u.test(urls.fileURLToPath(canonical))
          )
            throw new Error("Undeclared runtime application code.");
          return resolved;
        },
        load(url, context, nextLoad) {
          const canonical = canonicalCodeUrl(url);
          const captured = canonical ? sources.get(canonical) : undefined;
          if (captured) return { ...captured, shortCircuit: true };
          if (canonical && /\.(?:cjs|mjs|js)$/u.test(urls.fileURLToPath(canonical)))
            throw new Error("Undeclared runtime application code.");
          return nextLoad(url, context);
        },
      });
      phase = "captured";
      // Keep the map and hook for the process lifetime, including lazy imports.
      send("runtime-capture:ready", { sourceBytes: total });
    } catch (error) {
      fail(error instanceof Error ? error.message : "Runtime capture failed.");
    }
  }
}

export function createCapturedRuntimeBootstrap(configuration: BootstrapConfiguration): string {
  return `(${bootstrap.toString()})(${JSON.stringify(configuration)})`;
}
