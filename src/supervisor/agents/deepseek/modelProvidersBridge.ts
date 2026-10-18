// Private one-shot plugin, loaded by the installed Harness into its ACP profile.
// Protocol 1 is staged with its caller on every invocation; neither side persists it.
export const DEEPSEEK_MODEL_PROVIDERS_BRIDGE = String.raw`
import { createHash } from "node:crypto";
export const name = "poracode-model-providers";
export const inject = ["settings", "credentials", "llm"];
const ns = "llm-pi-ai";
const refFor = (id, config) => config.apiKeyEnv || id.toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_API_KEY";
export function apply(ctx) {
  // Returning first allows Loader to settle before inspecting or editing forms.
  void ctx.root.loader.await().then(async () => {
    let result;
    try {
      let input = "";
      for await (const chunk of process.stdin) input += chunk;
      const request = JSON.parse(input);
      const describe = () => ctx.settings.describe({ redactSecrets: true }).find((entry) => entry.ns === ns);
      const fingerprint = (form) => createHash("sha256").update(JSON.stringify([form.value, form.base, form.user])).digest("hex");
      let form = describe();
      if (!form) throw new Error("unavailable");
      const directory = ctx.llm.listConfigurableProviders().filter((entry) => entry.settingsNs === ns);
      if (request.action !== "list") {
        if (request.revision !== fingerprint(form)) {
          result = { ok: false, reason: "conflict" };
        } else {
          const id = request.action === "save" ? request.provider.id : request.providerId;
          const current = form.value.providers?.[id];
          if (request.action === "save" && request.create === Boolean(current)) throw new Error("route changed");
          const catalogEntry = directory.find((entry) => entry.provider === id && !entry.declared);
          const custom = !catalogEntry;
          if (request.action === "save" && request.create && custom && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) throw new Error("invalid route id");
          let ops;
          if (request.action === "remove") {
            if (!current || form.base.providers?.[id]) throw new Error("inherited");
            ops = [{ op: "unset", path: ["providers", id] }];
          } else {
            const provider = request.provider;
            if (custom && (!provider.baseURL || !provider.modelIds.length)) throw new Error("incomplete");
            const fields = {
              displayName: provider.name,
              baseURL: provider.baseURL,
              ...(custom ? { api: provider.protocol } : {}),
              ...(request.apiKey ? { apiKeyEnv: refFor(id, current || {}) } : {}),
            };
            ops = Object.entries(fields).flatMap(([key, value]) => value
              ? [{ op: "set", path: ["providers", id, key], value }]
              : current && Object.hasOwn(current, key) ? [{ op: "unset", path: ["providers", id, key] }] : []);
            if (provider.modelIds.length) ops.push({
              op: "set", path: ["providers", id, "models"],
              value: provider.modelIds.map((model) => current?.models?.find((entry) => entry.id === model) || { id: model }),
            });
            else if (current?.models) ops.push({ op: "unset", path: ["providers", id, "models"] });
            if (!current && !ops.length) ops.push({ op: "set", path: ["providers", id], value: {} });
          }
          try {
            await ctx.settings.mutate(ns, ops, form.revision);
          } catch (error) {
            result = { ok: false, reason: error?.name === "SettingsConflictError" ? "conflict" : "rejected" };
          }
          // The native form commits before the write-only credential, just as
          // Harness's own Models page does. Retrying preserves the saved route.
          if (!result && request.action === "save" && request.apiKey) {
            try { await ctx.credentials.set(refFor(id, current || {}), request.apiKey); }
            catch { result = { ok: false, reason: "credential" }; }
          }
        }
      }
      if (!result) {
        form = describe();
        const providers = await Promise.all(Object.entries(form.value.providers || {}).map(async ([id, config]) => {
          const entry = directory.find((item) => item.provider === id);
          const credential = await ctx.credentials.describe(refFor(id, config));
          return {
            id, name: config.displayName || entry?.displayName || id,
            baseURL: config.baseURL || "", protocol: config.api || "openai-completions",
            modelIds: (config.models || []).map((model) => model.id),
            custom: !entry || entry.declared, removable: !form.base.providers?.[id],
            credentialConfigured: credential.configured,
          };
        }));
        result = { ok: true, revision: fingerprint(form), providers,
          catalog: directory.filter((entry) => !entry.declared).map((entry) => ({
            id: entry.provider, name: entry.displayName || entry.provider, baseURL: entry.defaultBaseURL || "",
          })),
        };
      }
    } catch { result = { ok: false, reason: "rejected" }; }
    process.stdout.write("\nPORACODE_MODEL_PROVIDERS_V1=" + JSON.stringify(result) + "\n", () => process.exit(0));
  }).catch(() => process.exit(1));
}
`;
