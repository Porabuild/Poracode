// pnpm's ESM resolver bridge is inherited by nested pnpm commands. Keeping an
// explicit ESM pnpmfile prevents pnpm 11 from probing a missing optional file
// through that loader, which would otherwise turn the probe into a hard error.
export const hooks = {};
