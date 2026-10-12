import type { RealHostHandle } from "../harness/realHost.ts";
import { acquireDeviceCredential, createProfileClients } from "./profileClientFactory.ts";
import { ProfileClient } from "./concurrencyProfileClient.ts";
import { fetchGitAdmissionUsage, type GitBurstAdmissionUsage } from "./gitBurstDiagnostics.ts";
import type { WorkloadProject } from "./sharedHostWorkload.ts";

/**
 * One authenticated session of the §4 Git-burst cell against the real host.
 *
 * The burst principals share ONE device credential (they may exhaust that
 * principal's own B3 budget — that is part of what the cell measures);
 * navigation and control are measured on a separate authenticated control
 * principal opened with its own credential. Admission snapshots are
 * point-in-time reads of the loopback `/metrics` route.
 */
export class GitBurstSession {
  private sharedAccessToken: string | undefined;
  private boundProject: WorkloadProject | undefined;

  constructor(private readonly host: RealHostHandle) {}

  /** The disposable per-run data root the real host was started with. */
  get baseDir(): string {
    return this.host.baseDir;
  }

  /** Opens `size` burst clients sharing one device credential (acquired on
   * first use, named after that call's prefix). */
  async openBurstClients(size: number, prefix: string): Promise<ProfileClient[]> {
    if (this.sharedAccessToken === undefined) {
      const credential = await acquireDeviceCredential(this.host, `${prefix}-owner`);
      this.sharedAccessToken = credential.accessToken;
    }
    const opened = await createProfileClients(this.host, size, prefix, this.sharedAccessToken);
    return opened.clients;
  }

  /** One client on its OWN device credential: the §4 control principal. */
  async openControlClient(prefix: string): Promise<ProfileClient> {
    const credential = await acquireDeviceCredential(this.host, prefix);
    return ProfileClient.create({
      handle: this.host,
      label: prefix,
      accessToken: credential.accessToken,
    });
  }

  /** One fresh admission snapshot for crisp point-in-time asserts (long-permit
   * visibility, drain). Window evidence uses before/after cumulative diffs. */
  async gitDiagnostics(): Promise<GitBurstAdmissionUsage> {
    return fetchGitAdmissionUsage(this.host.httpBaseUrl);
  }

  /** Binds the seeded fixture project discovered during bootstrap. */
  bindFixtureProject(project: WorkloadProject): void {
    this.boundProject = project;
  }

  fixtureProject(): WorkloadProject {
    if (!this.boundProject) {
      throw new Error("fixture project was not discovered");
    }
    return this.boundProject;
  }

  fixtureProjectLocation(): { kind: "posix"; path: string } {
    return { kind: "posix", path: this.fixtureProject().locationPath };
  }
}
