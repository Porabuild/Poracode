// The Lingui Vite plugin compiles `.po` catalog imports into runtime message
// modules. Declare the module shape so `tsgo`/`tsc` accept the imports.
declare module "*.po" {
  import type { Messages } from "@lingui/core";

  export const messages: Messages;
}
