const batchSize = 40;

export default {
  "*.{js,jsx,ts,tsx,mjs,cjs}": (filenames) => {
    const commands = [];
    for (let i = 0; i < filenames.length; i += batchSize) {
      const batch = filenames
        .slice(i, i + batchSize)
        .map((f) => `"${f}"`)
        .join(" ");
      // The pinned preview uses this context to bypass package-script shadowing.
      commands.push(
        `cross-env npm_lifecycle_event=lint bun lint --type-aware --fix --deny-warnings ${batch}`,
      );
      commands.push(`cross-env npm_lifecycle_event=fmt bun fmt ${batch}`);
    }
    return commands;
  },
  "*.{json,jsonc,css,md,html,yml,toml}": (filenames) => {
    const commands = [];
    for (let i = 0; i < filenames.length; i += batchSize) {
      const batch = filenames
        .slice(i, i + batchSize)
        .map((f) => `"${f}"`)
        .join(" ");
      commands.push(`cross-env npm_lifecycle_event=fmt bun fmt ${batch}`);
    }
    return commands;
  },
};
