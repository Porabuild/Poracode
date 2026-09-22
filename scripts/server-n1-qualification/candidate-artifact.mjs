/**
 * Candidate artifact + repository resolution for the published N-1 gate:
 * reading the candidate version straight out of its tarball and resolving
 * the GitHub `owner/name` repository to qualify against.
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Read package.json out of the candidate tarball without extracting it. */
export function readCandidateVersionFromTarball(tarball) {
  for (const member of ["package.json", "./package.json"]) {
    const run = spawnSync("tar", ["-xzOf", tarball, member], {
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (run.status === 0 && run.stdout) {
      const parsed = JSON.parse(run.stdout);
      if (typeof parsed.version === "string" && parsed.version.length > 0) return parsed.version;
    }
  }
  const failure = new Error(
    `candidate tarball ${tarball} carries no readable package.json version`,
  );
  failure.code = "CANDIDATE_INVALID";
  throw failure;
}

export function resolveRepo(options) {
  if (options.repo) return options.repo;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const remote = spawnSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
    cwd: REPO_ROOT,
  });
  const url = (remote.stdout ?? "").trim();
  const ssh = url.match(/^git@[^:]+:([^/]+)\/(.+?)(?:\.git)?$/u);
  const https = url.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/u);
  const match = ssh ?? https;
  if (match) return `${match[1]}/${match[2]}`;
  throw new Error(
    "cannot resolve the GitHub repository: pass --repo owner/name or set GITHUB_REPOSITORY",
  );
}
