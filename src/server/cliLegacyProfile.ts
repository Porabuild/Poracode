import { realpathSync } from "node:fs";
import { join } from "node:path";
import { readServiceRegistration, serviceRegistrationId } from "./serverServiceRegistration";
import { readStandaloneRuntimeMarker } from "../../scripts/server-release-install.mjs";
import { readCliInstallMigration } from "./cliInstallMigrationJournal";
import { isNightlyRelease } from "./cliReleaseVersion";

/** The completed journal binds the old profile to the exact migrated registration. */
export function readLegacyServiceProfile(prefix: string): string | undefined {
  const marker = readCliInstallMigration(prefix);
  if (!marker || marker.phase !== "complete") return undefined;
  const registration = readServiceRegistration(prefix);
  if (!registration) return undefined;
  if (
    registration.state !== "installed" ||
    registration.installPrefix !== realpathSync(prefix) ||
    marker.newPrefix !== registration.installPrefix ||
    registration.profileNamespace !== marker.profile ||
    registration.registrationId !== marker.registrationId ||
    registration.registrationNonce !== marker.newNonce ||
    registration.account.kind !== marker.account.kind ||
    registration.account.id !== marker.account.id
  )
    return undefined;
  return marker.profile;
}

/** Preserve a pre-migration nightly service that explicitly persisted the old default profile. */
export function readPreMigrationNightlyProfile(
  prefix: string,
  stableProfile: string,
): string | undefined {
  const registration = readServiceRegistration(prefix);
  if (
    !registration ||
    registration.state !== "installed" ||
    registration.profileNamespace !== stableProfile
  )
    return undefined;
  if (
    registration.installPrefix !== realpathSync(prefix) ||
    registration.registrationId !== serviceRegistrationId(stableProfile, registration.account)
  )
    return undefined;
  const marker = readStandaloneRuntimeMarker(join(prefix, "current"));
  if (!marker || !isNightlyRelease(marker.version)) return undefined;
  return registration.profileNamespace;
}
