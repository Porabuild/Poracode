declare module "@opencode/simulation/frontend" {
  import type { CliRenderer, CliRendererConfig } from "@opentui/core";
  import type { Effect } from "effect";

  // poracode: The optional drive frontend is not part of the protocol-only simulation slice.
  export const Drive: {
    create(options: CliRendererConfig, version: string): Effect.Effect<CliRenderer>;
  };
}
