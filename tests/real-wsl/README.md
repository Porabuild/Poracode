# Real Windows/WSL qualification lane

Fail-closed Vitest suite that qualifies Poracode's WSL production seams against
**real WSL2 distros** — including a distro whose name carries spaces and
non-ASCII characters — provisioned by `scripts/ci-windows-wsl-lab.mjs`.

## What is qualified

| Scenario                                                         | Production seams used                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Cold boot, stop/restart                                          | `runtime/probe.ts` bootstrap probes                                     |
| Unicode/space distro: wslpath + UNC round-trips                  | `projectLocation.ts`, `shared/wsl.ts` (`toWslUncPath`), staging service |
| Host reachability NAT / mirrored                                 | `hostAccess.ts` (`computeWslHostAccess`), live TCP probe from the guest |
| Concurrent installs / single-flight                              | `runtime/index.ts` (`resolveNodeForDistro`), `singleFlight.ts`, staging |
| Stalled distro: bounded failure, cross-distro progress, recovery | `staging/service.ts` (per-distro worker, deadlines), `wsl --terminate`  |

## Gating (fail-closed)

- No `PORACODE_WSL_LAB` env → every test **skips** (macOS/Linux dev machines,
  the normal unit shard).
- `PORACODE_WSL_LAB=1` set → the suite **fails** instead of skipping when the
  host is not Windows, the lab manifest is missing or schema-drifted, the
  manifest records a failed provision, or NAT mode was provisioned without the
  guest-ingress firewall rule. A qualification run cannot go green because its
  lab was broken.

## Run

```sh
# One-time (Windows host):
node scripts/ci-windows-wsl-lab.mjs provision --mode nat --with-sshd \
  --rootfs-sha256 <64-hex Ubuntu rootfs digest> \
  --out .tmp/windows-wsl-lab --state .tmp/windows-wsl-lab-state

# The suite (skips cleanly without the env flag):
PORACODE_WSL_LAB=1 pnpm exec vitest run --configLoader runner \
  --config tests/real-wsl/vitest.config.ts

# Remove only what the lab created:
node scripts/ci-windows-wsl-lab.mjs cleanup --state .tmp/windows-wsl-lab-state
```

CI (`.github/workflows/windows-wsl-qualification.yml`) runs the same sequence:
NAT + real-sshd leg scheduled/manual on hosted `windows-latest`, mirrored leg
manual-only on the labeled self-hosted Windows 11 runner
(`[self-hosted, Windows, windows11, poracode-wsl-mirrored]`). Repository
variable `WSL_ROOTFS_SHA256` must contain the reviewed Ubuntu 24.04 WSL rootfs
digest; the jobs fail before provisioning if it is absent or malformed.

## External limitations (do not over-claim)

- **Hosted `windows-latest` (Windows Server) never proves mirrored
  networking.** `networkingMode=mirrored` is a Windows 11 client feature; only
  the manual self-hosted leg produces mirrored evidence.
- The hosted leg runs as administrator and adds a scoped firewall rule
  (`Poracode WSL lab guest ingress`) so the guest→host reachability check can
  reach a host-bound listener over the NAT vSwitch. Without it the lab refuses
  to qualify in NAT mode (`--no-guest-ingress` is available for dev setup, and
  the fail-closed suite then rejects that manifest by design).
- The concurrent-install scenario downloads the pinned Node tarball from
  nodejs.org; it is labeled `(network)` for that reason.
- The lab's ephemeral sshd key lives only in the state dir; nothing private is
  logged or archived — evidence JSONs store fingerprints and redacted paths.
