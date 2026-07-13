# Create Project — Design

Date: 2026-06-08
Status: **Implemented** — shipped in PR #149 (commit `5927b617`); the repo-clone flow was added later in PR #167. The sections below have been reconciled with the shipped code (see notes inline where the implementation diverged from the original design).

## Goal

Implement a unified "create project" flow with:

- A `+` menu offering **Start from scratch**, **Clone a repository**, and **Use an existing folder**.
- A runtime picker for **Native / WSL** (WSL shown only when distros exist).
- A folder picker whose default is preselected as **last-used → home**, scoped **per runtime**.

## Decisions (confirmed)

- **Start from scratch** = name the project → pick runtime + parent folder (in a custom modal) → create `<parent>/<name>` on disk (`mkdir`) → open it as the new project.
- **Use an existing folder** = opens the **native OS folder picker directly** (no custom modal), exactly like the original flow → opens the chosen directory as a project. The picked path is authoritative for the runtime (a `\\wsl...` path → WSL project, else native). The dialog opens at the last-used native directory → home.
- **Runtime picker** lives in the scratch modal only (the OS dialog cannot host a Native/WSL toggle); for existing folders the runtime is inferred from the picked path.
- **Last-used directory** is remembered **per runtime** (`"native"` or the WSL distro name), falling back to that runtime's home.
- Both the sidebar `+` and the `WelcomeOverlay` CTA route through the same flow (default decision for consistency).

## Current state (baseline)

- `SidebarHeaderControls.tsx`: `FolderPlus` button. Windows → dropdown ("Add Windows Project" / "Add WSL Project"); macOS/Linux → direct `pickFolder()`. Flow: `pickFolder()` → `addProject(location)` → `autoDetectSetupScript` → `openDraft`.
- `WelcomeOverlay.tsx`: "Add Project" → `pickFolder()` → `addProject`.
- `projectSlice.addProject(location, nameOverride?)` — `nameOverride` exists but is unused.
- `ProjectLocation` (`src/shared/contracts/common.ts`): discriminated union `windows | wsl | posix`.
- Helpers (`src/shared/wsl.ts`): `parseWslUncPath`, `getProjectName`, `toWslUncPath`, `getProjectFsPath`.
- IPC: `pickFolder(defaultPath?)`, `listWslDistros()` already exist (`procedures/app.ts`, `localHandlers.ts`).
- Settings: JSON at `~/.poracode/settings.json`; renderer store `sharedSettingsStore.ts`; schema `src/shared/settings.ts`. At design time: no last-used directory persisted, no create-directory IPC.

This section captures the **pre-implementation baseline**. All of the targets below — the "Start from scratch" / "Use an existing folder" menu, the "Name project" modal, per-runtime last-used-dir persistence (`lastUsedProjectDirs`), and the `createProjectDirectory` IPC — have since shipped.

## Architecture

### Entry points

- Sidebar `+` (`SidebarHeaderControls`) and the `WelcomeOverlay` CTA both render `CreateProjectMenu` (three items: Start from scratch / Clone a repository / Use an existing folder).
- "Start from scratch" → `panelStore.openCreateProjectModal()` (the scratch modal, mounted once in `AppOverlays`).
- "Clone a repository" → `panelStore.openCloneProjectModal()` → `CloneProjectModal` (GitHub-account browse + paste-a-URL modes; `cloneRepo` IPC). Added after the original design — see Out of scope note.
- "Use an existing folder" → `addExistingProject()` → native `pickFolder` → create project. No modal.

### `CreateProjectModal` (scratch only)

HeroUI `Modal` (mirrors `CreatePrModal`). The modal is **scratch-only** — there is no `mode` toggle and no "existing folder" variant (the existing-folder path bypasses this modal entirely, as above). Fields as shipped:

- **Runtime selector** — visible only when WSL distros exist. Options: `Native` + one per distro. Hidden on macOS/Linux (runtime = `posix`). Changing it re-resolves the default location.
- **Location** (read-only path, label "Location", + **Browse** → `pickFolder(defaultPath)`):
  - Default on open / runtime change: `lastUsedProjectDirs[runtimeKey]` → else runtime home (`homeDir` native; `\\wsl.localhost\<distro>\home` for WSL).
- **Name** (text input, label "Project name", placeholder "New project"): required; legal single path segment.
- **Footer**: Cancel / **Create project**. The create button is disabled until valid; the modal shows a live preview of the final path.

`runtimeKey` = `"native"` for windows/posix native, else the distro name.

### Save behavior

1. Derive `ProjectLocation` from the final path (`deriveLocationFromPath`): `parseWslUncPath` succeeds → `wsl`; else `isWindows()` → `windows`; else `posix`. The picked path is authoritative.
2. scratch: `createProjectDirectory({ parent, name, kind })` → returns created absolute path → derive location from it.
3. `addProject(location, name)` → `autoDetectSetupScript(project)` → `openDraft(project.id)`.
4. `setLastUsedProjectDir(runtimeKey, parentDir)` where `parentDir` is the directory the user browsed (scratch: the parent field; existing: `dirname(folder)`).
5. Guards (inline modal errors, not silent fallbacks): scratch+WSL requires a `\\wsl...` parent; scratch+native rejects a WSL UNC parent.

### Persistence & IPC

- `sharedSettingsSchema` + `defaultSharedSettings`: add `lastUsedProjectDirs: Record<string,string>` (default `{}`).
- `sharedSettingsStore`: add `setLastUsedProjectDir(runtimeKey, dir)` mirroring `pushRecentModel` (merge → `persistSettings`).
- Native home: reuse the existing `getHomeScopeLocation()` IPC (cached via `loadHomeScopeLocation()`) — no preload change needed. WSL home is `\\wsl.localhost\<distro>\home`.
- New main-local IPC `createProjectDirectory` (`procedures/app.ts` + `localHandlers.ts`): `{ parent, name, kind }` → `{ path }`. `path.win32.join` for windows/wsl, `path.posix.join` for posix; refuses to clobber an existing folder; non-recursive `mkdir` so a missing parent is reported; maps common `errno` codes (EACCES/ENOSPC/ENOENT/…) to user-grade messages.
- Reuse `pickFolder`, `listWslDistros`, `parseWslUncPath`, `getProjectName`.

### State / components / files

- `panelStore`: separate boolean flags `createProjectModalOpen` / `cloneProjectModalOpen`, each with no-arg openers/closers (`openCreateProjectModal()` / `closeCreateProjectModal()` / `openCloneProjectModal()` / `closeCloneProjectModal()`). There is no `{ open, mode }` object or `mode` argument — scratch and clone are distinct modals.
- New files: `CreateProjectMenu`, `CreateProjectModal`, `CloneProjectModal`, the flow module `src/renderer/actions/createProjectActions.ts`, and pure helpers in `src/shared/createProject.ts` (`deriveLocationFromPath`, `validateProjectName`, `buildScratchTargetPath`). (Implemented as an actions module + shared helpers, not the originally-proposed `useCreateProjectFlow` hook.)
- Edits: `SidebarHeaderControls.tsx`, `WelcomeOverlay.tsx`, `settings.ts`, `sharedSettingsStore.ts`, preload + bridge type, IPC procedure map + handler, `AppOverlays`.

## Testing (TDD)

- Pure unit: `deriveLocationFromPath` (UNC→wsl / win→windows / posix), legal-name validation, scratch target-path build, runtime/parent mismatch guards.
- Settings store: `setLastUsedProjectDir` merge + persist.
- Main handler: `createProjectDirectory` mkdir + conflict error.
- Component: `CreateProjectModal` — Save gating, runtime-selector visibility, scratch path preview.

## Out of scope

- ~~Cloning a repo from a URL.~~ — was out of scope at design time, but later **shipped** (`CloneProjectModal` with GitHub + URL modes, `cloneRepo` IPC → `git clone` / `gh repo clone`).
- Multi-folder / monorepo workspace projects.
- Renaming/migrating existing projects' runtimes.
