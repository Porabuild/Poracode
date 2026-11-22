# Android Design System & Adaptive Architecture

This document is the authoritative design and layout specification for the native
Jetpack Compose Android client (`android/`). It fuses **Material 3 / Material 3
Expressive** layout, spacing, and interaction grammar with **Poracode's neutral,
developer-focused visual tokens** (Geist / Geist Mono typography, Lucide line
icons, Soft Hairline content surfaces, and PWA/custom theme presets).

Android matches the **capabilities and information architecture** of the desktop
PWA and iOS/iPad/Duo clients, expressed in an **unmistakably Android idiom** —
never by cloning iOS Liquid Glass capsules, SF Symbols, or iOS sheet chrome, and
never by falling back to stock wallpaper-tinted Material You defaults.

## 1. Breakpoints & Canonical Layouts (Material 3 WindowSizeClass)

Use `currentWindowAdaptiveInfoV2()` + live container constraints (`BoxWithConstraints`).
Never branch on device model names or lock orientation to portrait.

| Breakpoint     | Width (dp)   | Typical Android Form Factors                                                     | Home Layout                                                                                                                                          | Thread Inspector                                                                                  | Settings / Projects / Hosts                                |
| -------------- | ------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Compact**    | `< 600dp`    | Portrait phones, folded outer screen                                             | Single-pane list + floating bottom action bar (`16dp` margins)                                                                                       | Compact runtime dock + bottom sheets                                                              | Single-pane push stack (`16dp` margins)                    |
| **Medium**     | `600–839dp`  | Foldables unfolded (portrait/square), portrait tablets                           | Full-width canvas (`24dp` margins) + Material 3 modal navigation drawer (`<= 320dp`, `24dp` trailing corners); or hinge-docked split in Book posture | Toggleable Material 3 modal side sheet (`340–380dp`, `24dp` leading corners)                      | Single-pane (`< 720dp`) or two-pane (`>= 720dp`)           |
| **Expanded**   | `840–1199dp` | Landscape tablets, wide unfolded foldables, phone landscape (if height >= 480dp) | Collapsible, draggable-resizable docked sidebar (`280–340dp`, range `240–400dp`) + flexible detail pane (`24dp` margins)                             | Docked standard side sheet (`320–400dp`) when detail width `>= 800dp`; modal side sheet otherwise | Two-pane split (`280dp` nav + `max 720dp` centered detail) |
| **Large / XL** | `>= 1200dp`  | Large tablets (12–14"), Android desktop / DeX                                    | Docked resizable sidebar (`300–340dp`) + centered chat measure (`max 840dp`) + docked resizable inspector (`340–400dp`)                              | Docked standard side sheet with drag handle pill                                                  | Two-pane split (`300dp` nav + `max 760dp` centered detail) |

### Foldable Posture Rules

- **Vertical Separating Hinge (Book Mode):** When `windowPosture.hingeList` reports
  a vertical separating hinge with `leading >= 240dp` and `trailing >= 380dp`, dock
  the sidebar on the leading pane, reserve the exact hinge width as a neutral
  gutter, and render the detail canvas on the trailing pane.
- **Large Font Accessibility (`fontScale >= 1.5f`):** Prefer modal overlay drawers
  and side sheets instead of cramped multi-column panes.

## 2. Baseline Grid, Spacing & Sizing Scale (4dp / 8dp Grid)

Every spacing, padding, radius, and height token sits strictly on the Android
4dp/8dp grid:

| Token                | Value   | Usage                                                                                                                                             |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pageInlineCompact`  | `16.dp` | Leading/trailing screen margin on Compact (`< 600dp`)                                                                                             |
| `pageInlineExpanded` | `24.dp` | Leading/trailing canvas margin on Medium / Expanded / Large (`>= 600dp`)                                                                          |
| `paneInline`         | `12.dp` | Horizontal inset inside narrow sidebars (`240–340dp`) and inspectors (`320–400dp`)                                                                |
| `sectionGap`         | `16.dp` | Vertical gap between cards / sections                                                                                                             |
| `cardPadding`        | `12.dp` | Inner padding of `PoracodeCard` (`16.dp` on spacious overview cards)                                                                              |
| `rowGap`             | `6.dp`  | Vertical gap between sibling list rows (`8.dp` in spacious grids)                                                                                 |
| `headerHeight`       | `52.dp` | Top app bar height (`48.dp` in compact height `<= 480dp`)                                                                                         |
| `tapTarget`          | `48.dp` | Minimum interactive hit area (44dp minimum inside dense toolbars)                                                                                 |
| `controlHeight`      | `36.dp` | Compact visual height for inline tonal buttons, search fields, segmented controls, and pickers (wrapped in >= 44–48dp hit target when standalone) |
| `iconSize`           | `18.dp` | Primary toolbar / nav icon (`16.dp` inline meta/row icon, `20.dp` back chevron)                                                                   |

### Corner Radius Scale (`PoracodeRadius`)

- `small = 6.dp` — badges, small inline chips, status pills
- `contentSurface = 10.dp` — unified `PoracodeCard`, `PoracodeListRow`, `PoracodeNavRow`
- `control = 12.dp` — search fields, text fields, tonal action buttons, workspace selector, drawer nav active pill, docked tab active pill
- `pane = 16.dp` — full-height rounded Material 3 multi-pane containers (`PoracodePaneContainer`) sitting inside the tonal shell
- `composer = 20.dp` — chat composer container
- `sheet = 24.dp` — Material 3 bottom sheets, modal navigation drawers, modal side sheets, centered modal cards

## 3. Tonal Surface Hierarchy (Desktop-Aligned Elevation Ladder)

Multi-pane Android layouts follow Poracode Desktop's Moonlight dark and Light
surface tokens from `src/renderer/styles.css` (while Compact phone screens keep
OLED-friendly `colors.background`), using full-height `16dp` rounded panes and
divider-free gutters:

| Role (`PoracodeColors`) | Default Dark (Moonlight)                                 | Default Light                                                  | Usage                                                                                                  |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `paneShell`             | `~#07070A` (Desktop `--background`)                      | `#ECECEF` (`surfaceTertiary` / Desktop `--sidebar-background`) | Outer multi-pane window shell & left navigation rail                                                   |
| `paneSurface`           | `#0E0E14` (`surface` / Desktop `--surface`)              | `#FAFAFB` (`surface`)                                          | Full-height `16dp` rounded panes (`PoracodePaneContainer`: Overview, Chat, Inspector, Settings Detail) |
| `paneCard`              | `#1B1B20` (`listRow` / Desktop `--content-surface-fill`) | `#F0F0F2` (`surfaceSecondary`)                                 | Framed `PoracodeCard` blocks & composer inside panes                                                   |
| `paneControl`           | `#242429` (`default` / Desktop `--default`)              | Softened `default`                                             | Tonal buttons, icon buttons, segmented tracks                                                          |

Custom themes and non-default presets (Dracula, Nord, Catppuccin, Solarized, etc.)
flow through `sidebarBackground`, `background`, `surface`, `listRow`, and `default`
automatically. Accent (`colors.accent` / `colors.accentSoft`) remains strictly
reserved for semantic opt-ins.

## 4. Compositional Layout & Component Vocabulary (`ui/components/`)

> **Rule**: Every Android split screen must consume the shared posture (`rememberBookHingeSplit` / `HomeAdaptiveLayoutPolicy`) and `fontScale` (`< 1.5f`) policy so Book/Tabletop hinges and large-font fallbacks work consistently. Width-only `Row` splits are not allowed.

Every screen composes from one shared set of base layout and surface primitives
— never hand-roll split shells, pane headers, modal side drawers, or cards twice:

| Component                    | Role                                                                                                                              | Replaces / Bans                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `PoracodeAdaptiveSplitShell` | Single multi-pane shell (`paneShell`, docked/overlay sidebar, resize gutter or Book-hinge gap, safe-area `PoracodePaneContainer`) | Per-screen hand-rolled split `Row` + scrim + drawer boilerplate                |
| `PoracodePaneContainer`      | Full-height `16dp` rounded pane (`paneSurface`) inside multi-pane shells                                                          | Square cut-off detail panes & hard `1dp` dividers                              |
| `PoracodePaneHeader`         | Unified `52dp` pane header (optional leading, semantic heading title, trailing actions)                                           | Ad-hoc top `Row` headers in sidebars, inspectors, and nested editors           |
| `PoracodeModalSideOverlay`   | Animated M3 leading drawer / trailing side sheet (`24dp` inner corners, scrim, predictive back)                                   | Hand-rolled `AnimatedVisibility` + `Surface` overlays                          |
| `rememberBookHingeSplit`     | Shared `currentWindowAdaptiveInfoV2()` Book-posture vertical hinge split                                                          | Per-screen `windowPosture.hingeList` math                                      |
| `PoracodeCenteredDetail`     | Centered reading-measure wrapper (`maxWidth = 720dp`) inside detail panes                                                         | Ad-hoc `Box(Alignment.TopCenter)` + `widthIn` wrappers                         |
| `PoracodeCard`               | Single Soft Hairline framed card (`10dp` radius, `paneCard`, `1dp hairlineSoft`, `12dp` padding)                                  | Raw `OutlinedCard`, `Card`, ad-hoc rounded boxes in Inspector & Settings       |
| `PoracodeActionButton`       | Compact Android-proportioned button (`38dp` height, `12dp` radius, Tonal / Outlined / PrimaryNeutral / Danger)                    | Oversized full-width stadium `Button` / `OutlinedButton` / `FilledTonalButton` |
| `PoracodeDrawerNavItem`      | Flat M3 split-sidebar navigation row (transparent at rest, `12dp` tonal active pill)                                              | Stacked boxed rows inside split sidebars                                       |
| `PoracodeSwitch`             | Compact, cleanly proportioned theme-accent switch (`PoracodeSwitch` only)                                                         | Raw Material `Switch` (enforced by `NeutralAccentGateTest`)                    |
| `PoracodeInlineSearchField`  | Flat tonal `38dp` search field (`12dp` radius, `fieldBackground` fill)                                                            | iOS-style floating glass capsule search fields in sidebars                     |
| `PoracodeDockedBar`          | Divider-free docked tonal action/tab bar inside sidebars & inspectors                                                             | iOS `PoracodePanelControlStrip` floating glass pills                           |
| `PoracodePanelResizeHandle`  | Divider-free `12dp` gutter with centered Material 3 drag pill (`3dp x 28dp`)                                                      | Hard full-height `1dp` vertical divider rules                                  |
| `PoracodeSheet`              | Material 3 bottom sheet (`24dp` top corners, `36x4dp` drag handle, `16dp` margins)                                                | Raw `ModalBottomSheet`                                                         |

## 5. Side-by-Side Parity Audit (Apple iPhone/Duo/iPad vs Android)

| Surface                            | Apple Reference (iPhone / Duo / iPad)                                                                                                            | Android Target (Material 3 + Poracode)                                                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phone Home**                     | Wordmark + filter, flat active list, Active/Done in filter sheet, bottom glass dock (Search + Compose pill + More)                               | 52dp header (`16dp` margins), `PoracodeListRow` cards (`6dp` gap), Active/Done + project filter sheet, compact floating M3 action bar (`Search` + `Plan, ask, build…` + `More`)                                                                                                          |
| **Foldable Inner (`Medium`)**      | Full-width Workspace Overview / Chat + toggleable overlay sidebar & overlay inspector                                                            | Full-width canvas (`24dp` margins), Material 3 modal nav drawer (`24dp` trailing corners) & modal inspector side sheet (`24dp` leading corners), hinge-aware Book split                                                                                                                  |
| **Tablet Landscape (`Expanded+`)** | Docked resizable sidebar (Search, New, Active + Done, Usage rail, Workspace picker, Footer strip) + Overview / Chat + Docked resizable Inspector | Docked resizable sidebar (`colors.surface`, flat `12dp` search + compact tonal `+` button, Active + Done, Usage rail, `12dp` Workspace selector, docked footer bar) + balanced Overview (compact `New thread` button + 2-col Projects & Recent Threads) + 3-pane Chat + Docked Inspector |
| **Thread Inspector**               | Collapsible Thread Info, Context, Usage, Media Gallery, Tasks, Steer, Checkpoints, Files, Git, Terminal, Notes, Browser, Ports                   | Unified `PoracodeCard` stack in Info tab (no rogue `FilterChip` or stadium `OutlinedButton`), docked Material 3 bottom tab bar with `12dp` active pill + Expand button                                                                                                                   |
| **Settings & Themes**              | Split Settings on iPad, Custom Themes editor with live preview & contrast, Release Notes (cached), Configurable Shortcuts, Workspaces            | Two-pane Split Settings (`>= 760dp`), unified `PoracodeCard` + compact `PoracodeActionButton` + refined `PoracodeSwitch`, Custom Theme Editor (flush nested header, compact swatch hex fields, live preview, WCAG contrast), cached Release Notes, Workspace Manager                     |
