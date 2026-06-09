# Create Project — Design

Date: 2026-06-08

## Goal

Implement a unified "create project" flow with:

- A `+` menu offering **Start from scratch** and **Use an existing folder**.
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
- Settings: JSON at `~/.lightcode/settings.json`; renderer store `sharedSettingsStore.ts`; schema `src/shared/settings.ts`. **No last-used directory persisted today.** **No create-directory IPC today.**

The screenshots' "Start from scratch" / "Use an existing folder" menu and "Name project" modal do **not** exist in code yet — they are the target.

## Architecture

### Entry points

- Sidebar `+` (`SidebarHeaderControls`) and the `WelcomeOverlay` CTA both render `CreateProjectMenu` (two items).
- "Start from scratch" → `panelStore.openCreateProjectModal()` (the scratch modal, mounted once in `AppOverlays`).
- "Use an existing folder" → `addExistingProject()` → native `pickFolder` → create project. No modal.

### `CreateProjectModal` (scratch only)

HeroUI `Modal` (mirrors `CreatePrModal`). Fields:

- **Runtime selector** — visible only when WSL distros exist. Options: `Native` + one per distro. Hidden on macOS/Linux (runtime = `posix`). Changing it re-resolves the default location.
- **Location** (read-only path + **Browse** → `pickFolder(defaultPath)`):
  - scratch: "Parent folder".
  - existing: "Folder".
  - Default on open / runtime change: `lastUsedProjectDirs[runtimeKey]` → else runtime home (`homeDir` native; `\\wsl.localhost\<distro>\home` for WSL).
- **Name** (text input, placeholder "New project"):
  - scratch: required; legal single path segment.
  - existing: prefilled with basename of picked folder; editable; display-name only.
- **Footer**: Cancel / Save. Save disabled until valid. Scratch shows a live preview of the final path.

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

- `panelStore`: `createProjectModal: { open, mode }` + `openCreateProject(mode)` / `closeCreateProject()`.
- New files: `CreateProjectMenu`, `CreateProjectModal`, `useCreateProjectFlow` controller (with pure `deriveLocationFromPath`, name validation, target-path build).
- Edits: `SidebarHeaderControls.tsx`, `WelcomeOverlay.tsx`, `settings.ts`, `sharedSettingsStore.ts`, preload + bridge type, IPC procedure map + handler, `AppOverlays`.

## Testing (TDD)

- Pure unit: `deriveLocationFromPath` (UNC→wsl / win→windows / posix), legal-name validation, scratch target-path build, runtime/parent mismatch guards.
- Settings store: `setLastUsedProjectDir` merge + persist.
- Main handler: `createProjectDirectory` mkdir + conflict error.
- Component: `CreateProjectModal` — Save gating, runtime-selector visibility, scratch path preview.

## Out of scope

- Cloning a repo from a URL.
- Multi-folder / monorepo workspace projects.
- Renaming/migrating existing projects' runtimes.
