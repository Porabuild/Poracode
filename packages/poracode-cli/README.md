# poracode

Run the Poracode standalone server from a version-pinned, checksum-verified
runtime artifact.

```sh
npx poracode@<version>                 # start the foreground server
npx poracode@<version> pair --json     # request a pairing URL from the running owner
npx poracode@<version> doctor --json   # read-only diagnostics
npx poracode@<version> --version
```

Pin the version: there is no mutable `latest` runtime URL and no unverified
download path.

## How it works

- This package contains **no server code and no native modules**. It resolves
  the runtime tarball pinned to its own version in `runtime-manifest.json`,
  downloads it from the matching GitHub release, verifies its sha256, installs
  it atomically into a versioned cache, and then executes the artifact's server
  CLI.
- The cache lives at `<PORACODE_BASE_DIR or ~/.poracode>/runtime/<version>/<target>`,
  separate from profile data. A verified install is reused without network
  access. `PORACODE_RUNTIME_CACHE_DIR` overrides the cache root.
- A missing target, a checksum mismatch, or an unreachable release fails with
  an actionable error. The manifest in a published version lists exactly the
  target keys its release matrix qualified — the defined standalone machine
  families are `darwin-arm64`, `darwin-x64`, `linux-x64`, and `linux-arm64` —
  and anything else fails closed.
- `PORACODE_SERVER_TARBALL` plus `PORACODE_SERVER_TARBALL_SHA256` install a
  local verified tarball instead of downloading (air-gapped or pre-release use).

## Commands

All arguments after the executable are forwarded to the pinned runtime, so the
server commands — `serve`, `pair`, `status`, `doctor`, `backup`, `init-tls`,
`activate`, and `upgrade` — behave exactly as documented for the standalone
server. `poracode --help` lists them.

## Status

The release workflow publishes this package only when npm publishing is enabled
for the repository. Until a release has published it, `npx poracode@<version>`
is not available from the registry; install the release artifact instead. The
operator runbook (artifact layout, service units, TLS binds, backup, upgrades,
qualification) is
[docs/STANDALONE_SERVER.md](https://github.com/Porabuild/Poracode/blob/main/docs/STANDALONE_SERVER.md).
