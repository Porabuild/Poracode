import { Effect } from "effect";
import type { Endpoint } from "@opencode/client/effect/service";
import { LayerNode } from "@opencode/util/effect/layer-node";
import { Global } from "@opencode/util/global";
import { run, type TuiInput } from "@opencode/tui";
import { createTuiConfigStore } from "../config-store";

const tuiHome = process.env.PORACODE_TUI_HOME;
if (!tuiHome) throw new Error("PORACODE_TUI_HOME must point to an isolated TUI data directory");

const serverURL = process.env.PORACODE_TUI_DEV_SERVER_URL;
if (!serverURL) throw new Error("PORACODE_TUI_DEV_SERVER_URL must contain an OpenCode server URL");

const password = process.env.OPENCODE_PASSWORD;
const endpoint = {
  url: serverURL,
  ...(password
    ? {
        auth: {
          type: "basic" as const,
          username: "opencode",
          password,
        },
      }
    : {}),
} satisfies Endpoint;

const config = createTuiConfigStore(tuiHome);

// poracode: The protocol-only simulation slice does not include the optional Drive frontend.
delete process.env.OPENCODE_DRIVE;

const input: TuiInput = {
  app: { name: "poracode", version: "2.1.0", channel: "dev" },
  server: { endpoint },
  args: {},
  config,
  packages: {
    prepare: async () => {
      throw new Error("plugins are not supported");
    },
  },
  plugins: { local: false, server: false },
};

await Effect.runPromise(run(input).pipe(Effect.provide(LayerNode.compile(Global.node))));
