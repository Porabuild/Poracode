// Root workspace scripts pass pnpm's ESM resolver bridge to nested website
// commands. An explicit pnpmfile keeps pnpm 11's optional-file probe from
// becoming a hard error under that inherited loader.
export const hooks = {};
