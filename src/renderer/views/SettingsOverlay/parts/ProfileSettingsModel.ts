import type { HomeProfileDriver } from "@/shared/contracts";

export function slugifyProfileName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "profile"
  );
}

export function uniqueProfileId(name: string, existing: Readonly<Record<string, unknown>>): string {
  const base = slugifyProfileName(name);
  let candidate = base;
  let index = 2;
  while (existing[candidate]) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

export function defaultHomeProfileDir(driver: HomeProfileDriver, name: string): string {
  return `~/.poracode/${driver}-profiles/${slugifyProfileName(name)}`;
}
