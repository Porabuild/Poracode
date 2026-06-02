# @lightcode/agents-usage

Cross-platform usage & quota collection for AI coding agents — a runtime-agnostic
core that fetches session/weekly/monthly utilization, reset timers, plan tier,
and (optionally) estimated cost for providers like **Claude**, **Codex**, and
**GitHub Copilot**.

This package powers Lightcode's in-app usage tracking and is designed to be a
Windows-first, cross-platform alternative to mac-only tools like
[codexbar](https://github.com/steipete/codexbar) and
[openusage](https://github.com/robinebers/openusage).

## Design

The package is **pure and portable**: it imports no `electron`, no native
modules, no React, and no Node built-ins directly. Every side effect (HTTP,
credential reads, the clock) is supplied by the caller through an injected
`HostPort`. The host decides _where_ credentials live (a creds file, the Windows
Credential Manager, an env var, or a WSL distro over UNC); each collector only
knows the provider's API and how to parse its response.

```ts
import { createUsageCollectorRegistry } from "@lightcode/agents-usage";

const registry = createUsageCollectorRegistry();
const snapshots = await registry.collectAll(["claude", "codex", "copilot"], host);
```

A collector never reads files or opens sockets itself, which is what keeps it
testable (fixture in, snapshot out) and safe to bundle into both a Node process
and a browser renderer (where only the pure formatters are used).

## Security

Captured tokens and cookies are sensitive secrets. This package:

- never logs credential material,
- never persists credentials (the host owns storage),
- never opens a local HTTP server (unlike openusage's unauthenticated
  `127.0.0.1:6736` endpoint, which leaks usage to any visited website).

## Status

Workspace-internal (`workspace:*`) while the API stabilizes. A `dist` build
(CJS + ESM + `.d.ts`) and semver release will be added before publishing to npm.

> The provider usage endpoints are private/undocumented and pin client version
> headers that rot over time. See `src/clientVersions.ts` — bump there when a
> provider starts rejecting requests.
