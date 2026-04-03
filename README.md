<p align="center">
  <img src="build/icons/png/128x128.png" alt="Lightcode" />
</p>

<h1 align="center">Lightcode</h1>

<p align="center">
  A desktop app for running AI coding agents — Claude, Codex, and Gemini — in real terminal sessions.
</p>

<p align="center">
  <a href="https://github.com/nicepkg/lightcode/releases">Download</a> · <a href="https://github.com/nicepkg/lightcode/issues">Report Bug</a> · <a href="https://github.com/nicepkg/lightcode/issues">Request Feature</a>
</p>

---

## What is Lightcode?

Lightcode gives you one window to manage multiple AI coding agents. Each agent runs in a real terminal (PTY) — what you see is exactly what the agent sees. Switch between Claude, Codex, and Gemini without juggling terminal tabs.

## Features

- **Multi-agent** — Run Claude Code, OpenAI Codex, and Gemini CLI side by side
- **Real terminals** — Every agent session is a live PTY, not a simulated UI
- **Git review** — View diffs, stage files, and commit without leaving the app
- **Built-in shell** — Open terminal tabs alongside your agent sessions
- **Project management** — Organize threads by project and workspace
- **WSL support** — Work with both Windows and Linux projects seamlessly
- **Auto-update** — Get new versions automatically

## Install

Download the latest release for your platform:

| Platform | Format                                                          |
| -------- | --------------------------------------------------------------- |
| Windows  | [NSIS installer](https://github.com/nicepkg/lightcode/releases) |
| macOS    | DMG (Universal)                                                 |
| Linux    | AppImage, .deb                                                  |

### Prerequisites

You need at least one AI agent CLI installed:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — `npm install -g @anthropic-ai/claude-code`
- [OpenAI Codex](https://github.com/openai/codex) — `npm install -g @openai/codex`
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) — `npm install -g @google/gemini-cli`

## Development

Requires **Node.js >= 24.10** and **pnpm 10.30+**.

```bash
# Clone and install
git clone https://github.com/nicepkg/lightcode.git
cd lightcode
pnpm install
pnpm run setup:native

# Start dev mode
pnpm run dev

# Build for distribution
pnpm run build
pnpm run dist:win    # Windows
pnpm run dist:mac    # macOS
pnpm run dist:linux  # Linux
```

### Scripts

| Command              | Description               |
| -------------------- | ------------------------- |
| `pnpm run dev`       | Start in development mode |
| `pnpm run build`     | Production build          |
| `pnpm run dist`      | Package for all platforms |
| `pnpm run typecheck` | Type checking             |
| `pnpm run lint`      | Linting                   |
| `pnpm run fmt`       | Code formatting           |
| `pnpm run test`      | Run tests                 |

## Tech Stack

Electron · React · TypeScript · Tailwind CSS · HeroUI v3 · Zustand · xterm.js · SQLite · node-pty

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
