import type { ProjectLocation } from "@/shared/contracts";

// Windows drive and UNC paths compare case-insensitively with either slash;
// POSIX paths stay exact.
const comparable = (path: string) => {
  const slashed = path.replace(/\\/gu, "/").replace(/(?<=.)\/+$/u, "");
  return /^[A-Za-z]:\//u.test(slashed) || slashed.startsWith("//")
    ? slashed.toLowerCase()
    : slashed;
};

export const samePath = (left: string, right: string) => comparable(left) === comparable(right);

/** True when `child` is `parent` or a folder below it. */
export const pathContains = (parent: string, child: string) => {
  const base = comparable(parent);
  const target = comparable(child);
  return target === base || target.startsWith(base.endsWith("/") ? base : `${base}/`);
};

export const locationDirectory = (location: ProjectLocation) =>
  location.kind === "wsl" ? location.uncPath : location.path;
